# Capacitor Setup — CLI Commands and Code Changes

After all services are registered, configure the repo for Capacitor. Work in `/tmp/lovable-to-app-store/{repo-name}/`.

## How OTA Updates Work (No Paid Service Needed)

The native app points to the live Lovable URL via `server.url`. Every time the app opens, it loads the latest version directly from Lovable's hosting — zero extra services. The `vite-plugin-pwa` service worker caches the app locally so it also works offline and launches instantly.

Update in Lovable → users see it next time they open the app. That's it.

---

## Step 1: Install Dependencies

```bash
cd /tmp/lovable-to-app-store/{repo-name}

# Capacitor core
npm install @capacitor/core @capacitor/cli

# Platform packages
npm install @capacitor/ios @capacitor/android

# Native SDKs
npm install @revenuecat/purchases-capacitor
npm install @onesignal/onesignal-capacitor

# PWA / offline support
npm install vite-plugin-pwa workbox-window

# Common native enhancements (include by default)
npm install @capacitor/haptics
npm install @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @capacitor/keyboard
```

Also install Pillow for icon/splash image generation:

```bash
pip install pillow --break-system-packages
```

---

## Step 2: Configure vite-plugin-pwa

Find the Vite config file: `vite.config.ts` or `vite.config.js`.

Add the PWA plugin so the service worker caches the app for offline use:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+\.lovable\.app\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lovable-app-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      },
      manifest: {
        name: '{AppDisplayName}',
        short_name: '{AppDisplayName}',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
```

**Note:** If the vite config already has plugins, add `VitePWA(...)` to the existing array — don't replace the whole file.

---

## Step 2.5: Generate iOS Icon Set and Splash Imageset

Run this Python script to resize `assets/icon-1024.png` into every required iOS icon size and generate a correct `Contents.json`. This prevents the most common Apple rejection: "Missing app icon 1024×1024 PNG for the 'Any Appearance' image well".

```python
#!/usr/bin/env python3
"""
generate_ios_assets.py — run from repo root AFTER npx cap add ios
Requires: assets/icon-1024.png and assets/splash-2732.png
Produces: all iOS icon sizes in AppIcon.appiconset/ with correct Contents.json
          splash imageset in SplashScreen.imageset/ with Contents.json
"""
import json, os, shutil
from PIL import Image

ICON_SRC   = 'assets/icon-1024.png'
SPLASH_SRC = 'assets/splash-2732.png'
ICON_DIR   = 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset'

# --- iOS icon sizes required by Apple ---
ICON_SIZES = [
    ('iPhone',  '20x20',   2), ('iPhone',  '20x20',   3),
    ('iPhone',  '29x29',   2), ('iPhone',  '29x29',   3),
    ('iPhone',  '40x40',   2), ('iPhone',  '40x40',   3),
    ('iPhone',  '60x60',   2), ('iPhone',  '60x60',   3),
    ('iPad',    '20x20',   1), ('iPad',    '20x20',   2),
    ('iPad',    '29x29',   1), ('iPad',    '29x29',   2),
    ('iPad',    '40x40',   1), ('iPad',    '40x40',   2),
    ('iPad',    '76x76',   1), ('iPad',    '76x76',   2),
    ('iPad',    '83.5x83.5', 2),
]

os.makedirs(ICON_DIR, exist_ok=True)
src = Image.open(ICON_SRC).convert('RGBA')

images_entries = []
for idiom, size_str, scale in ICON_SIZES:
    base = float(size_str.split('x')[0])
    px = int(base * scale)
    filename = f'Icon-{int(base)}@{scale}x.png'
    resized = src.resize((px, px), Image.LANCZOS)
    # Convert RGBA to RGB (Apple requires no transparency in icons)
    bg = Image.new('RGB', (px, px), (255, 255, 255))
    bg.paste(resized, mask=resized.split()[3])
    bg.save(os.path.join(ICON_DIR, filename))
    images_entries.append({
        'filename': filename,
        'idiom': idiom.lower(),
        'scale': f'{scale}x',
        'size': size_str
    })

# CRITICAL: ios-marketing entry must be "scale": "1x" and "size": "1024x1024"
# Any other values (e.g. scale 2x / size 512x512) cause Apple TestFlight rejection.
marketing_file = 'Icon-1024@1x.png'
marketing_img = src.convert('RGB')
marketing_img.save(os.path.join(ICON_DIR, marketing_file))
images_entries.append({
    'filename': marketing_file,
    'idiom': 'ios-marketing',
    'scale': '1x',
    'size': '1024x1024'
})

contents = {
    'images': images_entries,
    'info': {'author': 'lovable-to-app-store', 'version': 1}
}
with open(os.path.join(ICON_DIR, 'Contents.json'), 'w') as f:
    json.dump(contents, f, indent=2)
print(f'✅ iOS icon set written to {ICON_DIR}/ ({len(images_entries)} entries)')

# --- Splash imageset ---
os.makedirs(SPLASH_DIR, exist_ok=True)
splash_src = Image.open(SPLASH_SRC).convert('RGB')
for scale, px in [(1, 2732), (2, 2732), (3, 2732)]:
    fname = f'splash@{scale}x.png'
    splash_src.save(os.path.join(SPLASH_DIR, fname))

splash_contents = {
    'images': [
        {'filename': 'splash@1x.png', 'idiom': 'universal', 'scale': '1x'},
        {'filename': 'splash@2x.png', 'idiom': 'universal', 'scale': '2x'},
        {'filename': 'splash@3x.png', 'idiom': 'universal', 'scale': '3x'},
    ],
    'info': {'author': 'lovable-to-app-store', 'version': 1}
}
with open(os.path.join(SPLASH_DIR, 'Contents.json'), 'w') as f:
    json.dump(splash_contents, f, indent=2)
print(f'✅ Splash imageset written to {SPLASH_DIR}/')
```

Run it:

```bash
cd /tmp/lovable-to-app-store/{repo-name}
python3 generate_ios_assets.py
```

> **Why this matters:** Xcode's default `npx cap add ios` creates an `AppIcon.appiconset/Contents.json` with the ios-marketing entry set to `"scale": "2x"` and `"size": "512x512"`. Apple's validator rejects this with "Missing app icon 1024×1024 PNG for the 'Any Appearance' image well". This script ensures the ios-marketing entry is always `"scale": "1x"`, `"size": "1024x1024"` with an actual 1024×1024 file.

---

## Step 3: Initialize Capacitor

```bash
npx cap init "{AppDisplayName}" "{bundleId}" --web-dir dist
```

This creates `capacitor.config.ts`. Replace its contents with:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '{bundleId}',
  appName: '{AppDisplayName}',
  webDir: 'dist',
  server: {
    // Point to the live Lovable URL — this is what enables automatic OTA updates.
    // When Lovable redeploys, users see the new version next time they open the app.
    url: '{lovable_url}',
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      // IMPORTANT: launchAutoHide must be FALSE when using server.url (Lovable URL).
      // The 2-second auto-hide fires before the WebView finishes loading the remote URL,
      // leaving users staring at a black screen. Instead we hide programmatically after
      // the app is mounted — see the SplashScreen.hide() call injected in Step 5 below.
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999'
    },
    StatusBar: {
      style: 'Default'
    }
  }
};

export default config;
```

---

## Step 4: Add Platforms

```bash
npx cap add ios
npx cap add android
```

---

## Step 5: Inject SDK Initialization Code

Find the app's entry point: check for `src/main.tsx`, `src/main.ts`, `src/index.tsx`, or `src/App.tsx`.

> ⚠️ **IMPORTANT — RevenueCat API Key Prefixes:**
> RevenueCat API keys **must** use the correct prefix for each platform:
> - iOS keys start with **`appl_`**
> - Android keys start with **`goog_`**
>
> The RevenueCat dashboard also shows **`test_`** prefixed keys. These are **NOT** valid for the native SDK.
> Using a `test_` key causes an immediate **native crash on app startup** in TestFlight and production builds —
> the app opens and crashes before any JavaScript runs.
>
> Always use the **Public SDK Key** found under RevenueCat → Project Settings → API Keys.
> It will start with `appl_` (iOS) or `goog_` (Android).

Add the following after existing imports:

```typescript
// Native SDK initialization — added by the lovable-to-app-store plugin
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import OneSignal from '@onesignal/onesignal-capacitor';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

// Initialize native services (only runs on iOS/Android, not web)
if (Capacitor.isNativePlatform()) {
  (async () => {
    const platform = Capacitor.getPlatform();

    // RevenueCat — in-app purchases
    // CRITICAL: iOS key must start with "appl_", Android key with "goog_".
    // A "test_" key will crash the app immediately on startup.
    const rcKey = platform === 'ios'
      ? '{revenuecat_ios_public_key}'
      : '{revenuecat_android_public_key}';

    const validPrefix = platform === 'ios' ? 'appl_' : 'goog_';
    if (!rcKey.startsWith(validPrefix)) {
      console.error(
        `[RevenueCat] INVALID API key for ${platform} — must start with "${validPrefix}". ` +
        `Got prefix: "${rcKey.substring(0, 5)}". ` +
        `Did you use a "test_" key by mistake? Use the Public SDK Key from RevenueCat → Project Settings → API Keys.`
      );
      // Skip configure() — calling it with a wrong-prefix key crashes the app.
    } else {
      try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({ apiKey: rcKey });
      } catch (err) {
        // SDK init failure must never crash the app — log and continue.
        console.error('[RevenueCat] configure() failed:', err);
      }
    }

    // OneSignal — push notifications
    try {
      OneSignal.initialize('{onesignal_app_id}');
      OneSignal.Notifications.requestPermission(true);
    } catch (err) {
      console.error('[OneSignal] initialize() failed:', err);
    }

    // Hide splash screen after app is ready.
    // IMPORTANT: launchAutoHide is false in capacitor.config.ts so we must call this
    // manually. Hiding after a short delay gives the WebView time to load the Lovable URL.
    // Without this call the splash screen stays forever; with launchAutoHide: true the
    // splash hides before the page loads producing a black screen. 300ms is the sweet spot.
    setTimeout(() => SplashScreen.hide(), 300);
  })();
}
```

**Before moving on:** verify that both `{revenuecat_ios_public_key}` and `{revenuecat_android_public_key}` placeholders have been replaced with real keys starting with `appl_` and `goog_` respectively. If RevenueCat is not being used in this app, remove the `@revenuecat/purchases-capacitor` import and the entire RevenueCat block rather than leaving the package installed with placeholder keys.

---

## Step 6: Build the Web App

```bash
npm run build
```

Common fixes if this fails:
- Missing env vars: create `.env` with placeholder values and retry
- TypeScript errors on new imports: add `// @ts-ignore` above the import line
- Build script name differs: check `package.json` scripts — may be `vite build`

---

## Step 7: Sync to Native Projects

```bash
npx cap sync
```

**Note:** Because `server.url` points to the live Lovable URL, the local `dist/` build is only used as a fallback. The app will always load from Lovable when online. The service worker caches it for offline use.

---

## Step 8: Configure iOS App Settings

Update `ios/App/App/Info.plist` — add required keys:

```xml
<!-- Bypass Apple export compliance dialog for all future builds.
     Apps that only use HTTPS (standard TLS) qualify for this exemption.
     Without this key, every new build uploaded to TestFlight shows a
     "Missing Compliance" warning that must be manually dismissed. -->
<key>ITSAppUsesNonExemptEncryption</key>
<false/>

<!-- Push notifications -->
<key>NSUserNotificationUsageDescription</key>
<string>We'll send you important updates about your account.</string>

<!-- Required for OneSignal background delivery -->
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

> **Note on encryption compliance:** `ITSAppUsesNonExemptEncryption = false` applies to any app that only uses encryption built into Apple's OS (i.e. standard HTTPS/TLS via Supabase, RevenueCat, OneSignal, Lovable URLs, etc.) and implements no custom cryptographic algorithms. This covers virtually all Lovable-based apps. If an app implements custom encryption (e.g. end-to-end encrypted messaging), set this to `true` and follow Apple's export documentation instead.

**If the app uses Google Sign-In**, also add the Google iOS URL scheme so Google can redirect back to the app after authentication:

```xml
<!-- Google Sign-In: reversed iOS OAuth client ID as URL scheme.
     Required so Google can redirect back to the app after sign-in.
     Get this from Google Cloud Console → APIs & Services → Credentials
     → your iOS OAuth client → "iOS URL scheme" field.
     Format: com.googleusercontent.apps.{numeric-id}-{suffix}
     This is NOT the same as the Web client ID that goes into Supabase. -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>{google_ios_url_scheme}</string>
    </array>
  </dict>
</array>
```

Replace `{google_ios_url_scheme}` with the reversed iOS client ID from memory (e.g. `com.googleusercontent.apps.1234567890-abcdefg`). This is **different** from the Web client ID — it uses the iOS client and is reversed dot-by-dot.

> ⚠️ **The URL scheme is only half of native Google Sign-In.** On Lovable-managed Supabase you cannot add additional Authorized Client IDs to the Google auth provider, so the native iOS idToken (which has `aud = iOS client ID`) gets rejected by Supabase (which validates `aud = Web client ID`). The fix is a Supabase Edge Function (`google-native-signin`) that exchanges the native `serverAuthCode` server-side using the Web client secret, returning a fresh idToken with `aud = Web client ID`.
>
> **If this app uses Google Sign-In, stop here and follow `references/07-google-native-signin.md` end-to-end** — it covers the Edge Function source, capacitor.config.ts (`iosClientId` + `serverClientId` + `forceCodeForRefreshToken: true`), the client-side `nativeGoogleSignIn()` wrapper, and the Lovable-doesn't-auto-deploy-edge-functions warning (verify with `curl` — should return 400, not 404).
>
> **If this app uses Apple Sign-In**, follow `references/08-apple-native-signin.md` for the equivalent code-exchange flow using bundle ID as `client_id`, plus App.entitlements wiring.

Set the Team ID in `ios/App/App.xcodeproj/project.pbxproj`:
- Search for `DEVELOPMENT_TEAM`
- Replace empty string: `DEVELOPMENT_TEAM = {apple_team_id};`

**Verify `CFBundleDisplayName`** in `ios/App/App/Info.plist` is set to the proper human-readable app name (e.g. "Task List"), not the internal repo/package name (e.g. "myapp-repo"). This is what appears under the app icon on the home screen. If `CFBundleDisplayName` is missing or wrong, add/fix it:

```xml
<key>CFBundleDisplayName</key>
<string>{AppDisplayName}</string>
```

---

## Step 9: Configure Android

Update `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

Update `android/app/src/main/res/values/strings.xml`:
```xml
<resources>
    <string name="app_name">{AppDisplayName}</string>
    <string name="onesignal_app_id">{onesignal_app_id}</string>
</resources>
```

---

## Step 10: Commit Changes Back to Repo

Before committing, run this sanity check to catch unfilled placeholders and invalid API key prefixes:

```bash
cd /tmp/lovable-to-app-store/{repo-name}

# Check for any unfilled {placeholder} tokens
echo "=== Unfilled placeholders ==="
grep -r '{[a-z_]*}' src/ capacitor.config.ts ios/App/App/Info.plist 2>/dev/null \
  | grep -v node_modules | grep -v '.git'

# Check RevenueCat key prefixes in source files
echo "=== RevenueCat key prefix check ==="
grep -r "revenuecat\|purchases-capacitor\|Purchases.configure" src/ 2>/dev/null \
  | grep -v node_modules | grep -v '.git'
```

If any `{placeholder}` tokens are still present in the source files, fill them before committing. If any RevenueCat API key does not start with `appl_` (iOS) or `goog_` (Android), replace it with the correct key — do not commit a `test_` key.

```bash
git add -A
git commit -m "Add Capacitor native wrapper with icon set, splash screen, RevenueCat, OneSignal, and PWA offline support"
git push origin main
```

> **Verify before committing:** check that `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` contains an entry with `"idiom": "ios-marketing"`, `"scale": "1x"`, and `"size": "1024x1024"`. If it's missing or has `"scale": "2x"`, the CI upload will be rejected by Apple.

If the user doesn't have push access, note this in the summary and provide the diff for manual application.
