# Build and Submit

> See also `references/10-build-gotchas-addendum.md` for the **silent-failure causes** that cost the most debug time (UIMainStoryboardFile missing = silent black screen, iosScheme:'https' silently rejected, cap sync wiping the Podfile post_install hook, Capacitor CLI/core version mismatch, Sign-in-with-Apple button white-on-white, plus the standard April 2026 issues — ITMS-91061 GoogleSignIn privacy manifest, provisioning profile invalidation after enabling capabilities, /tmp clearing between sessions, BglocationCapacitor pod removal, CocoaPods Unicode encoding).
>
> **Run the pre-archive verification checklist** in `10-build-gotchas-addendum.md` before every `xcodebuild archive`. It catches in 30 seconds what TestFlight processing won't fail on for 30 minutes.

## ⚠️ Before you commit anything: secret hygiene

The workflows below produce or reference several files that **must never be committed to your repo**:

- The Apple `.p8` private key (used to authenticate with the App Store Connect API)
- Any `.mobileprovision` or `.p12` certificate exports
- Your Android `.keystore` (and the password)
- `.env` files containing API keys

Before the first `git push`, append the contents of `references/templates/.gitignore.additions` to your repo's `.gitignore`. The template covers all the common signing artifacts plus build outputs.

If you've already pushed any of these by accident:
1. **Rotate the credential immediately** — revoking the leaked key in the issuing console is the only real fix; deleting from git history is not enough.
2. For Apple keys: revoke in App Store Connect → Users and Access → Integrations → API.
3. For Android: this is the unrecoverable case. If a `.keystore` for a published Play app leaks, contact Google Play support.
4. Then `git filter-repo` or BFG to scrub history, force-push, and consider the repo permanently compromised.

---

## iOS Build — GitHub Actions CI (Recommended)

The most reliable way to build and sign a Capacitor iOS app is via GitHub Actions with a `macos-latest` runner. This avoids local Xcode setup, handles certificate and provisioning profile creation automatically via the App Store Connect API, and produces a TestFlight upload with zero manual steps.

**Prerequisites:** GitHub Actions secrets must be set (see `02-service-registration.md` — App Store Connect API Key section).

See `references/06-ci-signing.md` for the complete workflow files to commit to the repo. Once committed, every push to `main` (or manual trigger) will build and upload to TestFlight automatically.

---

## iOS Build — Manual (fallback if CI is not set up)

### Why Automatic Signing Fails for Capacitor Apps

Capacitor apps that include RevenueCat (and other Swift Package Manager dependencies) **cannot use `CODE_SIGN_STYLE=Automatic`** passed as an xcodebuild CLI argument. Xcode silently ignores CLI signing overrides for SPM packages, causing the build to fail with:

```
error: No profiles for 'com.yourapp.bundle': iOS App Development
provisioning profiles are not available for App Store distribution.
```

The fix is to patch signing settings **directly into `project.pbxproj`** before running `xcodebuild archive`, so every target (including SPM dependencies) sees the correct values.

### Step 1: Create Distribution Certificate and Provisioning Profile

The automated approach (used in GitHub Actions CI) is in `06-ci-signing.md`.

Manually:
1. Open Xcode → Preferences → Accounts → select your Apple ID → Manage Certificates → "+" → Apple Distribution
2. Go to developer.apple.com → Certificates, Identifiers & Profiles → Profiles → "+" → App Store Distribution → select your App ID → select your certificate → Download as `.mobileprovision`

### Step 2: Patch project.pbxproj Signing Settings (Critical Step)

Run this Python snippet to globally replace all signing settings in the pbxproj. This ensures every Xcode target — including SPM dependency targets like RevenueCat — picks up the correct values:

```python
import re, os

bundle_id = '{bundle_id}'
profile_uuid = '{provisioning_profile_uuid}'
team_id = '{apple_team_id}'
pbx = 'ios/App/App.xcodeproj/project.pbxproj'

with open(pbx) as f:
    c = f.read()

# Replace signing settings globally (affects ALL targets and configurations)
c = re.sub(r'CODE_SIGN_IDENTITY = "[^"]*";',
           'CODE_SIGN_IDENTITY = "iPhone Distribution";', c)
c = re.sub(r'CODE_SIGN_STYLE = [A-Za-z]+;',
           'CODE_SIGN_STYLE = Manual;', c)

# Remove any existing PROVISIONING_PROFILE lines, then re-insert after bundle ID
c = re.sub(r'\n[ \t]+PROVISIONING_PROFILE[^\n]*', '', c)
c = c.replace(
    f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
    f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};\n\t\t\t\tPROVISIONING_PROFILE = "{profile_uuid}";'
)

# Ensure DEVELOPMENT_TEAM is set
c = re.sub(r'DEVELOPMENT_TEAM = [^;]*;', f'DEVELOPMENT_TEAM = {team_id};', c)

with open(pbx, 'w') as f:
    f.write(c)

print("Signing settings patched.")
```

> **Why global replacement?** The pbxproj has multiple XCBuildConfiguration blocks — one per target (app, RevenueCat, RevenueCatUI, etc.) × configuration (Debug, Release). Trying to patch only the app's Release block by counting braces is fragile and error-prone. Replacing all occurrences globally is safe because `xcodebuild archive` uses the Release configuration, and all distribution targets should be signed with the same certificate anyway.

### Step 3: Install Certificate to Keychain

```bash
# Import the .p12 distribution certificate
security import /tmp/dist.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "{cert_password}" \
  -A -T /usr/bin/codesign

# Allow codesign to access the key without a password prompt
security set-key-partition-list \
  -S apple-tool:,apple: \
  -s -k "{login_keychain_password}" \
  ~/Library/Keychains/login.keychain-db
```

### Step 4: Install Provisioning Profile

```bash
mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp /tmp/dist.mobileprovision \
  ~/Library/MobileDevice/Provisioning\ Profiles/{profile_uuid}.mobileprovision
```

Xcode finds profiles by UUID filename — the UUID must match what's in `project.pbxproj`.

### Step 5: Archive

```bash
xcodebuild archive \
  -destination 'generic/platform=iOS' \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath /tmp/App.xcarchive \
  DEVELOPMENT_TEAM={apple_team_id}
```

> **Do NOT pass `CODE_SIGN_IDENTITY` or `CODE_SIGN_STYLE` as CLI args here.** Those are already set in the pbxproj (Step 2). CLI signing overrides do not propagate to SPM dependency targets — only pbxproj values do.

### Step 6: Export IPA

Create `/tmp/ExportOptions.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>{apple_team_id}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>{bundle_id}</key>
    <string>{provisioning_profile_uuid}</string>
  </dict>
  <key>uploadBitcode</key>
  <false/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
```

```bash
xcodebuild -exportArchive \
  -archivePath /tmp/App.xcarchive \
  -exportPath /tmp/App-ipa \
  -exportOptionsPlist /tmp/ExportOptions.plist
```

### Step 7: Upload to TestFlight

```bash
xcrun altool --upload-app \
  -f "/tmp/App-ipa/{AppName}.ipa" \
  -t ios \
  --apiKey {asc_key_id} \
  --apiIssuer {asc_issuer_id}
```

> `altool` may warn that `--apiKey / --apiIssuer` is deprecated in favour of `app-store-connect`. Both work as of Xcode 16. The upload still succeeds despite the warning.

---

## Common iOS Build Errors and Fixes

| Error | Root Cause | Fix |
|-------|-----------|-----|
| `No profiles for '{bundle_id}': iOS App Development` | `CODE_SIGN_STYLE=Automatic` CLI arg used, or pbxproj only partially patched — SPM dependency targets still have Development signing | Run global pbxproj patch (Step 2) replacing ALL occurrences in the file, not just the app target block |
| `Signing identity not found in keychain` | Distribution certificate not imported | Import the `.p12` to the keychain (Step 3) before archiving |
| `"iPhone Distribution" ambiguous (matches multiple)` | Multiple distribution certs installed | Specify the full cert name including team: `CODE_SIGN_IDENTITY = "Apple Distribution: Your Name (TEAMID)";` |
| `exportArchive: No signing certificate "iPhone Distribution"` | Cert not in keychain at export time | Import the `.p12` before running `xcodebuild archive`, not just before export |
| `Command PhaseScriptExecution failed` | Capacitor sync issue | Run `npx cap sync` then retry |
| `CocoaPods not installed` | Missing dependency manager | `sudo gem install cocoapods && cd ios && pod install` |
| Pod version conflicts | Outdated lockfile | `cd ios && pod update` |
| `altool: No suitable application records` | App not created in App Store Connect | Create the app listing in App Store Connect first (see `02-service-registration.md`) |
| `altool: authentication credentials are missing` | API key secrets not set | Check `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` secrets in GitHub Actions |

---

## Android Build

### Check build tools
```bash
echo $ANDROID_HOME
ls /tmp/lovable-to-app-store/{repo-name}/android/gradlew
```

### Build Release Bundle
```bash
cd /tmp/lovable-to-app-store/{repo-name}/android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Sign the Bundle

> ⚠️ **CRITICAL: Keep the keystore safe.** Once you publish an Android app to Google Play, you can ONLY release updates to it by signing them with the same keystore. **Losing the keystore = permanently losing the ability to update that app.** Google does not let you "reset" or "regenerate" the signing key for an existing Play Store listing. Treat the keystore like an irreplaceable secret: store it in `~/Documents/Claude/lovable-to-app-store/keystores/` (NOT `/tmp/`, which is wiped between sessions), and back it up to a password manager or encrypted off-device storage before you ship the first version.

If no keystore exists for this client, create one in the persistent location defined in `05-memory-schema.md`:
```bash
mkdir -p ~/Documents/Claude/lovable-to-app-store/keystores
keytool -genkey -v \
  -keystore ~/Documents/Claude/lovable-to-app-store/keystores/{client-name}.keystore \
  -alias {client-name} \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
**Important:** Ask the user for the keystore password. Save the keystore file path and alias to memory. Do NOT save the password — the user must provide it each time.

**Immediately after creation, remind the user to back up the keystore file.** A copy in 1Password / Bitwarden / encrypted cloud storage is the difference between "we can ship updates forever" and "we have to delist the app and start over with a new bundle ID."

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore ~/Documents/Claude/lovable-to-app-store/keystores/{client-name}.keystore \
  android/app/build/outputs/bundle/release/app-release.aab \
  {client-name}
```

### Upload to Google Play Internal Testing
Navigate browser to: https://play.google.com/console → select the app → Testing → Internal testing → Create new release → Upload the `.aab` file

---

## EAS Build Fallback (for non-Mac users or persistent Xcode failures)

If the build fails after 3 attempts, offer EAS:

```bash
npm install -g eas-cli
eas login
```
Ask user to sign in to their Expo account in the browser.

```bash
cd /tmp/lovable-to-app-store/{repo-name}
eas build:configure
```

```bash
# iOS (uploads directly to TestFlight)
eas build --platform ios --profile production --auto-submit

# Android
eas build --platform android --profile production
```

EAS builds in the cloud and handles all signing automatically. Walk the user through linking their Apple and Google accounts in the EAS dashboard if not already done.

---

## After Successful Submission

- **iOS:** Processing takes 15-60 minutes. TestFlight testers get notified automatically once Apple approves the build.
- **Android:** Internal testing is available within minutes of upload.
- Send the user both links and tell them how to invite testers.
