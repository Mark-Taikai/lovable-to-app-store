---
name: add-native
description: >
  Add a native Capacitor feature or plugin to a published app. Installs the plugin,
  wires up the code, rebuilds, and submits a new version to TestFlight and Play Store.
  Triggered by: "add haptics to [app]", "add camera", "add biometrics", "add [native
  feature] to [app]", "enable push notifications", "add native [feature]", "the new
  Capacitor [plugin] is out", "add Face ID", "add Apple Pay".
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Add a Native Feature

Install and configure a Capacitor native plugin, update the app code, and submit a new build. Required whenever a feature needs platform-level APIs beyond what the web can provide.

## Common Native Features and Their Packages

| Feature | Package | Notes |
|---------|---------|-------|
| Haptics / vibration | `@capacitor/haptics` (already installed) | May just need to be used in code |
| Camera | `@capacitor/camera` | Requires permission strings in Info.plist |
| Biometrics / Face ID | `@capacitor-community/biometric-auth` | Requires capability in Developer Portal |
| Push notifications | Already configured via OneSignal | Use OneSignal SDK |
| Local notifications | `@capacitor/local-notifications` | No extra permissions needed |
| File system access | `@capacitor/filesystem` | |
| Contacts | `@capacitor-community/contacts` | Requires NSContactsUsageDescription |
| Calendar | `@capacitor-community/calendar` | Requires calendar permission |
| In-app browser | `@capacitor/browser` | |
| Share sheet | `@capacitor/share` | |
| Clipboard | `@capacitor/clipboard` | |
| Geolocation | `@capacitor/geolocation` | Requires location permission strings |
| Apple Pay / Google Pay | `@capacitor-community/stripe` | Requires Stripe account + Apple Pay setup |
| Google Sign In | `@codetrix-studio/capacitor-google-auth` | **Requires Supabase Edge Function** — see `ship` skill `references/07-google-native-signin.md`. Native idToken alone won't work on Lovable-managed Supabase. |
| Apple Sign In | `@capacitor-community/apple-sign-in` | **Requires Sign In with Apple capability + App.entitlements + Edge Function** — see `ship` skill `references/08-apple-native-signin.md`. |
| NFC | `@capacitor-community/nfc` | iPhone XS+ only |
| Barcode / QR scanner | `@capacitor-community/barcode-scanner` | Requires camera permission |
| Health data | `@capacitor-community/health` | Requires HealthKit entitlement |
| Background tasks | `@capacitor/background-runner` | |
| Screen reader / accessibility | Built into platform | No plugin needed |

> ⚠️ **Native Google/Apple Sign-In is NOT a single-package install.**
> Installing the package and adding `signInWithOAuth()` calls produces a token that
> Lovable-managed Supabase **rejects** (wrong `aud` claim). The fix requires a
> Supabase Edge Function that exchanges the native auth code server-side. If the
> user asks to add Google or Apple Sign-In, switch to the `ship` skill's
> `references/07-google-native-signin.md` or `08-apple-native-signin.md` —
> the standard add-native workflow below will leave them with a broken sign-in flow.

## Workflow

### Step 1: Identify the feature and package

Parse the user's request. If ambiguous (e.g., "add login with Apple"), clarify which specific capability they mean, then map to the right package.

### Step 2: Load app memory

```bash
ls ~/Documents/Claude/lovable-to-app-store/memory/apps/
```

Load the app's memory file. Get: `github_repo`, `bundle_id`, `apple_team_id`, `apple.app_store_connect_app_id`, and the build method.

### Step 3: Pull latest code

```bash
if [ -d "/tmp/lovable-to-app-store/{repo-name}" ]; then
  cd /tmp/lovable-to-app-store/{repo-name} && git pull origin main
else
  git clone {github_repo} /tmp/lovable-to-app-store/{repo-name} --depth=1
fi
```

### Step 4: Install the plugin

```bash
cd /tmp/lovable-to-app-store/{repo-name}
npm install {package-name}
npx cap sync
```

### Step 5: Add permissions to native projects

**iOS — Info.plist** (`ios/App/App/Info.plist`):

Add appropriate permission description key for the feature. Examples:
- Camera: `NSCameraUsageDescription` — "This app needs camera access to [specific reason]."
- Location: `NSLocationWhenInUseUsageDescription`
- Contacts: `NSContactsUsageDescription`
- Microphone: `NSMicrophoneUsageDescription`
- Photos: `NSPhotoLibraryUsageDescription`

**Android — AndroidManifest.xml** (`android/app/src/main/AndroidManifest.xml`):

Add appropriate uses-permission. Examples:
- Camera: `<uses-permission android:name="android.permission.CAMERA" />`
- Location: `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`

### Step 6: Add capability in Apple Developer Portal (if required)

Features requiring Developer Portal capabilities:
- Sign In with Apple → Add "Sign in with Apple" capability
- In-App Purchase → Already enabled (done during ship)
- HealthKit → Add HealthKit capability
- NFC → Add Near Field Communication Tag Reading capability
- Apple Pay → Add Apple Pay capability + set up merchant ID

Navigate to developer.apple.com → Certificates, Identifiers & Profiles → find the app's App ID → Edit → enable the required capability.

### Step 7: Inject usage code

Find a natural place in the app to demonstrate the feature. Typically:
- Create or update a utility file at `src/lib/native/{feature}.ts`
- Export a typed, simple API that wraps the plugin
- Import and use it in the relevant component

Example for haptics:
```typescript
// src/lib/native/haptics.ts
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const hapticFeedback = async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
  if (!Capacitor.isNativePlatform()) return;
  const styleMap = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  };
  await Haptics.impact({ style: styleMap[style] });
};

export const hapticSuccess = async () => {
  if (!Capacitor.isNativePlatform()) return;
  await Haptics.notification({ type: NotificationType.Success });
};
```

Show the user what was added and where to call it from their components.

### Step 8: Build, sync, and submit new version

```bash
npm run build
npx cap sync
```

Increment the version in `package.json` (patch version: 1.0.0 → 1.0.1):
```bash
npm version patch
```

Then follow the build and submit steps from `ship` skill `references/04-build-and-submit.md`.

This requires a new App Store submission (not OTA) because native code changed.

### Step 9: Update memory

Update `build.last_build_date` and version in the app's memory file.

## Summary Output

```
✅ Added {feature} to {AppName}

What was installed: {package-name}
What changed: [brief description of code added]

A new build has been submitted to TestFlight and Play internal testing.
This update requires users to install the new version from the store —
it cannot be delivered over-the-air since native code changed.

To use {feature} in your Lovable app, call:
  import { hapticFeedback } from './lib/native/haptics'
  hapticFeedback('light') // on button press, etc.
```
