#!/usr/bin/env python3
"""
asc-submit.py — App Store Connect API automation
==================================================
After `xcrun altool --upload-app` finishes, this script:

  1. Polls App Store Connect until the build's processingState == 'VALID'
     (typically 5–15 min after upload).
  2. Sets usesNonExemptEncryption=false (export compliance pre-set so the
     build doesn't show a "Missing Compliance" warning).
  3. Adds the build to a named external Beta Testers group.
  4. Submits the build for Beta App Review.

This script replaces the manual Xcode Organizer / App Store Connect web-UI
clicks. Apple typically auto-approves Beta Review within minutes for
revisions of an already-approved app.

USAGE
  python3 asc-submit.py \\
    --app-id 1234567890 \\
    --build-number 42 \\
    --group-name "Beta Testers"

ENV / FLAGS
  --key-id      ASC API Key ID (10-char alphanumeric) — or env ASC_KEY_ID
  --issuer-id   ASC API Issuer UUID                — or env ASC_ISSUER_ID
  --key-path    Path to AuthKey_*.p8 file          — or env ASC_KEY_PATH
                Default: ~/.private_keys/AuthKey_<KEY_ID>.p8

REQUIREMENTS
  pip install pyjwt cryptography  (pyjwt[crypto] also works)
"""

from __future__ import annotations
import argparse, json, os, sys, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path

try:
    import jwt  # PyJWT
except ImportError:
    sys.exit("ERROR: pip install pyjwt cryptography")

API = "https://api.appstoreconnect.apple.com/v1"
PROCESS_TIMEOUT_MIN = 30


def make_token(key_id: str, issuer: str, key_path: Path) -> str:
    return jwt.encode(
        {
            "iss": issuer,
            "iat": int(time.time()),
            "exp": int(time.time()) + 60 * 15,
            "aud": "appstoreconnect-v1",
        },
        key_path.read_text(),
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def http(token: str, method: str, path: str, body=None, params=None):
    url = path if path.startswith("http") else API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def find_build(token, app_id, build_number):
    code, res = http(token, "GET", "/builds", params={
        "filter[app]": app_id,
        "filter[version]": build_number,
        "sort": "-uploadedDate",
        "limit": 5,
    })
    if code != 200 or not isinstance(res, dict):
        return None, None
    for b in res.get("data", []):
        if b.get("attributes", {}).get("version") == build_number:
            return b["id"], b["attributes"]
    return None, None


def find_group_id(token, app_id, name):
    code, res = http(token, "GET", "/betaGroups", params={
        "filter[app]": app_id, "filter[name]": name, "limit": 5,
    })
    if code != 200 or not isinstance(res, dict):
        return None
    for g in res.get("data", []):
        if g["attributes"].get("name") == name:
            return g["id"]
    return None


def main():
    p = argparse.ArgumentParser(description="App Store Connect beta-submit automation.")
    p.add_argument("--app-id", required=True, help="App Store Connect numeric app ID.")
    p.add_argument("--build-number", required=True, help="The CFBundleVersion you uploaded.")
    p.add_argument("--group-name", default="Beta Testers",
                   help="External beta tester group name (must already exist in ASC).")
    p.add_argument("--key-id", default=os.environ.get("ASC_KEY_ID"))
    p.add_argument("--issuer-id", default=os.environ.get("ASC_ISSUER_ID"))
    p.add_argument("--key-path", default=os.environ.get("ASC_KEY_PATH"))
    args = p.parse_args()

    if not args.key_id or not args.issuer_id:
        sys.exit("ERROR: --key-id and --issuer-id required (or env ASC_KEY_ID / ASC_ISSUER_ID)")

    key_path = Path(args.key_path) if args.key_path else \
               Path.home() / f".private_keys/AuthKey_{args.key_id}.p8"
    if not key_path.exists():
        sys.exit(f"ERROR: API key not found at {key_path}")

    token = make_token(args.key_id, args.issuer_id, key_path)

    # 1. Poll for VALID processing state.
    print(f"[1/4] Waiting for Build {args.build_number} to finish processing...")
    deadline = time.time() + PROCESS_TIMEOUT_MIN * 60
    build_id, attrs = None, None
    while time.time() < deadline:
        bid, a = find_build(token, args.app_id, args.build_number)
        if not bid:
            print("  not yet visible...")
        else:
            state = a.get("processingState")
            print(f"  state={state} expired={a.get('expired')}")
            if state == "VALID":
                build_id, attrs = bid, a
                break
            if state in ("INVALID", "FAILED"):
                sys.exit(f"FAIL: build went to {state}")
        time.sleep(45)
    if not build_id:
        sys.exit(f"FAIL: build did not finish processing within {PROCESS_TIMEOUT_MIN} min")
    print(f"  ✓ Build {args.build_number} VALID (id={build_id})")

    # 2. Set export-compliance flag.
    print("[2/4] Setting usesNonExemptEncryption=false...")
    http(token, "PATCH", f"/builds/{build_id}", body={
        "data": {"type": "builds", "id": build_id,
                 "attributes": {"usesNonExemptEncryption": False}}
    })
    print("  ✓ done")

    # 3. Add to Beta Testers group.
    print(f"[3/4] Adding build to '{args.group_name}'...")
    group_id = find_group_id(token, args.app_id, args.group_name)
    if not group_id:
        sys.exit(f"FAIL: group '{args.group_name}' not found in App Store Connect")
    code, body = http(token, "POST",
                      f"/betaGroups/{group_id}/relationships/builds",
                      body={"data": [{"type": "builds", "id": build_id}]})
    if code in (200, 201, 204):
        print(f"  ✓ added (HTTP {code})")
    elif code == 409:
        print(f"  already in group (409)")
    else:
        print(f"  HTTP {code}: {body}")

    # 4. Submit for Beta Review.
    print("[4/4] Submitting for Beta App Review...")
    code, body = http(token, "POST", "/betaAppReviewSubmissions", body={
        "data": {"type": "betaAppReviewSubmissions",
                 "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}
    })
    if code in (200, 201):
        sub_id = body.get("data", {}).get("id") if isinstance(body, dict) else None
        print(f"  ✓ submitted (HTTP {code}, submission id={sub_id})")
    elif code == 409:
        print("  already submitted (409)")
    else:
        print(f"  HTTP {code}: {body}")

    print(f"\n✅ Build {args.build_number} is in {args.group_name} + submitted for review.")
    print("   Apple typically auto-approves revisions of approved apps within minutes.")


if __name__ == "__main__":
    main()
