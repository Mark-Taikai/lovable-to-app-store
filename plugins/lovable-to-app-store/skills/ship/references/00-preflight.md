# Pre-flight Checks — Run FIRST, Before Anything Else

These checks take under 60 seconds and catch the issues that previously caused hours of wasted CI time.

---

## Step 1: Load Agency Memory

```bash
cat ~/Documents/Claude/lovable-to-app-store/memory/agencies/{agency-slug}.json 2>/dev/null \
  && echo "✅ agency file found" || echo "⚠️  No agency file"
```

**If the agency file exists:** Load it. This gives you the 4 shared GitHub secrets (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_CONTENT path, CERT_PASS location).

**If the agency file doesn't exist:** Copy from `references/templates/agency-template.json` and ask the user to fill in their ASC credentials once. This only happens the very first time. Save to `~/Documents/Claude/lovable-to-app-store/memory/agencies/{agency-slug}.json`.

---

## Step 2: Select an Org (or Create a New One)

```bash
ls ~/Documents/Claude/lovable-to-app-store/memory/orgs/ 2>/dev/null
```

Present the available orgs to the user. Ask: **"Which org should this app be shipped under?"**

Show a numbered list of the actual orgs found in memory, e.g.:
```
1. acme
2. globex
3. [Create a new org]
```

**If user selects an existing org:** Load `memory/orgs/{org-slug}.json`. This gives you the Apple Team ID, bundle prefix, RevenueCat project, OneSignal account, and APNs key path for that org.

**If user selects "Create a new org":**
1. Ask: org name, Apple Team ID (from developer.apple.com → Membership), default bundle prefix, service account emails
2. Copy `references/templates/org-template.json` as a starting point
3. Save to `memory/orgs/{new-org-slug}.json`
4. Add the slug to `memory/agencies/{agency-slug}.json` → `orgs` array
5. The 4 ASC secrets in GitHub are the same as every other repo — only `APPLE_TEAM_ID` changes

**If only one org exists and context makes it obvious:** Pre-select it without asking. Announce: "Shipping under {orgName} (your only org — substitute the actual org slug from memory). Say 'different org' to change."

---

## Step 3: Check for Frozen Templates

```bash
ls ~/Documents/Claude/lovable-to-app-store/templates/ 2>/dev/null | head -10
```

**If templates exist:** Use them. Do NOT regenerate from `06-ci-signing.md` or `03-capacitor-setup.md`.

**If templates don't exist:** They live inside this plugin at `references/templates/`. Use those directly — no cloning needed.

---

## Step 4: Verify GitHub Repo Has 5 Required Secrets

Navigate to: `https://github.com/{org}/{repo}/settings/secrets/actions`

Check for all 5 secrets:

| Secret | Source |
|---|---|
| `ASC_KEY_ID` | agencies/{agency-slug}.json |
| `ASC_ISSUER_ID` | agencies/{agency-slug}.json |
| `ASC_KEY_CONTENT` | base64 of agency-asc.p8 |
| `CERT_PASS` | set manually once, never stored in files |
| `APPLE_TEAM_ID` | orgs/{org-slug}.json |

**If all 5 exist:** Say "All 5 secrets are already set. Skipping to Capacitor setup." — skip service registration.

**If secrets are missing:** Set them from the agency + org memory files. The first 4 are the same as every other repo under your agency — only APPLE_TEAM_ID may differ by org.

---

## Step 5: Validate ASC Credentials (only when adding secrets fresh)

Only run this when setting up a new repo's secrets for the first time.

```python
import os, time
import jwt, requests

key_id      = "{asc_key_id}"         # from agency memory
issuer_id   = "{asc_issuer_id}"      # from agency memory
key_content = open("{asc_key_p8_path}").read()

payload = {'iss': issuer_id, 'exp': int(time.time()) + 600, 'aud': 'appstoreconnect-v1'}
token = jwt.encode(payload, key_content, algorithm='ES256', headers={'kid': key_id, 'typ': 'JWT'})
r = requests.get('https://api.appstoreconnect.apple.com/v1/apps?limit=1',
                 headers={'Authorization': f'Bearer {token}'})
print("✅ Valid" if r.status_code == 200 else f"❌ Invalid — {r.status_code}: {r.text[:200]}")
```

If this returns 401: stop and fix credentials before any build work. Do not proceed.

---

## Step 6: Check Assets

```bash
ls -la assets/icon-1024.png 2>/dev/null && echo "✅ Icon found" || echo "❌ MISSING: assets/icon-1024.png"
ls -la assets/splash-2732.png 2>/dev/null && echo "✅ Splash found" || echo "⚠️  Missing splash (will generate)"
```

If icon is missing, stop and ask for a 1024×1024 PNG with no transparency and no rounded corners.

If splash is missing, generate it from the icon:
```python
from PIL import Image
icon = Image.open('assets/icon-1024.png').convert('RGB')
splash = Image.new('RGB', (2732, 2732), (255, 255, 255))
icon_resized = icon.resize((512, 512), Image.LANCZOS)
splash.paste(icon_resized, ((2732-512)//2, (2732-512)//2))
splash.save('assets/splash-2732.png')
print("Generated splash from icon.")
```

---

## Step 7: Load Existing Native Sign-In Config (if any)

If a memory file already exists for this app (`memory/apps/{bundle_id}.json`), check whether it has `google_auth` or `apple_auth` blocks populated. If yes:

- The OAuth client IDs (Web/iOS/Android) and reversed iOS scheme don't change between builds — reuse them
- The Apple JWT client secret may have expired (`apple_auth.jwt_secret_expires`) — if so, re-run `references/08-apple-native-signin.md` Step 2 to regenerate before the sign-in flow will work
- The edge functions (`google-native-signin` / `apple-native-signin`) should already be deployed — verify with the curl check from `references/07-google-native-signin.md` Step 3 (expect 400, not 404)

Skip the upfront sign-in question in `01-questions.md` and confirm in the summary: *"This app uses Google Sign-In (existing config loaded from memory) and the edge function was last verified deployed."*

---

## Pre-flight Complete

Announce:
> "✅ Pre-flight complete. Agency: {agency_name from memory}. Org: {org-name}. Credentials valid, templates ready, assets confirmed."

Then:
- If client is an existing org with all 5 secrets → proceed to `references/09-returning-client-fast-path.md`
- If new org or missing secrets → proceed to `references/01-questions.md`
