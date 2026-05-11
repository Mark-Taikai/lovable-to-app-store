# Pre-flight Checks — Run FIRST, Before Anything Else

These checks take under 60 seconds and catch the issues that previously caused hours of wasted CI time.

---

## Step 0: Environment Handshake (auto-install + prompt-install)

Before any account or memory work, verify the runtime can do what `ship` needs.

### 0a. Bash sandbox + tools

```bash
node --version 2>&1
python3 --version 2>&1
git --version 2>&1
zip --version 2>&1 | head -1
```

Required minimums:
- `node ≥ 22` (Capacitor CLI v8.3+ requires Node 22)
- `python3 ≥ 3.10`
- `git`, `zip`

If any tool is missing, the runtime is broken — STOP and tell the user. The Cowork bash sandbox normally has all of these; if it doesn't, ask the user to restart Cowork.

### 0b. Python packages we'll need (auto-install)

```bash
python3 -c "import PIL, jwt, requests, cryptography" 2>&1 || \
  pip install --break-system-packages pillow pyjwt requests cryptography 2>&1 | tail -5
```

These are needed for: icon resizing (Pillow), ASC API JWT signing (pyjwt), API calls (requests), cert handling (cryptography). Auto-install is safe — they go into the sandbox, not the user's system Python.

### 0c. GitHub CLI (auto-install on first run)

```bash
which gh 2>&1 || {
  # Install gh into /tmp without sudo (works in Cowork's bash sandbox on aarch64 + amd64)
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) GH_ARCH="arm64" ;;
    x86_64) GH_ARCH="amd64" ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  cd /tmp
  curl -sL "https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_${GH_ARCH}.tar.gz" -o gh.tar.gz
  tar xzf gh.tar.gz
  echo "/tmp/gh_2.62.0_linux_${GH_ARCH}/bin/gh"
}
```

`gh` is used to push to the user's GitHub account without manually-pasted PATs. If install fails, fall back to asking the user for a fine-grained PAT — but try the auto-install first.

### 0d. Cowork Chrome extension (prompt-install — required for service registration)

Make a no-op Chrome MCP call to test connectivity:

```
[Call mcp__Claude_in_Chrome__tabs_context_mcp with createIfEmpty:false]
```

- **If it returns successfully:** ✅ Chrome extension is connected. Proceed.
- **If it errors with "no Chrome connected" / "extension not found" / similar:** STOP and tell the user:

  > ⚠️ **Cowork Chrome extension required.** This skill drives Apple Developer Portal, App Store Connect, Google Play Console, RevenueCat, and OneSignal through your browser — it can't proceed without the extension installed and authorized.
  >
  > **To install:** open Cowork → Settings → "Connect Chrome" (or equivalent in your version) → follow the install prompts → return here and say "ready" or "try again."
  >
  > Direct link: https://chromewebstore.google.com/ (search for "Claude" or "Cowork")

  Wait for the user to confirm before continuing. Do not retry silently.

### 0e. Workspace folder access

```bash
ls ~/Documents/Claude/ 2>&1 | head -3
```

If the folder is not accessible, this Cowork session doesn't have a workspace folder selected. Tell the user:

> ⚠️ I need access to a folder where I can save your app's settings and signing keys. Please pick one in Cowork (Settings → Workspace folder, or use the "Select folder" prompt) and re-run.

If it IS accessible, ensure the memory dirs exist:

```bash
mkdir -p ~/Documents/Claude/lovable-to-app-store/memory/{agencies,orgs,apps}
mkdir -p ~/Documents/Claude/lovable-to-app-store/{keys,keystores}
```

### 0f. Apple Developer Program reachability

```bash
curl -sI https://api.appstoreconnect.apple.com/v1/apps -o /dev/null -w '%{http_code}\n'
# Expect 401 (no auth provided) — confirms the API is reachable
```

If this returns anything other than 401 or 200, App Store Connect API is unreachable from the sandbox. Note it to the user; they may have to run this from a different network.

---

### 0g. Chrome login bootstrap — open all needed services and verify the user is logged in

> **Read `ship/SKILL.md` "Operating Philosophy" first.** The user only logs in. Claude does the rest. This step opens every service Claude will read from later, so all downstream steps can autonomously pull data without asking the user to type anything.

For each of the following services, open a tab in Chrome and check login state. If not logged in, prompt the user to log in to that specific tab and wait for confirmation before proceeding.

**Tabs to open in order:**

| # | URL | What Claude reads later from this session | If not logged in, prompt |
|---|---|---|---|
| 1 | `https://github.com/?tab=repositories` | The user's repo list (to pick which app to ship), and later, autonomously creates a PAT under Settings → Tokens for `git push` | *"I've opened GitHub. Please sign in in the tab — then tell me 'logged in' or 'ready'."* |
| 2 | `https://lovable.dev/projects` | The user's Lovable project list, the live preview URL for the chosen project | *"I've opened Lovable. Please sign in — then tell me 'ready'."* |
| 3 | `https://developer.apple.com/account` | Apple Developer email, Apple Team ID, membership status (to know whether $99/year is paid) | *"I've opened Apple Developer. Please sign in. If you haven't paid the $99/year yet, that's fine — sign up at developer.apple.com/programs first, then come back here when enrolled. Say 'ready' when signed in."* |
| 4 | `https://play.google.com/console` | Google Play account email, whether the $25 one-time fee is paid | *"I've opened Google Play Console. Please sign in. If you haven't paid the $25 one-time fee, sign up at play.google.com/console/signup first. Say 'ready' when signed in."* |

**Implementation pattern (use `tabs_create_mcp` + `navigate` + `get_page_text`):**

```pseudocode
for each service in [GitHub, Lovable, Apple, Google Play]:
    tabId = tabs_create_mcp(...)
    navigate(tabId, service.url)
    wait 2 seconds
    pageText = get_page_text(tabId)
    if "Sign in" or "Login" or "Sign up" appears prominently:
        announce("I've opened {service.name} — please sign in in that tab, then tell me 'ready'.")
        wait_for_user_confirmation()
    else:
        announce("✓ Already signed in to {service.name}.")
        save user identity to working memory for this session
```

**Important:**

- Do NOT open all four tabs at once — that overwhelms the user. Open one, get the user logged in, save the page identity (email/account name) to memory, move to the next.
- For **RevenueCat** and **OneSignal**, defer login until Step 3 (service registration). Most users don't have these accounts yet; the registration flow creates them.
- For **Lovable**, only open it if the user picked a repo that looks like a Lovable app in Step 1. Otherwise skip — they may be shipping a non-Lovable app and we don't want to confuse them.
- Keep these tabs open through the entire workflow. Claude refers back to them multiple times (e.g. Step 5 generating an Apple ASC key reads from the same logged-in Apple Developer tab).

**If the user already had these tabs open in their group from a previous run:** just `read_page` to confirm login state and reuse them. Don't open duplicates.

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
