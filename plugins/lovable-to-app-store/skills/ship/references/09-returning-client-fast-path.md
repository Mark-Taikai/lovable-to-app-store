# Returning Client Fast Path — Skip Service Registration

If the client is **a returning client** AND the GitHub repo already has all 5 required secrets, use this fast path. It skips ALL browser-based service registration (Apple, RevenueCat, OneSignal) because those accounts are already set up. You just need to create the new app listings and run Capacitor setup.

**Trigger conditions:**
- Client slug is the existing org slug saved in memory
- GitHub repo already has: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `CERT_PASS`, `APPLE_TEAM_ID`
- App memory doesn't already exist at `~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json`

---

## Fast Path Steps (instead of the standard 8-step workflow)

### 1. Collect the 4 Variables You Already Know (upfront, all at once)

Ask ONLY these 4 things — do NOT ask for RevenueCat or OneSignal keys yet (those don't exist for a new app and will be created automatically in Step 2):

1. **Bundle ID** — suggest `com.yourcompany.{appname-lowercase}`, confirm with user
2. **App Display Name** — what shows under the icon (e.g. "GameChime")
3. **Lovable URL** — the live Lovable deployment URL (e.g. `https://abc123.lovable.app`)
4. **Native sign-in providers** — Google / Apple / Both / Neither. **If memory file `~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle_id}.json` already has `google_auth` or `apple_auth` populated, skip this question and confirm in the summary.** If new (or memory is empty for this app), see `01-questions.md` Question 9 for branching guidance, and remember that adding sign-in is NOT a fast-path operation — it adds Google Cloud Console / Apple Developer steps + an Edge Function. Be transparent with the user that picking sign-in here will add ~10–20 minutes to the fast path.

**Do NOT ask about:** RevenueCat keys, OneSignal App ID, Apple Developer account, Apple Team ID, ASC credentials, Google Play account, keystore password.

RevenueCat and OneSignal keys **do not exist yet** for a new app — Claude creates the app entries in Step 2 and captures the keys automatically. Never ask the user to look up keys that don't exist yet.

---

### 2. Register Only the New App Listings (browser work — ~15 min)

You still need to create fresh listings for each new app. Open tabs for each in order:

**Apple Developer Portal** (`developer.apple.com/account`)
- Certificates, Identifiers & Profiles → Identifiers → "+"
- App IDs → App → Continue
- Description: `{AppDisplayName}`, Bundle ID: `{bundleId}` (Explicit)
- Enable: Push Notifications, In-App Purchase
- Register
- Note the App ID number

**App Store Connect** (`appstoreconnect.apple.com`)
- My Apps → "+" → New App
- Platform: iOS, Name: `{AppDisplayName}`, Bundle ID: select the one just registered
- SKU: `{bundle-id-with-dashes}`
- Fill category, description (infer from app analysis)
- Note the numeric App Store Connect ID (from the URL)

**RevenueCat** (`app.revenuecat.com`)
- Navigate to the existing {org-slug} project (do NOT create a new project)
- Apps → "+" → Add iOS app
  - App Name: `{AppDisplayName}`
  - Bundle ID: `{bundleId}`
  - Apple Team ID: from memory (`{org-slug}.json`)
  - App Store Connect App ID: the numeric ID captured above
- After saving, go to **Project Settings → API Keys**
- Find the **Public SDK Key** for this new iOS app — it starts with `appl_`
- **Auto-capture this key** — do NOT ask the user to find it. Read it from the page.
- **VALIDATION:** If it starts with `test_` you have the wrong key. The Public SDK Key always starts with `appl_`.
- If the app needs Android: Add Android app in the same project, capture the `goog_` key.

**OneSignal** (`app.onesignal.com`)
- Click "New App / Website"
- Name: `{AppDisplayName}`
- Select platform: Apple iOS
- Auth Key (.p8): upload the existing APNs .p8 file stored in memory
- Complete setup
- Go to Settings → Keys & IDs
- **Auto-capture the OneSignal App ID** (UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — do NOT ask the user to find it. Read it from the page.

**At the end of Step 2, Claude has all keys — the user was never asked for any of them.**

Save all IDs to the app memory file immediately.

---

### 3. Capacitor Setup Using Frozen Templates

**DO NOT generate these files from scratch.** Copy from the templates repository.

```bash
# Clone the repo to get the app (already done)
cd /tmp/lovable-to-app-store/{repo-name}

# Install all dependencies
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm install @revenuecat/purchases-capacitor @onesignal/onesignal-capacitor
npm install vite-plugin-pwa workbox-window @capacitor/haptics @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard
pip install pillow --break-system-packages

# Initialize Capacitor (creates the Xcode project structure)
npx cap init "{AppDisplayName}" "{bundleId}" --web-dir dist
npx cap add ios
npx cap add android
```

Then write these files using the frozen templates (substituting 3 values in each):

**`capacitor.config.ts`** — Copy from `templates/capacitor.config.ts`, replace:
- `{{BUNDLE_ID}}` → the bundle ID
- `{{APP_DISPLAY_NAME}}` → the display name
- `{{LOVABLE_URL}}` → the Lovable URL

**`src/main.tsx`** (or `src/main.ts`) — Inject the SDK init snippet from `templates/sdk-init-snippet.ts` after existing imports. Replace:
- `{{REVENUECAT_IOS_KEY}}` → the `appl_` key
- `{{REVENUECAT_ANDROID_KEY}}` → the `goog_` key (or placeholder if Android not set up yet)
- `{{ONESIGNAL_APP_ID}}` → the OneSignal UUID

**`.github/workflows/ios-testflight.yml`** — Copy from `templates/.github/workflows/ios-testflight.yml`, replace:
- `{{BUNDLE_ID}}` → the bundle ID (appears 3 times — use find-and-replace, not manual)

**`.github/scripts/setup_cert.py`** — Copy from `templates/.github/scripts/setup_cert.py` unchanged.

Then run the icon/splash generation and sync:
```bash
npm run build
npx cap sync
python3 generate_ios_assets.py  # from references/03-capacitor-setup.md Step 2.5
```

Add Info.plist entries from `templates/info-plist-additions.xml`.

---

### 3.5. Native Sign-In Setup (only if Step 1 said Google or Apple)

This is the part of the fast path that is **not** fast for native sign-in. There are no client-wide shortcuts here — every app needs its own OAuth client IDs (Google) or Services ID + JWT key (Apple), and its own Edge Function deployed by Lovable.

**If memory already has `google_auth` and/or `apple_auth` for THIS app:**
- Reuse the OAuth client IDs / reversed scheme — they don't change between builds
- Re-verify each edge function with the curl check from `references/07-google-native-signin.md` Step 3 (expect 400, not 404). If 404, ask Lovable to deploy.
- For Apple: check `apple_auth.jwt_secret_expires`. If past today + 7 days, regenerate the JWT per `references/08-apple-native-signin.md` Step 2 before continuing.

**If memory is empty for this app's auth:**
- Google → execute `references/02-service-registration.md` Section 6 (Steps 1–6) AND `references/07-google-native-signin.md` Steps 3, 4, 6, 7
- Apple → execute `references/02-service-registration.md` Section 7 AND `references/08-apple-native-signin.md` Steps 4, 5, 6, 7
- Save everything to memory under the `google_auth` / `apple_auth` blocks defined in `05-memory-schema.md`

**Tell the user explicitly:** "I'll need you to ask Lovable to deploy the new edge function(s) — Lovable doesn't auto-deploy them on push." Do not consider sign-in setup done until the curl verification passes.

---

### 4. Commit and Push — CI Does the Rest

```bash
# Sanity check: no unfilled placeholders
grep -r '{{' src/ capacitor.config.ts ios/App/App/Info.plist 2>/dev/null | grep -v node_modules

git add -A
git commit -m "Add Capacitor native wrapper for {AppDisplayName}"
git push origin main
```

Once pushed, the GitHub Actions workflow runs automatically:
1. Validates ASC credentials (fast-fail in 30 seconds)
2. Installs dependencies + CocoaPods (cached — faster on repeat runs)
3. Generates iOS icon set and splash
4. Creates distribution cert + provisioning profile via ASC API
5. Archives, exports, and uploads to TestFlight

First successful build → TestFlight in ~15 minutes.

---

### 5. Save App Memory

Save to: `~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json`

```json
{
  "app_name": "{AppDisplayName}",
  "bundle_id": "{bundleId}",
  "org": "{org-slug}",
  "agency": "your-agency",
  "github_repo": "{repo-url}",
  "lovable_url": "{lovable-url}",
  "platform": ["ios"],
  "apple": {
    "app_id": "{apple-app-id}",
    "app_store_connect_app_id": "{asc-app-id}"
  },
  "revenuecat": {
    "ios_public_key": "{appl_key}",
    "android_public_key": "{goog_key}"
  },
  "onesignal": {
    "app_id": "{onesignal-uuid}"
  },
  "build": {
    "method": "github-actions",
    "last_build_date": "{today}",
    "last_testflight_version": "1.0.0"
  }
}
```

Also update the org file to add this app to `shipped_apps`:
```bash
# Add bundle ID to orgs/{org-slug}.json → shipped_apps array
```

---

## Total Time Estimate (Fast Path)

| Step | Time |
|---|---|
| Collect 4 variables | 2 minutes |
| App Store + RevenueCat + OneSignal listings | ~15 minutes |
| Native sign-in setup (only if Google/Apple) | +10–20 minutes |
| Capacitor setup (template copy + substitution) | ~5 minutes |
| CI build | ~15 minutes |
| **Total (no sign-in)** | **~37 minutes** |
| **Total (with native sign-in)** | **~50–60 minutes** |

vs. the old approach which took multiple sessions and hours of debugging.
