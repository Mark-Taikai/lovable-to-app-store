# Upfront Questions

Ask all questions at once using AskUserQuestion before doing any browser work. Pre-fill answers that can be inferred from the repo or loaded from memory. If a client already exists in memory with all required data, skip the questions entirely and confirm with one message: "I found [Client Name] in memory — using their Apple Team ID and existing settings. Starting now."

## The Eight Questions

### 1. App display name
- Pre-fill guess from repo `name` in package.json, title tag in index.html, or repo name
- Question: "What should the app be called in the App Store?"
- Example: "Acme Tracker"

### 2. Client name (for memory organization)
- Use to create the memory folder and namespace bundle IDs
- Question: "Which client or project is this for? (Used to organize your app settings)"
- Example: "Acme Corp" or "{org-slug} internal"
- If memory already has this client, auto-fill and skip

### 3. Bundle ID
- Suggest: `com.{clientname-lowercase-nospaces}.{appname-lowercase-nospaces}`
- Example: `com.acmecorp.tracker`
- Question: "What should the app's bundle ID be? (This is a permanent, unique identifier)"
- Show suggestion and let them accept or change

### 4. Apple Developer account
- If client exists in memory with Apple Team ID → skip this question, confirm in summary
- If new client: "What email address is the Apple Developer account under?"
- Note: Claude will navigate to developer.apple.com and ask the user to sign in

### 5. Google Play account
- If client exists in memory with Play Console account → skip this question
- If new: "What Google account manages this client's Google Play Console?"
- Note: Claude will navigate to play.google.com/console and ask the user to sign in

### 6. Lovable deployment URL
- This is the URL where Lovable hosts the live web version of the app
- Usually format: `https://{app-id}.lovable.app` or custom domain
- Question: "What's the Lovable URL for this app? (Used to pull the latest build for OTA updates)"
- If they don't know: instruct them to check the Lovable project settings and paste the URL

### 7. App icon — 1024×1024 PNG (REQUIRED — prevents Apple rejection)
- **This is mandatory.** Apple rejects any build that lacks a valid 1024×1024 "ios-marketing" icon.
- Question: "Please upload your app icon — a 1024×1024 PNG with no transparency, no rounded corners. This is required by Apple."
- If they upload one: save it as `assets/icon-1024.png` in the repo root and commit it.
- If they can't provide one right now: generate a solid-color placeholder automatically:
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
  print('Placeholder icon generated at assets/icon-1024.png')
  ```
- Tell the user: "I've generated a placeholder icon. Replace `assets/icon-1024.png` with your real icon before submitting to the App Store."
- All iOS icon sizes (including the critical 1024×1024 ios-marketing entry) are generated from this file during the Capacitor setup step — see `03-capacitor-setup.md`.

### 8. Splash screen image (REQUIRED — prevents black screen on launch)
- **This is required** to prevent a black screen while the WebView loads the Lovable URL.
- Question: "Do you have a splash screen image? (PNG, ideally 2732×2732 to cover all screen sizes — or just say 'generate one' and I'll make a branded placeholder)"
- If they upload one: save it to `assets/splash-2732.png` in the repo root.
- If they say "generate one" or can't provide: generate from the icon:
  ```python
  from PIL import Image
  import os
  icon = Image.open('assets/icon-1024.png').convert('RGB')
  splash = Image.new('RGB', (2732, 2732), color=(255, 255, 255))  # white bg
  icon_resized = icon.resize((512, 512), Image.LANCZOS)
  x = (2732 - 512) // 2
  y = (2732 - 512) // 2
  splash.paste(icon_resized, (x, y))
  os.makedirs('assets', exist_ok=True)
  splash.save('assets/splash-2732.png')
  print('Placeholder splash generated at assets/splash-2732.png')
  ```
- Tell the user: "I've generated a white splash with your icon centered. Replace `assets/splash-2732.png` with your real design before App Store submission."
- The splash imageset is wired into the iOS project during the Capacitor setup step.

### 9. Native sign-in providers (CRITICAL — affects service registration)
- **Why this is upfront:** Each provider needs OAuth clients created in a third-party console (Google Cloud, Apple Developer Services ID) AND a Supabase Edge Function deployed by Lovable. Adding either one mid-workflow forces a restart of the service-registration step.
- Question: "Does the app sign users in with Google, Apple, both, or neither?"
- Options to present: `Google only`, `Apple only`, `Both Google and Apple`, `Neither (email/password or magic link only)`
- **If the answer includes Google:**
  - You must create THREE OAuth clients in Google Cloud Console (Web, iOS, Android) — see `02-service-registration.md` Section 6 and `07-google-native-signin.md` Step 1
  - You must deploy the `google-native-signin` edge function — see `07-google-native-signin.md` Step 3
  - The Web client ID + secret go into Supabase's Google provider config; the iOS reversed client ID becomes a `CFBundleURLTypes` entry in Info.plist
- **If the answer includes Apple:**
  - You must enable "Sign in with Apple" capability on the App ID in Apple Developer Portal — see `08-apple-native-signin.md` Step 1
  - You must create an `App.entitlements` file (template at `references/templates/App.entitlements`)
  - You must regenerate the provisioning profile after enabling the capability (otherwise it shows "Invalid")
  - You must generate a JWT client secret for Supabase's Apple provider — see `08-apple-native-signin.md` Step 2
  - You must deploy the `apple-native-signin` edge function
- **If memory already has `google_auth` or `apple_auth` populated for this app:** confirm in the summary and skip the OAuth client creation — those don't change between builds. Only re-verify edge function deployment status.

## What to Do With Missing Answers

- If user skips a question, use the suggested value and note it in the summary
- If bundle ID is already taken (discovered during Apple registration), suggest `{bundleid}.v2` and continue
- If they don't have a Google Play Console account: note it in the summary, skip Android for now, offer to complete it later with the `ship` skill using `--platform ios` flag approach (just tell them to say "skip Android for now" next time)
- If icon is not provided and placeholder generation fails (Pillow not installed): run `pip install pillow --break-system-packages` then retry
- If sign-in providers question is skipped, default to `Neither` and tell the user: "I assumed no native Google/Apple sign-in. If you want either, run `add-native` after the first ship is complete — but it's faster to do it upfront via this skill."
