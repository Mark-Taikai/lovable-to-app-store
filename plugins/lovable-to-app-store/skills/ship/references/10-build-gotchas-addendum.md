# Build Gotchas Addendum (April 2026)

Lessons learned that supplement the ship-with-mac skill's `00-gotchas.md`.

---

## ITMS-90683: Missing NSLocationWhenInUseUsageDescription

**Symptom:** Apple emails after upload warning about missing purpose string in Info.plist.

**Root cause:** Capacitor plugins like `@bglocation/capacitor` or `onesignal-cordova-plugin` reference CoreLocation APIs. Even if your app doesn't use location, the compiled binary includes the references and Apple flags it.

**Fix:** Add ALL three location usage description keys to `ios/App/App/Info.plist` preemptively:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription`

The permission dialog only appears when code actually calls CLLocationManager, so these are harmless if unused.

---

## Provisioning Profile "Invalid" After Adding Capabilities

After enabling a capability (e.g., Sign in with Apple) on the App ID, the existing provisioning profile becomes "Invalid."

**Fix:**
1. Apple Developer Portal → Profiles → click invalid profile → Edit → select cert → Save
2. Download the new profile
3. Get UUID: `security cms -D -i profile.mobileprovision | grep -A1 UUID | grep string`
4. Copy to: `~/Library/MobileDevice/Provisioning Profiles/<UUID>.mobileprovision`
5. Update `PROVISIONING_PROFILE` UUID in `project.pbxproj`

---

## App.entitlements + CODE_SIGN_ENTITLEMENTS

Both must be in place for capabilities like Sign in with Apple:
1. File: `ios/App/App/App.entitlements` with the entitlement keys
2. Build setting: `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` in BOTH Debug and Release in pbxproj

Add via Python to avoid corruption:
```python
content = content.replace(
    'CODE_SIGN_IDENTITY = "iPhone Distribution";',
    'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\nCODE_SIGN_IDENTITY = "iPhone Distribution";'
)
```

---

## @bglocation/capacitor Broken iOS Dependency

The `@bglocation/capacitor` plugin has a broken native dependency (BGLocationCore missing). Remove from Podfile for every build:
```bash
sed -i '' '/BglocationCapacitor/d' ios/App/Podfile
```
The web code uses dynamic import so it won't crash — geofencing just won't work on iOS until the plugin is fixed.

---

## CocoaPods Unicode Encoding Error

**Symptom:** `pod install` fails with `Encoding::CompatibilityError` about ASCII-8BIT.

**Fix:** Set `LANG=en_US.UTF-8` before running any CocoaPods command:
```bash
export LANG=en_US.UTF-8
cd ios/App && pod install
```

---

## ITMS-91061: Missing Privacy Manifest (GoogleSignIn)

**Symptom:** Apple emails after upload warning about missing privacy manifests for GoogleSignIn.framework, GTMAppAuth.framework, and GTMSessionFetcher.framework.

**Root cause:** `@codetrix-studio/capacitor-google-auth` pulls in a GoogleSignIn iOS SDK version < 7.1.0, which lacks the Apple-required `PrivacyInfo.xcprivacy` files.

**Fix (already applied in Lovable 2026-04-22):** Updated `@codetrix-studio/capacitor-google-auth` to latest in package.json. This pulls GoogleSignIn >= 7.1.0 which includes privacy manifests.

**Pre-build verification (ALWAYS do this after pod install):**
```bash
grep -A1 'GoogleSignIn (' ios/App/Podfile.lock | head -2
# Must show >= 7.1.0
```

**If version is still too old after cap sync:**
```bash
cd ios/App
pod update GoogleSignIn GTMAppAuth GTMSessionFetcher
pod install
```

**Nuclear option (if pod update doesn't help):** Add to `ios/App/Podfile` before the `post_install` block:
```ruby
pod 'GoogleSignIn', '~> 8.0'
```

---

## /tmp Cleared Between Sessions

The `/tmp/lovable-to-app-store/` directory gets cleared between Cowork sessions. Items that must be recreated:
- `export-options.plist` (use plistlib to create)
- Build scripts
- Clone the repo (`git clone`)
- `npm install --legacy-peer-deps`
- Remove BglocationCapacitor from Podfile
- `pod install` with LANG=en_US.UTF-8
- Verify GoogleSignIn pod >= 7.1.0 in Podfile.lock (prevents ITMS-91061)
