# GitHub Actions CI — Automated iOS Signing and TestFlight Upload

This is the recommended build path for all Capacitor apps with RevenueCat (or any Swift Package Manager dependencies). It uses the App Store Connect API to programmatically create a distribution certificate and provisioning profile on every run — no manual cert management, no expiry headaches.

---

## Two Files to Commit

Commit these two files to the repo before the first CI run:

1. `.github/workflows/ios-testflight.yml` — the workflow
2. `.github/scripts/setup_cert.py` — handles cert/profile creation via ASC API

---

## File 1: `.github/workflows/ios-testflight.yml`

```yaml
name: iOS Build & TestFlight

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-ios:
    # macos-15 + latest-stable Xcode required for iOS 26 SDK.
    # Apple requires all new submissions to use the iOS 26 SDK after April 28, 2026.
    # Do NOT use macos-latest — it may resolve to macos-14 (Xcode 15), missing iOS 26 SDK.
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode 26
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build web app
        run: npm run build

      - name: Sync Capacitor
        run: npx cap sync ios

      - name: Install CocoaPods
        run: cd ios/App && pod install --repo-update

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Python deps
        run: pip install requests cryptography pillow --break-system-packages

      - name: Generate iOS icon set and splash imageset
        run: |
          python3 - << 'HEREDOC'
          import json, os
          from PIL import Image

          ICON_SRC   = 'assets/icon-1024.png'
          SPLASH_SRC = 'assets/splash-2732.png'
          ICON_DIR   = 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
          SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset'

          ICON_SIZES = [
              ('iphone',  '20x20',     2), ('iphone',  '20x20',     3),
              ('iphone',  '29x29',     2), ('iphone',  '29x29',     3),
              ('iphone',  '40x40',     2), ('iphone',  '40x40',     3),
              ('iphone',  '60x60',     2), ('iphone',  '60x60',     3),
              ('ipad',    '20x20',     1), ('ipad',    '20x20',     2),
              ('ipad',    '29x29',     1), ('ipad',    '29x29',     2),
              ('ipad',    '40x40',     1), ('ipad',    '40x40',     2),
              ('ipad',    '76x76',     1), ('ipad',    '76x76',     2),
              ('ipad',    '83.5x83.5', 2),
          ]

          os.makedirs(ICON_DIR, exist_ok=True)
          if not os.path.exists(ICON_SRC):
              print(f'ERROR: {ICON_SRC} not found. Commit assets/icon-1024.png to the repo.')
              raise SystemExit(1)

          src = Image.open(ICON_SRC).convert('RGBA')
          images_entries = []

          for idiom, size_str, scale in ICON_SIZES:
              base = float(size_str.split('x')[0])
              px = int(base * scale)
              filename = f'Icon-{size_str}@{scale}x.png'
              resized = src.resize((px, px), Image.LANCZOS)
              bg = Image.new('RGB', (px, px), (255, 255, 255))
              bg.paste(resized, mask=resized.split()[3])
              bg.save(os.path.join(ICON_DIR, filename))
              images_entries.append({
                  'filename': filename,
                  'idiom': idiom,
                  'scale': f'{scale}x',
                  'size': size_str
              })

          # CRITICAL: ios-marketing MUST be scale "1x" and size "1024x1024"
          # Xcode's default output uses scale "2x" / size "512x512" — Apple rejects that.
          marketing_file = 'Icon-1024x1024@1x.png'
          marketing_img = Image.new('RGB', (1024, 1024), (255, 255, 255))
          marketing_img.paste(src.convert('RGB'), mask=src.split()[3] if src.mode == 'RGBA' else None)
          src.convert('RGB').save(os.path.join(ICON_DIR, marketing_file))
          images_entries.append({
              'filename': marketing_file,
              'idiom': 'ios-marketing',
              'scale': '1x',
              'size': '1024x1024'
          })

          contents = {'images': images_entries, 'info': {'author': 'xcode', 'version': 1}}
          with open(os.path.join(ICON_DIR, 'Contents.json'), 'w') as f:
              json.dump(contents, f, indent=2)
          print(f'iOS icon set: {len(images_entries)} entries written to {ICON_DIR}')

          # Splash imageset
          if os.path.exists(SPLASH_SRC):
              os.makedirs(SPLASH_DIR, exist_ok=True)
              splash_src = Image.open(SPLASH_SRC).convert('RGB')
              for scale in [1, 2, 3]:
                  fname = f'splash@{scale}x.png'
                  splash_src.save(os.path.join(SPLASH_DIR, fname))
              splash_contents = {
                  'images': [
                      {'filename': 'splash@1x.png', 'idiom': 'universal', 'scale': '1x'},
                      {'filename': 'splash@2x.png', 'idiom': 'universal', 'scale': '2x'},
                      {'filename': 'splash@3x.png', 'idiom': 'universal', 'scale': '3x'},
                  ],
                  'info': {'author': 'xcode', 'version': 1}
              }
              with open(os.path.join(SPLASH_DIR, 'Contents.json'), 'w') as f:
                  json.dump(splash_contents, f, indent=2)
              print(f'Splash imageset written to {SPLASH_DIR}')
          else:
              print(f'WARNING: {SPLASH_SRC} not found — skipping splash imageset generation')
          HEREDOC

      - name: Create cert and provisioning profile
        id: cert
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_CONTENT: ${{ secrets.ASC_KEY_CONTENT }}
          CERT_PASS: ${{ secrets.CERT_PASS }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          BUNDLE_ID: com.{client}.{app}
        run: python3 .github/scripts/setup_cert.py

      - name: Force signing settings globally in pbxproj
        env:
          PROFILE_UUID: ${{ env.PROFILE_UUID }}
          BUNDLE_ID: com.{client}.{app}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          python3 - << 'HEREDOC'
          import re, os
          uuid = os.environ.get('PROFILE_UUID', '')
          bundle_id = os.environ.get('BUNDLE_ID', '')
          team_id = os.environ.get('APPLE_TEAM_ID', '')
          pbx = 'ios/App/App.xcodeproj/project.pbxproj'
          with open(pbx) as f:
              c = f.read()
          c = re.sub('CODE_SIGN_IDENTITY = "[^"]*";', 'CODE_SIGN_IDENTITY = "iPhone Distribution";', c)
          c = re.sub('CODE_SIGN_STYLE = [A-Za-z]+;', 'CODE_SIGN_STYLE = Manual;', c)
          if uuid:
              c = re.sub(r'\n[ \t]+PROVISIONING_PROFILE[^\n]*', '', c)
              c = c.replace(
                  f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
                  f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};\n\t\t\t\tPROVISIONING_PROFILE = "{uuid}";'
              )
          if team_id:
              c = re.sub(r'DEVELOPMENT_TEAM = [^;]*;', f'DEVELOPMENT_TEAM = {team_id};', c)
          with open(pbx, 'w') as f:
              f.write(c)
          import subprocess
          r = subprocess.run(['grep', '-nE', 'CODE_SIGN|PROVISIONING', pbx], capture_output=True, text=True)
          print(r.stdout)
          print('Signing settings applied globally.')
          HEREDOC

      - name: Import certificate to keychain
        env:
          CERT_PASS: ${{ secrets.CERT_PASS }}
        run: |
          security create-keychain -p "" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain
          security import /tmp/dist.p12 \
            -k build.keychain \
            -P "$CERT_PASS" \
            -A -T /usr/bin/codesign
          security set-key-partition-list \
            -S apple-tool:,apple: \
            -s -k "" build.keychain

      - name: Install provisioning profile
        run: |
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          cp /tmp/dist.mobileprovision \
            ~/Library/MobileDevice/Provisioning\ Profiles/${PROFILE_UUID}.mobileprovision

      - name: Archive
        run: |
          xcodebuild archive \
            -destination 'generic/platform=iOS' \
            -project ios/App/App.xcodeproj \
            -scheme App \
            -configuration Release \
            -archivePath /tmp/App.xcarchive \
            DEVELOPMENT_TEAM=${{ secrets.APPLE_TEAM_ID }}

      - name: Export IPA
        env:
          PROFILE_UUID: ${{ env.PROFILE_UUID }}
          BUNDLE_ID: com.{client}.{app}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          cat > /tmp/ExportOptions.plist << EOF
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0">
          <dict>
            <key>method</key>
            <string>app-store</string>
            <key>signingStyle</key>
            <string>manual</string>
            <key>teamID</key>
            <string>${APPLE_TEAM_ID}</string>
            <key>provisioningProfiles</key>
            <dict>
              <key>${BUNDLE_ID}</key>
              <string>${PROFILE_UUID}</string>
            </dict>
            <key>uploadBitcode</key>
            <false/>
            <key>compileBitcode</key>
            <false/>
          </dict>
          </plist>
          EOF
          xcodebuild -exportArchive \
            -archivePath /tmp/App.xcarchive \
            -exportPath /tmp/App-ipa \
            -exportOptionsPlist /tmp/ExportOptions.plist

      - name: Upload to TestFlight
        run: |
          xcrun altool --upload-app \
            -f "$(ls /tmp/App-ipa/*.ipa | head -1)" \
            -t ios \
            --apiKey ${{ secrets.ASC_KEY_ID }} \
            --apiIssuer ${{ secrets.ASC_ISSUER_ID }}

      - name: Upload cert info artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dist-cert-info
          path: /tmp/dist-cert-info.zip
          if-no-files-found: ignore
```

**Before committing:** replace `com.{client}.{app}` (appears 3 times) with the real bundle ID.

---

## File 2: `.github/scripts/setup_cert.py`

This script:
1. Authenticates to App Store Connect via JWT (ES256, your API key)
2. Creates a new iOS Distribution certificate (generates a fresh CSR each run)
3. Creates (or reuses) an App Store provisioning profile for your bundle ID
4. Writes `/tmp/dist.p12` and `/tmp/dist.mobileprovision` for the workflow steps to consume
5. Sets the `PROFILE_UUID` environment variable via `$GITHUB_ENV`

```python
#!/usr/bin/env python3
"""
App Store Connect certificate + provisioning profile bootstrap.
Reads:  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_CONTENT, CERT_PASS,
        APPLE_TEAM_ID, BUNDLE_ID  (all from environment)
Writes: /tmp/dist.p12, /tmp/dist.mobileprovision
Sets:   PROFILE_UUID in $GITHUB_ENV
"""

import os, sys, time, json, base64, subprocess, tempfile, re
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
    """Submit CSR and get back a signed distribution certificate."""
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
    cert_content = data['attributes']['certificateContent']  # base64 DER
    cert_id = data['id']
    print(f'Created certificate: {cert_id}')
    return cert_id, base64.b64decode(cert_content)


def get_or_create_profile(headers, bundle_id, cert_id, team_id):
    """
    Look for an existing valid App Store provisioning profile for bundle_id.
    If none exists, create one. Returns (profile_uuid, profile_content_base64).
    """
    # List existing profiles
    r = requests.get(f'{BASE}/profiles?filter[profileType]=IOS_APP_STORE'
                     f'&filter[name]={bundle_id.replace(".", "%2E")}&limit=20',
                     headers=headers)
    r.raise_for_status()
    profiles = r.json().get('data', [])

    active = [p for p in profiles
              if p['attributes']['profileState'] == 'ACTIVE'
              and p['attributes']['bundleId'] == bundle_id]  # may be empty

    if active:
        p = active[0]
        uuid_match = re.search(
            rb'<key>UUID</key>\s*<string>([0-9A-Fa-f-]+)</string>',
            base64.b64decode(p['attributes']['profileContent'])
        )
        uuid = uuid_match.group(1).decode() if uuid_match else p['attributes'].get('uuid', '')
        print(f'Reusing existing profile: {p["id"]} UUID={uuid}')
        return uuid, p['attributes']['profileContent']

    # Need to create one — look up the App ID and device list
    app_id = _find_app_id(headers, bundle_id)
    if not app_id:
        print(f'ERROR: No App ID found for bundle {bundle_id}. '
              'Register it in Apple Developer Portal first.')
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
    key_id     = os.environ['ASC_KEY_ID']
    issuer_id  = os.environ['ASC_ISSUER_ID']
    key_content = os.environ['ASC_KEY_CONTENT']
    cert_pass  = os.environ['CERT_PASS']
    team_id    = os.environ['APPLE_TEAM_ID']
    bundle_id  = os.environ['BUNDLE_ID']

    # Install PyJWT if needed (GitHub macos-latest runners don't pre-install it)
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

    # Write outputs
    with open('/tmp/dist.p12', 'wb') as f:
        f.write(p12_bytes)
    with open('/tmp/dist.mobileprovision', 'wb') as f:
        f.write(base64.b64decode(profile_content_b64))

    print(f'PROFILE_UUID={profile_uuid}')
    print(f'Written /tmp/dist.p12 and /tmp/dist.mobileprovision')

    # Export PROFILE_UUID for downstream steps
    github_env = os.environ.get('GITHUB_ENV', '')
    if github_env:
        with open(github_env, 'a') as f:
            f.write(f'PROFILE_UUID={profile_uuid}\n')

if __name__ == '__main__':
    main()
```

---

## Customising for a New App

When adding this workflow to a new repo, the only values to change are:

1. **`BUNDLE_ID`** in `ios-testflight.yml` — appears 3 times as `com.{client}.{app}`
2. **GitHub Actions secrets** — set the 5 secrets listed in `02-service-registration.md`
3. **Asset files committed to the repo root:**
   - `assets/icon-1024.png` — 1024×1024 PNG, no transparency, no rounded corners (required by Apple)
   - `assets/splash-2732.png` — 2732×2732 PNG for splash screen (prevents black screen on launch)

> **Apple SDK deadline:** Apple requires all new app submissions to be built with the iOS 26 SDK (Xcode 26) after **April 28, 2026**. The workflow above uses `runs-on: macos-15` + `maxim-lobanov/setup-xcode@v1` with `xcode-version: latest-stable` to ensure Xcode 26 is selected. Do not use `macos-latest` alone — it may resolve to an older runner without Xcode 26. If you're working with an existing repo that still uses `runs-on: macos-latest` without Xcode pinning, update it before the deadline.

Everything else (icon generation, cert creation, profile lookup/creation, pbxproj patching, archive, export, upload) is fully generic.

---

## How the UUID Flow Works

The provisioning profile UUID is the linking pin between three things:
- The `PROVISIONING_PROFILE = "..."` key in `project.pbxproj`
- The `.mobileprovision` filename in `~/Library/MobileDevice/Provisioning Profiles/`
- The `provisioningProfiles` dict in `ExportOptions.plist`

All three must agree on the same UUID. `setup_cert.py` extracts the UUID from the raw `.mobileprovision` bytes (XML plist embedded inside), then writes it to `$GITHUB_ENV` as `PROFILE_UUID`. All downstream steps reference `${{ env.PROFILE_UUID }}` so they stay in sync automatically.

---

## Debugging Common CI Failures

**"No profiles for bundle ID" after the signing step ran:**
Check the grep output from the "Force signing settings globally" step. Look for `CODE_SIGN_IDENTITY` lines — they should all say `"iPhone Distribution"`. If any still say `"iPhone Developer"` or are blank, the re.sub pattern didn't match (possibly a pbxproj format difference). Print the raw block around `PRODUCT_BUNDLE_IDENTIFIER` to diagnose.

**setup_cert.py fails with 403/404:**
- Check `ASC_KEY_ID` and `ASC_ISSUER_ID` are correct (no extra whitespace)
- Ensure the API key has **App Manager** access (not Read-only)
- If the key was recently created, wait 60 seconds and retry — ASC has eventual consistency

**Archive succeeds but Export fails:**
- Confirm `PROFILE_UUID` env var is non-empty in the Export step logs
- Check `ExportOptions.plist` was written correctly — print it with `cat /tmp/ExportOptions.plist` in a debug step

**altool upload "authentication credentials are missing":**
- `ASC_KEY_CONTENT` secret must include the full `.p8` file text including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
- No line-wrapping or extra characters in the secret value

**TestFlight upload succeeds but Apple sends "Missing app icon 1024×1024 PNG" rejection email:**
- The icon generation step ran but `assets/icon-1024.png` was not committed to the repo
- Check that `assets/icon-1024.png` exists at the repo root (not just locally)
- Also confirm `AppIcon.appiconset/Contents.json` has an entry with `"idiom": "ios-marketing"`, `"scale": "1x"`, `"size": "1024x1024"` — any other values (especially `"scale": "2x"`) cause Apple to reject

**Black screen after splash disappears:**
- Confirm `launchAutoHide: false` in `capacitor.config.ts` — if it's `true`, the splash hides before the WebView loads the Lovable URL
- Confirm `SplashScreen.hide()` is called in the app entry point (see `03-capacitor-setup.md` Step 5)
- If the splash never hides at all: `SplashScreen.hide()` is not being reached — check for JavaScript errors in the WebView
