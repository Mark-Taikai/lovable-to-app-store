---
name: ship
description: >
  Ship a Lovable app to iOS TestFlight and Google Play. Registers all third-party
  services, wraps the app in Capacitor, and submits builds — no app store knowledge
  required. Triggered by: "ship this app", "publish this Lovable app", "wrap in
  Capacitor", "get this on TestFlight", "submit to App Store", "deploy to Play Store",
  "turn this into a native app", "put this on the app store".
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebFetch
  - mcp__Claude_in_Chrome__navigate
  - mcp__Claude_in_Chrome__computer
  - mcp__Claude_in_Chrome__find
  - mcp__Claude_in_Chrome__form_input
  - mcp__Claude_in_Chrome__read_page
  - mcp__Claude_in_Chrome__get_page_text
  - mcp__Claude_in_Chrome__tabs_context_mcp
  - mcp__Claude_in_Chrome__tabs_create_mcp

---

# Ship a Lovable App

Wrap a Lovable/GitHub web app as a native iOS + Android app and submit to TestFlight and Google Play. This skill uses frozen, battle-tested templates — no code is regenerated from scratch.

> **v2.0 architecture (default):** apps ship with bundled `dist/` web
> assets inside the .ipa, plus `@capgo/capacitor-updater` pulling OTA
> bundles from your own Supabase Storage bucket. This avoids Apple's
> Guideline 4.2 ("Minimum Functionality") risk that the v1.x web-shell
> pattern triggered, and prevents bad live-site deploys from bricking
> installed apps. Read `references/11-bundled-ota.md` for the full
> architecture before starting. Migrating an app from v1.x?
> Read `references/12-migration-guide.md` first.

## ⚡ ALWAYS START HERE — Pre-flight (mandatory)

Read `references/00-preflight.md` and run every check before doing anything else.

**Fast path decision after pre-flight:**
- Client is **a returning client** (existing org in memory) AND repo already has all 5 GitHub secrets → use `references/09-returning-client-fast-path.md` (skip Steps 1–4 below entirely)
- New client or missing secrets → continue with standard workflow below

---

## Standard Workflow (new clients / new secret setup only)

### Step 1: Read the Repo

1. Ask for the GitHub/Lovable repo URL if not provided.
2. Clone to `/tmp/lovable-to-app-store/{repo-name}/`:
   ```bash
   git clone {repo-url} /tmp/lovable-to-app-store/{repo-name} --depth=1
   ```
3. Read `package.json`, `src/App.tsx`, and `index.html`.
4. Load memory from `~/Documents/Claude/lovable-to-app-store/memory/`.

### Step 2: Ask Upfront Questions
Read `references/01-questions.md`. Ask ALL questions at once, never mid-workflow.

### Step 3: Register Services
Read `references/02-service-registration.md` for browser workflows (Apple, Google Play, RevenueCat, OneSignal).

### Step 4: Capacitor Setup — USE FROZEN TEMPLATES
Do NOT regenerate from `03-capacitor-setup.md`. Copy files from `references/templates/` and substitute placeholders. See `references/09-returning-client-fast-path.md` Step 3 for the exact substitution process.

### Step 4b (conditional): Native Sign-In Wiring
If the app uses **Google Sign-In** or **Apple Sign-In**, the URL-scheme step in `03-capacitor-setup.md` is only half the story. The full architecture — Edge Function, code exchange, `signInWithIdToken()` — lives in dedicated references:

- **Google Sign-In** → read `references/07-google-native-signin.md` (full edge-function flow, capacitor.config.ts `iosClientId`/`serverClientId`/`forceCodeForRefreshToken` rules, the "drawer never closes" fix, Lovable-doesn't-auto-deploy-edge-functions warning)
- **Apple Sign-In** → read `references/08-apple-native-signin.md` (same code-exchange pattern using bundle ID as `client_id`, JWT client secret generation, App.entitlements wiring)

Both flows require the Edge Function to be deployed by Lovable explicitly — verify with `curl` (should return 400, not 404) before testing the build.

### Step 5: Build and Submit

**MANDATORY pre-archive check** (whether building locally or via CI):
run the verification block in `references/10-build-gotchas-addendum.md`
under "Pre-archive verification checklist". It checks for:

- `UIMainStoryboardFile = Main` in Info.plist (silent black screen if missing)
- No `iosScheme: 'https'` in capacitor.config.ts (silently rejected, breaks WebView)
- Capacitor CLI / core / ios all on the same major version
- Node 22+ (required by Capacitor CLI v8.3+)
- Podfile post_install hook present (was wiped by last `cap sync`?)
- GoogleSignIn pod >= 7.1.0 (avoids ITMS-91061)
- public/index.html bundled

If any check fails, fix it BEFORE invoking `xcodebuild archive`. Each of
these has caused multi-hour debug sessions in the wild because the
TestFlight upload looks fine and the symptom (black screen on launch) gives
no logs.

GitHub Actions CI handles archive + upload automatically after push. Read
`references/04-build-and-submit.md` only if CI fails after 3 runs. Also
consult `references/10-build-gotchas-addendum.md` for the other gotchas
(ITMS-91061, provisioning-profile invalidation after enabling Sign in with
Apple, and the rest).

### Step 6: Save Memory
Read `references/05-memory-schema.md`. Save after every step that produces a new ID or key. If Google or Apple Sign-In was wired up, also persist the `google_auth` / `apple_auth` blocks documented at the bottom of refs 07 and 08.

---

## Frozen Templates (the whole point)

The `references/templates/` directory contains the exact files from the successful Task List deployment. Copy and substitute — never rewrite.

**The only things that change per app:**

| Variable | Example |
|---|---|
| `{{BUNDLE_ID}}` | `com.yourcompany.gamechime` |
| `{{APP_DISPLAY_NAME}}` | `GameChime` |
| `{{LOVABLE_URL}}` | `https://abc123.lovable.app` |
| `{{REVENUECAT_IOS_KEY}}` | `appl_xxxxxxxxxxxxxx` |
| `{{REVENUECAT_ANDROID_KEY}}` | `goog_xxxxxxxxxxxxxx` |
| `{{ONESIGNAL_APP_ID}}` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

**Files to deploy per app:**
- `references/templates/.github/workflows/ios-testflight.yml` → `.github/workflows/` (3× `{{BUNDLE_ID}}`)
- `references/templates/.github/scripts/setup_cert.py` → `.github/scripts/` (unchanged)
- `references/templates/capacitor.config.ts` → repo root (3 variables)
- `references/templates/sdk-init-snippet.ts` → inject into `src/main.tsx` (3 variables)
- `references/templates/info-plist-additions.xml` → add entries to `ios/App/App/Info.plist`
- `references/templates/vite.config.prod.ts` → repo root (no substitutions)
- `references/templates/index-html-boot-overlay.html` → splice into `index.html` (no substitutions)
- `references/templates/ota-updater-client.ts` → `src/lib/ota-updater.ts` (2 variables)
- `references/templates/ota-manifest-edge-function.ts` → `supabase/functions/ota-manifest/index.ts`
- `references/templates/asc-submit.py` → repo root (used by build script + CI; no substitutions)
- `references/templates/build-local.sh` → repo root if user wants local builds (8 variables)

---

## Key Principles

- **Pre-flight first.** Always run `references/00-preflight.md` before any other work.
- **Returning client fast path.** If a returning client (existing org in memory) already has all 5 GitHub secrets → skip service registration entirely.
- **Never regenerate what's frozen.** Use the templates. Never retype code from reference docs.
- **Validate credentials immediately.** A 401 from Apple takes 5 seconds to catch. A failed CI build takes 20 minutes.
- **Never ask mid-workflow.** All questions happen upfront.
- **Save everything.** Every ID and key to memory immediately.
- **Native sign-in needs Edge Functions.** On Lovable-managed Supabase, native Google/Apple Sign-In can't use the native idToken directly — exchange the auth code server-side. See refs 07 and 08.

---

## Reference Files

- `references/00-preflight.md` — **Start here every time**
- `references/01-questions.md` — Upfront questions (standard workflow)
- `references/02-service-registration.md` — Browser workflows for Apple, Google, RevenueCat, OneSignal
- `references/03-capacitor-setup.md` — Manual Capacitor setup (fallback only)
- `references/04-build-and-submit.md` — Build errors and manual fallback
- `references/05-memory-schema.md` — Memory file format
- `references/06-ci-signing.md` — CI signing deep-dive (reference only)
- `references/07-google-native-signin.md` — **Google Sign-In via Supabase Edge Function (April 2026)**
- `references/08-apple-native-signin.md` — **Apple Sign-In via Supabase Edge Function (April 2026)**
- `references/09-returning-client-fast-path.md` — **Fast path for returning clients (existing org with all 5 secrets in GitHub)**
- `references/10-build-gotchas-addendum.md` — **All known silent-failure causes + the pre-archive verification checklist**
- `references/11-bundled-ota.md` — **v2.0 architecture: bundled dist + Capacitor Updater + Supabase Storage OTA**
- `references/12-migration-guide.md` — **v1.x → v2.0 migration path (existing apps shipped on server.url)**
- `references/templates/` — **Frozen template files — copy these, never regenerate**

---

## Final Output

```
✅ {App Name} is live on TestFlight

iOS: TestFlight link → [link or "check App Store Connect"]
Android: [Play Console internal testing link]

Secrets: all 5 set in GitHub ✓
Templates used: frozen (no code regenerated) ✓
Native sign-in: [Google ✓ / Apple ✓ / N/A] — edge function deployed and verified
Memory saved: ~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json

OTA updates are automatic — edit in Lovable, users see it on next launch.
To add native features: "add [feature] to {App Name}"
```
