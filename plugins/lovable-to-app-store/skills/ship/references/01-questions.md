# Upfront Questions

> **Read `ship/SKILL.md` "Operating Philosophy" first.** Most questions previously asked here are now answered autonomously by Claude reading from logged-in browser sessions. Only ask things only the user knows.

This skill asks the user **at most 4 things** up front, then proceeds autonomously. Anything else needed (Apple Team ID, Lovable URL, Google account email, RevenueCat keys, etc.) is read by Claude from logged-in browser sessions you opened in pre-flight.

Ask all 4 in a single `AskUserQuestion` call. Never ask mid-workflow.

---

## The 4 Questions

### Q1. App display name

The name that shows under the app icon on the iPhone home screen. Apple displays this directly to end users.

- **Pre-fill suggestion** from one of (in priority order):
  - `manifest.name` in vite.config.ts's VitePWA block (if present)
  - `<title>` tag in `index.html`
  - `name` in `package.json`, converted from kebab-case to title case
  - The GitHub repo name, converted to title case
- **Example:** for repo `recipe-finder` → suggest `"Recipe Finder"`
- **Phrasing:** *"What should the app be called on the home screen? Suggesting `{guess}` — accept, or type a different name."*
- **Skip if** the memory file for this bundle ID already has `app_name`.

### Q2. Bundle ID

The permanent unique identifier Apple and Google use to identify the app. Cannot be changed after first publish to either store.

- **Pre-fill suggestion:**
  - If memory has an org with `default_bundle_prefix` (e.g. `com.acmecorp`), suggest `{prefix}.{appname-lowercase-nospaces}`
  - Otherwise: ask "what should the bundle ID prefix be?" with a Google-domain-style example
- **Example:** for "Recipe Finder" under org "Acme" → suggest `com.acmecorp.recipefinder`
- **Phrasing:** *"Bundle ID? Suggesting `{guess}`. This is permanent — change now or accept."*
- **Skip if** memory already has an app file for this bundle ID (you're shipping a returning app).

### Q3. App icon — 1024×1024 PNG

Required by Apple. App is rejected without it. No way to skip.

- **Phrasing:** *"Upload a 1024×1024 PNG with no transparency and no rounded corners. (Drag-drop here, or say 'generate one' and I'll create a placeholder you can replace before the App Store submission.)"*
- **If user uploads:** save as `assets/icon-1024.png` in repo root, commit.
- **If user says "generate one":** create a solid-color placeholder with the app name centered:
  ```python
  from PIL import Image, ImageDraw, ImageFont
  import os
  img = Image.new('RGB', (1024, 1024), color=(79, 70, 229))  # indigo
  draw = ImageDraw.Draw(img)
  app_name = '{AppDisplayName}'
  try:
      font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 120)
  except Exception:
      font = ImageFont.load_default()
  bbox = draw.textbbox((0, 0), app_name, font=font)
  w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
  draw.text(((1024-w)/2, (1024-h)/2), app_name, fill='white', font=font)
  os.makedirs('assets', exist_ok=True)
  img.save('assets/icon-1024.png')
  ```
- Then tell the user *"placeholder icon generated — replace `assets/icon-1024.png` with your real icon before the App Store review."*
- The splash screen is auto-generated from the icon (no separate ask).

### Q4. Native sign-in providers

Affects which third-party services we register. Only the user knows this.

- **Phrasing:** *"Does your app sign users in with Google, Apple, both, or neither (email/password or magic link only)?"*
- **Options to present** (multi-choice, single answer):
  - `Google only`
  - `Apple only`
  - `Both Google and Apple`
  - `Neither (email/password or magic link)`
- **Skip if** memory already has `google_auth` or `apple_auth` for this app. Confirm in the summary and re-verify edge function deployment status only.

---

## Things Claude reads from logged-in browser sessions (don't ask)

These were questions in older versions. They are no longer asked because Claude can read them from the user's logged-in browser sessions opened during pre-flight Step 0:

| What | Where Claude reads it from |
|---|---|
| Apple Developer email | `developer.apple.com/account` — top-right user menu after login |
| Apple Team ID | `developer.apple.com/account` — Membership page, top-right of header |
| Google Play account email | `play.google.com/console` — account menu after login |
| Lovable deployment URL | `lovable.dev/projects/{id}` → Settings or live preview tab |
| RevenueCat project membership | `app.revenuecat.com` — Projects dropdown after login |
| OneSignal account | `app.onesignal.com` — top-right user menu after login |
| GitHub repo URL | already known from Step 1 (where Claude listed and picked the repo) |
| Org/client name for memory | inferred from the GitHub org/user that owns the repo + the app name; only ask if Claude can't infer cleanly |

If any of these fail to read autonomously (e.g. user not logged in to a needed service), Claude prompts the user to log in to that specific service tab — it does NOT fall back to asking them to type the value.

---

## Downstream branching from Q4 (native sign-in)

- **If Q4 answer includes Google:**
  - Three OAuth clients needed in Google Cloud Console (Web + iOS + Android) — see `02-service-registration.md` Section 6 and `07-google-native-signin.md` Step 1.
  - `google-native-signin` edge function must be created and deployed by Lovable.
  - Web Client ID + Secret go to Supabase's Google provider config.
  - iOS reversed Client ID becomes a `CFBundleURLTypes` entry in Info.plist.
- **If Q4 answer includes Apple:**
  - "Sign in with Apple" capability enabled on the App ID (Apple Developer Portal).
  - `App.entitlements` created (template at `references/templates/App.entitlements`).
  - Provisioning profile regenerated (otherwise shows "Invalid").
  - JWT client secret generated for Supabase Apple provider — see `08-apple-native-signin.md` Step 2.
  - `apple-native-signin` edge function deployed.
- **If memory has the auth block already:** confirm and skip OAuth client creation — those don't change between builds. Re-verify the edge function deployment with the `curl` check.

---

## What to Do With Missing or Skipped Answers

- **Q1 skipped:** use the suggested value. Note it in the summary so the user can object.
- **Q2 skipped:** use the suggested value. If the bundle ID is taken during Apple registration, append `.v2` and continue.
- **Q3 skipped or generation fails:** if Pillow isn't installed, install it (`pip install pillow --break-system-packages` — already auto-installed in pre-flight Step 0b). Generate the placeholder. Tell the user to replace it before App Store review.
- **Q4 skipped:** default to `Neither`. Tell the user: *"I assumed no native sign-in. If you want Google/Apple later, run `add-native` — but adding it during this ship is ~10 minutes faster than retrofitting."*

---

## Returning Client (the zero-question path)

If memory has an app file for this bundle ID with `app_name`, `bundle_id`, `apple_auth`/`google_auth` blocks populated, **ask nothing**. Confirm with a single message:

> *"Found `{App Name}` in memory under `{org}`. Re-using your existing Apple Team ID, RevenueCat keys, OneSignal app, and {Google|Apple|both|no} sign-in config. Starting now."*

Then proceed. This is the goal — the second time the user ships an app, the workflow asks zero questions.
