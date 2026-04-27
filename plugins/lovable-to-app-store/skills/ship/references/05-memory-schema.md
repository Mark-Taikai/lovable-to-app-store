# Memory Schema — 3-Tier Structure

All memory lives under `~/Documents/Claude/lovable-to-app-store/memory/`. Three tiers:

```
~/Documents/Claude/lovable-to-app-store/
  memory/
    agencies/
      {agency-slug}.json          ← ASC credentials shared across ALL orgs
    orgs/
      {org-slug}.json       ← Apple Team ID, bundle prefix, RC/OneSignal accounts
      [new-client].json     ← add one file per new org/client
    apps/
      com.yourcompany.tasklist.json
      com.yourcompany.gamechime.json
      [bundle-id].json      ← add one file per shipped app
  keys/
    agency-asc.p8          ← Apple Store Connect API key (.p8 file)
    {org-slug}-apns.p8      ← APNs auth key for push notifications
  keystores/
    {org-slug}.keystore     ← Android signing keystore
```

On first use, create the directories:
```bash
mkdir -p ~/Documents/Claude/lovable-to-app-store/memory/agencies
mkdir -p ~/Documents/Claude/lovable-to-app-store/memory/orgs
mkdir -p ~/Documents/Claude/lovable-to-app-store/memory/apps
mkdir -p ~/Documents/Claude/lovable-to-app-store/keys
mkdir -p ~/Documents/Claude/lovable-to-app-store/keystores
```

---

## Tier 1 — Agency (`agencies/{agency-slug}.json`)

Holds Apple Developer / ASC credentials shared across **every repo and every org** that your agency ships. Copy template from `references/templates/agency-template.json`.

```json
{
  "agency_name": "{Agency Name}",
  "agency_slug": "{agency-slug}",
  "apple_developer_email": "you@yourcompany.com",
  "asc_key_id": "XXXXXXXXXX",
  "asc_issuer_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "asc_key_p8_path": "~/Documents/Claude/lovable-to-app-store/keys/agency-asc.p8",
  "orgs": ["{org-slug}"]
}
```

**Maps to GitHub secrets (4 of 5 — same for every repo):**
| Memory field | GitHub Secret |
|---|---|
| `asc_key_id` | `ASC_KEY_ID` |
| `asc_issuer_id` | `ASC_ISSUER_ID` |
| base64 of `asc_key_p8_path` file | `ASC_KEY_CONTENT` |
| *(not stored — set manually)* | `CERT_PASS` |

⚠️ **CERT_PASS is never stored in any memory file.** Set it once in GitHub secrets manually.

---

## Tier 2 — Org (`orgs/{org-slug}.json`)

One file per org (client). Holds the Apple Team ID and org-specific service accounts. Copy template from `references/templates/org-template.json` to create new orgs.

```json
{
  "org_name": "Acme Corp",
  "org_slug": "acme",
  "agency": "your-agency",
  "apple_team_id": "XXXXXXXXXX",
  "default_bundle_prefix": "com.yourcompany",
  "play_console_email": "you@yourcompany.com",
  "keystore_path": "~/Documents/Claude/lovable-to-app-store/keystores/{org-slug}.keystore",
  "keystore_alias": "{org-slug}",
  "revenuecat_project_name": "{org-slug}",
  "revenuecat_account_email": "you@yourcompany.com",
  "onesignal_account_email": "you@yourcompany.com",
  "apns_p8_path": "~/Documents/Claude/lovable-to-app-store/keys/{org-slug}-apns.p8",
  "github_org": "your-github-username",
  "shipped_apps": ["com.yourcompany.tasklist"]
}
```

**Maps to GitHub secret (5th secret — differs per org):**
| Memory field | GitHub Secret |
|---|---|
| `apple_team_id` | `APPLE_TEAM_ID` |

---

## Tier 3 — App (`apps/{bundle-id}.json`)

One file per shipped app. Holds keys that are unique to each app.

```json
{
  "app_name": "GameChime",
  "bundle_id": "com.yourcompany.gamechime",
  "org": "{org-slug}",
  "agency": "your-agency",
  "github_repo": "https://github.com/your-github-username/game-chime",
  "lovable_url": "https://abc123.lovable.app",
  "platform": ["ios"],
  "apple": {
    "app_id": "XXXXXXXXXX",
    "app_store_connect_app_id": "XXXXXXXXXX"
  },
  "revenuecat": {
    "ios_public_key": "appl_xxxxxxxxxxxxxx",
    "android_public_key": "goog_xxxxxxxxxxxxxx"
  },
  "onesignal": {
    "app_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  },
  "build": {
    "method": "github-actions",
    "last_build_date": "2026-03-31",
    "last_testflight_version": "1.0.0"
  },
  "google_auth": {
    "_comment": "Optional — present if the app uses native Google Sign-In (see references/07-google-native-signin.md)",
    "web_client_id": "NUMERIC.apps.googleusercontent.com",
    "web_client_secret": "GOCSPX-xxxxxxxxxxxxxxxxxxxx",
    "ios_client_id": "NUMERIC.apps.googleusercontent.com",
    "android_client_id": "NUMERIC.apps.googleusercontent.com",
    "ios_reversed_client_id": "com.googleusercontent.apps.NUMERIC",
    "edge_function": "google-native-signin",
    "edge_function_secrets": ["GOOGLE_CLIENT_ID (web)", "GOOGLE_CLIENT_SECRET (web)"],
    "lovable_cloud_secrets": ["VITE_GOOGLE_WEB_CLIENT_ID (= web_client_id, used by web fallback in src/lib/native/google-sign-in.ts)"],
    "architecture": "serverAuthCode -> Edge Function -> code exchange -> idToken (aud=web) -> signInWithIdToken",
    "edge_function_last_verified": "2026-04-27"
  },
  "apple_auth": {
    "_comment": "Optional — present if the app uses native Apple Sign-In (see references/08-apple-native-signin.md)",
    "services_id": "com.yourcompany.gamechime.signinwithapple",
    "key_id": "XXXXXXXXXX",
    "key_path": "~/Documents/Claude/lovable-to-app-store/keys/apple-signin-{bundle_id}.p8",
    "edge_function": "apple-native-signin",
    "edge_function_secrets": ["APPLE_CLIENT_ID (bundle ID)", "APPLE_CLIENT_SECRET (JWT)"],
    "jwt_secret_expires": "2026-10-22",
    "architecture": "authorizationCode -> Edge Function -> code exchange -> id_token (aud=bundle) -> signInWithIdToken"
  }
}
```

> **Note on `google_auth` / `apple_auth`:** these blocks are **optional** — only populate them when the app actually uses that provider. The edge function names match what `references/07-google-native-signin.md` and `references/08-apple-native-signin.md` create. The `jwt_secret_expires` field on `apple_auth` matters because Apple JWT client secrets expire after 6 months max; track the expiry so you know when to regenerate.

---

## Creating a New Org

When shipping an app under a new org (new Apple account):

1. Copy `references/templates/org-template.json` → `memory/orgs/{new-org-slug}.json`
2. Collect from user: org name, Apple Team ID, bundle prefix, service account emails
3. Add the new org slug to `agencies/{agency-slug}.json` → `orgs` array
4. The 4 ASC secrets in GitHub are the **same as every other repo** — only `APPLE_TEAM_ID` changes
5. Set up a new Android keystore for that org if needed

A new org does **not** require a new Apple Developer account — all orgs share your agency's ASC API key.

---

## Memory Load Order (every ship/update/add-native run)

```bash
# 1. Load agency
cat ~/Documents/Claude/lovable-to-app-store/memory/agencies/{agency-slug}.json

# 2. List available orgs and select one
ls ~/Documents/Claude/lovable-to-app-store/memory/orgs/

# 3. Load selected org
cat ~/Documents/Claude/lovable-to-app-store/memory/orgs/{org-slug}.json

# 4. Load app (if already shipped)
cat ~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json 2>/dev/null
```

If `agencies/{agency-slug}.json` doesn't exist yet, copy from `references/templates/agency-template.json` and ask the user to fill in the ASC values once.

---

## Updating Memory

After every step that produces a new ID or key, immediately write it to the correct tier file. Use Read + Write tools to merge — never overwrite the whole file blindly.
