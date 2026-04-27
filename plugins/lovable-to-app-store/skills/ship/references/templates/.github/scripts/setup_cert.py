#!/usr/bin/env python3
"""
App Store Connect certificate + provisioning profile bootstrap.
FROZEN — identical across all apps shipped with this plugin. Do not modify.

Reads env vars: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_CONTENT, CERT_PASS,
                APPLE_TEAM_ID, BUNDLE_ID
Writes: /tmp/dist.p12, /tmp/dist.mobileprovision
Sets:   PROFILE_UUID in $GITHUB_ENV
"""

import os, sys, time, json, base64, subprocess, re
import requests
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12


# ── JWT auth ──────────────────────────────────────────────────────────────────

def make_jwt(key_id, issuer_id, key_content):
    import jwt as pyjwt
    payload = {
        'iss': issuer_id,
        'exp': int(time.time()) + 1200,
        'aud': 'appstoreconnect-v1'
    }
    return pyjwt.encode(payload, key_content, algorithm='ES256',
                        headers={'kid': key_id, 'typ': 'JWT'})


def asc_headers(key_id, issuer_id, key_content):
    token = make_jwt(key_id, issuer_id, key_content)
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


# ── CSR generation ────────────────────────────────────────────────────────────

def generate_csr():
    """Returns (private_key_pem_bytes, csr_pem_str)."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, 'CI Build'),
            x509.NameAttribute(NameOID.EMAIL_ADDRESS, 'ci@build.local'),
            x509.NameAttribute(NameOID.COUNTRY_NAME, 'US'),
        ]))
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    )
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode()
    return key_pem, csr_pem


# ── App Store Connect API calls ───────────────────────────────────────────────

BASE = 'https://api.appstoreconnect.apple.com/v1'


def create_certificate(headers, csr_pem):
    r = requests.post(f'{BASE}/certificates', headers=headers, json={
        'data': {
            'type': 'certificates',
            'attributes': {
                'certificateType': 'IOS_DISTRIBUTION',
                'csrContent': csr_pem
            }
        }
    })
    r.raise_for_status()
    data = r.json()['data']
    cert_content = data['attributes']['certificateContent']
    cert_id = data['id']
    print(f'Created certificate: {cert_id}')
    return cert_id, base64.b64decode(cert_content)


def get_or_create_profile(headers, bundle_id, cert_id, team_id):
    # List existing profiles
    r = requests.get(
        f'{BASE}/profiles?filter[profileType]=IOS_APP_STORE'
        f'&filter[name]={bundle_id.replace(".", "%2E")}&limit=20',
        headers=headers
    )
    r.raise_for_status()
    profiles = r.json().get('data', [])

    active = [p for p in profiles
              if p['attributes']['profileState'] == 'ACTIVE']

    if active:
        p = active[0]
        uuid_match = re.search(
            rb'<key>UUID</key>\s*<string>([0-9A-Fa-f-]+)</string>',
            base64.b64decode(p['attributes']['profileContent'])
        )
        uuid = uuid_match.group(1).decode() if uuid_match else p['attributes'].get('uuid', '')
        print(f'Reusing existing profile: {p["id"]} UUID={uuid}')
        return uuid, p['attributes']['profileContent']

    # Create new profile
    app_id = _find_app_id(headers, bundle_id)
    if not app_id:
        print(f'ERROR: No App ID found for bundle {bundle_id}. Register it in Apple Developer Portal first.')
        sys.exit(1)

    r = requests.post(f'{BASE}/profiles', headers=headers, json={
        'data': {
            'type': 'profiles',
            'attributes': {
                'name': f'{bundle_id} AppStore',
                'profileType': 'IOS_APP_STORE',
            },
            'relationships': {
                'bundleId': {'data': {'type': 'bundleIds', 'id': app_id}},
                'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]},
                'devices': {'data': []},
            }
        }
    })
    if not r.ok:
        print(f'Create profile failed {r.status_code}: {r.text}')
        r.raise_for_status()
    p = r.json()['data']
    content_b64 = p['attributes']['profileContent']
    profile_content = base64.b64decode(content_b64)
    uuid_match = re.search(
        rb'<key>UUID</key>\s*<string>([0-9A-Fa-f-]+)</string>',
        profile_content
    )
    uuid = uuid_match.group(1).decode() if uuid_match else p['attributes'].get('uuid', '')
    print(f'Created profile: {p["id"]} UUID={uuid}')
    return uuid, content_b64


def _find_app_id(headers, bundle_id):
    r = requests.get(f'{BASE}/bundleIds?filter[identifier]={bundle_id}', headers=headers)
    r.raise_for_status()
    items = r.json().get('data', [])
    return items[0]['id'] if items else None


# ── Build .p12 ────────────────────────────────────────────────────────────────

def build_p12(cert_der_bytes, private_key_pem, password: str) -> bytes:
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    cert = x509.load_der_x509_certificate(cert_der_bytes)
    key = load_pem_private_key(private_key_pem, password=None)
    return pkcs12.serialize_key_and_certificates(
        name=b'dist',
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode())
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    key_id      = os.environ['ASC_KEY_ID']
    issuer_id   = os.environ['ASC_ISSUER_ID']
    key_content = os.environ['ASC_KEY_CONTENT']
    cert_pass   = os.environ['CERT_PASS']
    team_id     = os.environ['APPLE_TEAM_ID']
    bundle_id   = os.environ['BUNDLE_ID']

    # Install PyJWT if needed
    try:
        import jwt
    except ImportError:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'PyJWT[crypto]',
                               '--break-system-packages', '-q'])
        import jwt  # noqa: F811

    headers = asc_headers(key_id, issuer_id, key_content)

    print('Generating CSR...')
    private_key_pem, csr_pem = generate_csr()

    print('Creating distribution certificate via ASC API...')
    cert_id, cert_der = create_certificate(headers, csr_pem)

    print('Getting/creating App Store provisioning profile...')
    profile_uuid, profile_content_b64 = get_or_create_profile(
        headers, bundle_id, cert_id, team_id)

    print('Building .p12...')
    p12_bytes = build_p12(cert_der, private_key_pem, cert_pass)

    with open('/tmp/dist.p12', 'wb') as f:
        f.write(p12_bytes)
    with open('/tmp/dist.mobileprovision', 'wb') as f:
        f.write(base64.b64decode(profile_content_b64))

    print(f'PROFILE_UUID={profile_uuid}')
    print('Written /tmp/dist.p12 and /tmp/dist.mobileprovision')

    github_env = os.environ.get('GITHUB_ENV', '')
    if github_env:
        with open(github_env, 'a') as f:
            f.write(f'PROFILE_UUID={profile_uuid}\n')


if __name__ == '__main__':
    main()
