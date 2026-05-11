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

---

## 🎯 Operating Philosophy — read this BEFORE doing anything

**You (Claude) do everything. The user only logs in.**

The user is a Lovable user who has never touched Xcode, the Apple Developer Portal, Google Play Console, git, or a terminal. They know how to type their email, click "Sign in with Google", and tap "Approve" in a push notification on their phone. **That is the entire skillset you can assume.**

### What "the user only logs in" means in practice

| ❌ Don't make the user… | ✅ Instead, you do this |
|---|---|
| Paste a GitHub repo URL | Open `github.com/Mark-Taikai?tab=repositories` in Chrome via the MCP extension. Ask them to log in if needed. **You** read the repo list and ask which one is the Lovable app — by name, not URL. |
| Generate a Personal Access Token and paste it | Drive their logged-in Chrome session to `github.com/settings/tokens/new?...&scopes=repo,workflow`. **You** click "Generate token", **you** read the token off the page via `get_page_text`, **you** use it. Never make them copy-paste. |
| Paste a Lovable URL | Open `lovable.dev` in Chrome. Ask them to log in. **You** read their project list, find the match for the GitHub repo they picked, read the live preview URL off the project page. |
| Type their Apple Team ID | Open `developer.apple.com/account` in Chrome. Once they're logged in, **you** read the Team ID from the membership page. |
| Type their Apple Developer email | Same — read it from the account page after login. |
| Type their Google Play account | Open `play.google.com/console`. Once logged in, **you** read the account info from the page. |
| Find and copy an API key from a dashboard | **You** navigate the dashboard, **you** find the key, **you** copy it via JS injection or `get_page_text`. The user never sees a copy-paste step. |
| Click through ASC API key download → paste contents | **You** click "Generate", **you** download the `.p8`, **you** read it via shell, **you** base64-encode it for GitHub Secrets. The user only logs in. |

### What the user IS responsible for (the entire list)

1. **Logging in** to GitHub, Lovable, Apple Developer, Google Play, RevenueCat, OneSignal — one tab at a time as you open them.
2. **Approving 2FA / push notifications** on their phone when a provider asks.
3. **Confirming destructive actions** ("Yes, create the app", "Yes, charge me $99/year for Apple Developer") that the provider's UI requires a human click on.
4. **Providing one-time information that only they know**: the app's display name, what category it falls under, the bundle ID format they want, what the icon should look like.

That's the **entire** list. Anything else you make them do is a bug in this skill — file an issue.

### Concrete consequences for the workflow below

- **Step 1 is no longer "ask for repo URL."** It's "open GitHub in Chrome, log user in, list their repos."
- **Step 2's question count drops to 4 from 9.** You can read most of `01-questions.md` from logged-in browser sessions.
- **GitHub authentication for `git push`** is not a PAT-paste flow. You drive the user's Chrome session to generate the PAT autonomously and read it off the page.
- **Lovable URL discovery** is via the user's logged-in lovable.dev session, not by asking.

When in doubt, ask yourself: *"can I read this from a page the user is logged into?"* If yes, open the page and read it. Don't ask.

---

> **v2.0 architecture (default):** apps ship with bundled `dist/` web
> assets inside the .ipa, plus `@capgo/capacitor-updater` pulling OTA
> bundles from your own Supabase Storage bucket. This avoids Apple's
> Guideline 4.2 ("Minimum Functionality") risk that the v1.x web-shell
> pattern triggered, and prevents bad live-site deploys from bricking
> installed apps. Read `references/11-bundled-ota.md` for the full
> architecture before starting. Migrating an app from v1.x?
> Read `references/12-migration-guide.md` first.

---

## 🚫 HARD RULE — Do NOT regress to v1.x server.url + WebView OAuth

If the build is complicated (TanStack Start with heavy SSR, custom Cloudflare bindings, an app that resists static export, etc.), you might be tempted to "just" wrap a WebView around the live Lovable URL with `server.url` and call it shipped. **Do not do this.** It is the single specific regression v2.0 was built to prevent. The reasons:

1. **Apple Guideline 4.2 ("Minimum Functionality") rejection.** A binary that's a thin WebView over a remote URL is exactly what App Review flags as "this should be a website, not an app." We have direct evidence of this happening to Lovable apps. Bundled `dist/` resolves it.

2. **Native Google / Apple Sign-In stops working.** Inside a Capacitor WebView, the OAuth redirect from Google's auth flow opens in **the OS's external browser (Safari)**, not back into the app. The user ends up authenticated in Safari, with the app still showing the login screen. There is no clean fix at the WebView layer. The **only** working flow on Lovable-managed Supabase / Lovable Cloud is:
   - Native iOS Google Sign-In SDK gets a `serverAuthCode`
   - The code is exchanged server-side by an Edge Function (`google-native-signin`) using the WEB client secret
   - The Edge Function returns an idToken with `aud = web_client_id`
   - `signInWithIdToken()` (or the lovable-cloud-auth equivalent) accepts it

   Same architecture for Apple. **Refs 07 + 08 are the canonical implementations** — they're the result of weeks of debugging the broken WebView OAuth path. Do not re-derive a "simpler" solution. The simpler solutions don't work.

3. **`window.location.origin` redirect inside a WebView is NOT functionally equivalent to native sign-in.** It looks similar in code, but the runtime behavior diverges at the OAuth provider — Google opens Safari for the consent screen, the redirect URI registered for the Web client points back to your Lovable URL (not your app), and the user lands on the web version, not the native session. Even when it "appears" to work, the session lives in Safari's cookies and not in the WebView, so the user is logged out the moment they reopen the app.

**When you hit a build that's hard to static-export:** STOP. Tell the user the architecture is non-trivial and present them with options:
- Refactor the server-only code (you can do this for them — most SSR loaders become simple client fetches)
- Defer native sign-in to a later version and ship without it (email/password / magic link only)
- Acknowledge that this specific app may need a different deployment model and pause the ship

Do NOT silently propose the WebView regression. If a previous Claude session in this project suggested it, that was wrong — flag it and switch back to the bundled approach.

---

## ⚡ ALWAYS START HERE — Pre-flight (mandatory)

Read `references/00-preflight.md` and run every check before doing anything else.

**Fast path decision after pre-flight:**
- Client is **a returning client** (existing org in memory) AND repo already has all 5 GitHub secrets → use `references/09-returning-client-fast-path.md` (skip Steps 1–4 below entirely)
- New client or missing secrets → continue with standard workflow below

---

## Standard Workflow (new clients / new secret setup only)

### Step 1: Find the Repo (Chrome-driven, no URL asks)

**Do not ask the user for a repo URL.** Find it autonomously.

1. **Open GitHub in Chrome** via the MCP extension (`tabs_create_mcp` → navigate to `https://github.com/?tab=repositories`).
2. **Check login state.** If the page redirects to a login screen or shows "Sign in", say to the user: *"I've opened GitHub — please sign in in the tab I just opened, then say 'logged in' here."* Wait for confirmation. Do NOT proceed until logged in.
3. **Read the repo list** via `get_page_text` or `find` for "repository row". Extract repo names.
4. **Identify the Lovable app.** Lovable repos typically:
   - Are recently updated
   - Contain a `lovable.app` reference somewhere in the README or have `lovable` in tags
   - Have `vite.config.ts` + `src/App.tsx` (React+Vite, which is Lovable's stack)

   If multiple candidates: list the top 5 by recent activity and ask the user to pick by name.
   If one obvious candidate: pre-select it and confirm with *"Shipping `{repo-name}` — yes?"*
5. **Get the clone URL** from the repo page (`https://github.com/<user>/<repo>`).
6. **Clone via shell** (the bash sandbox can clone public repos without auth; for private repos use the autonomous PAT flow described later):
   ```bash
   git clone https://github.com/{user}/{repo} /tmp/lovable-to-app-store/{repo} --depth=1
   ```
7. **Read** `package.json`, `src/App.tsx`, and `index.html` from the cloned copy.
8. **DETECT THE APP ARCHITECTURE** (mandatory — different code paths for each):

   Lovable ships TWO architectures as of late April 2026. The plugin handles both, but they require different templates. Detect by checking these signals (in order):

   | Signal | Indicates |
   |---|---|
   | `src/routes/` directory exists with file-based routes (e.g. `__root.tsx`, `index.tsx`) | **TanStack Start** |
   | `app.config.ts` or `tanstack.config.ts` at repo root | **TanStack Start** |
   | `package.json` has `@tanstack/start` or `@tanstack/react-start` dependency | **TanStack Start** |
   | `wrangler.toml`, `wrangler.jsonc`, or `cloudflare` in package.json scripts | **TanStack Start on Cloudflare Workers** (the newer Lovable default) |
   | `@lovable.dev/cloud-auth-js` in deps | **TanStack Start** (Lovable's new auth lib) |
   | `src/main.tsx` exists + `index.html` exists + `vite.config.ts` present | **Vite SPA** (the older Lovable default) |
   | None of the above match cleanly | **Custom / unknown** — ask the user, do NOT guess |

   **Default precedence:** if both TanStack signals AND Vite signals are present (some hybrid configs exist), prefer TanStack — that's the modern default.

   **What to do after detection:**

   - **Vite SPA →** continue with this skill's standard Steps 2–6. Use `references/11-bundled-ota.md` for the bundled-OTA architecture and the standard `references/templates/capacitor.config.ts`, `vite.config.prod.ts`, `sdk-init-snippet.ts`. The `dist/` folder built by `npm run build` is what gets bundled into the IPA.

   - **TanStack Start →** read **`references/13-tanstack-start.md`** before doing anything else. The bundled-dist approach still applies, but the build invocation, output directory, and several config files differ. TanStack needs `vite build --mode spa` (or equivalent `vinxi build --preset static-spa`) to produce a static bundle suitable for Capacitor. Server-only routes need to be replaced with client-fetch versions at build time. `references/13-tanstack-start.md` is the canonical guide — DO NOT try to apply the Vite SPA templates directly to a TanStack project. You will produce a broken build.

   - **Custom / unknown →** stop and ask the user. Show them the signals you detected (or didn't) and ask which path: `Vite SPA`, `TanStack Start on Cloudflare`, or `Other (tell me what you have)`. Don't proceed with a guess.

   **Save the detected architecture to the app's memory file** under `architecture` (values: `"vite-spa"`, `"tanstack-start"`, `"tanstack-cloudflare"`, `"custom"`). Subsequent `update` / `add-native` runs read this field to skip re-detection.

9. **Load memory** from `~/Documents/Claude/lovable-to-app-store/memory/`.

> **Why we do it this way:** the user never sees a `github.com/...` URL or a "what's your repo?" question. They see a Chrome tab open on github.com → log in once → confirm the repo by name → done. And the plugin self-detects whether the repo is a Vite SPA (older Lovable apps) or TanStack Start (newer Lovable apps) — it doesn't ask the user "what stack are you on" because the user is a Lovable user; they don't know what TanStack is, and they shouldn't have to.

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
- `references/11-bundled-ota.md` — **v2.0 architecture: bundled dist + Capacitor Updater + Supabase Storage OTA (Vite SPA)**
- `references/12-migration-guide.md` — **v1.x → v2.0 migration path (existing apps shipped on server.url)**
- `references/13-tanstack-start.md` — **TanStack Start path: SPA build presets, server-only code handling, @lovable.dev/cloud-auth-js wiring (for newer Lovable apps)**
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
