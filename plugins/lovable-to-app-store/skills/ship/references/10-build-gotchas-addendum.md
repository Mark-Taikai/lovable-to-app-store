# Build Gotchas Addendum (April 2026)

Lessons learned that supplement the ship-with-mac skill's `00-gotchas.md`.

---

## 🩻 The Silent Black Screen — Missing `UIMainStoryboardFile`

**Symptom:** App launches past the splash screen. Status bar appears at the
top. Below it: pure black, forever. No JS errors. No crash. No Capacitor logs
(`⚡️ Loading app at...` never appears). The app stays "alive" indefinitely
showing nothing. Force-quit and relaunch produces the same.

**Root cause:** `ios/App/App/Info.plist` is missing the `UIMainStoryboardFile`
key. Without it, iOS doesn't load `Main.storyboard`, so the
`CAPBridgeViewController` (which lives in the storyboard) is never
instantiated, no WKWebView is created, and `UIWindow` shows through with no
root view controller — pure-black + status bar.

**Why it's painful:** the symptom looks IDENTICAL to a WKWebView that loaded
but never finished navigation (the dark-mode `systemBackground` showing
through `isOpaque=false`). You can spend hours chasing scheme handlers,
config parsing, and asset bundling before realising the bridge was never
even instantiated.

**Verification — run this BEFORE every archive:**
```bash
/usr/libexec/PlistBuddy -c 'Print :UIMainStoryboardFile' \
                        ios/App/App/Info.plist
# Must print "Main". If you see "Print: Entry, ":UIMainStoryboardFile",
# Does Not Exist", that's the bug. Re-add it via:

/usr/libexec/PlistBuddy -c 'Add :UIMainStoryboardFile string Main' \
                        ios/App/App/Info.plist
```

**Why it goes missing:** `npx cap add ios` scaffolds the key correctly. But
agents (and humans) doing manual cleanup of `Info.plist` — for example
"removing unused keys" or "simplifying the file" — sometimes delete it
without realising it's load-bearing. The fix went into the frozen template
in `info-plist-additions.xml` v1.1.2 with a giant warning banner; this
gotcha entry exists to document the symptom for future sessions.

---

## `iosScheme: 'https'` is silently rejected (do not set it)

**Symptom:** Black screen on launch. Sometimes only on certain iOS versions
or on real devices but not simulator (or vice versa).

**Root cause:** Capacitor's `InstanceDescriptor.normalize()` rejects any
`urlScheme` that `WKWebView.handlesURLScheme()` returns `true` for — and
WKWebView reserves `https`, `http`, `file`, `about`, `data`, `blob`. So
setting `server.iosScheme: 'https'` silently falls back to the default
`capacitor` scheme. The WebView registers its `WebViewAssetHandler` for
`capacitor://`, but the bundled `capacitor.config.json` says the server URL
is `https://localhost`. Navigation requested at `https://localhost/index.html`
finds no scheme handler, fails, and `WebViewDelegationHandler.didFinish`
never fires — `webView.isOpaque` stays `false` (set in `willLoadWebview`),
exposing the system background color.

**Fix:** never set `iosScheme` in `capacitor.config.ts`. iOS uses the default
`capacitor` scheme. Only set `androidScheme: 'https'` (Android does not
reserve `https` for WebView).

The frozen `capacitor.config.ts` template (v1.1.2+) explicitly omits
`iosScheme` and includes a warning comment.

---

## `cap sync` wipes the Podfile post_install hook every time

**Symptom:** First build works. After making any change and re-running
`cap sync` (or `cap update ios`), the next archive fails with ITMS-91061
(missing privacy manifests for GoogleSignIn / GTMAppAuth / GTMSessionFetcher).

**Root cause:** `npx cap sync ios` regenerates `ios/App/Podfile` from the
template, replacing the entire `post_install do |installer|` block with a
minimal one that only calls `assertDeploymentTarget(installer)`. Any
privacy-manifest injection, custom build settings, or other hooks you added
disappear.

**Fix:** wrap your build in a script that re-applies the hook after every
`cap sync`. Example pattern:

```bash
npx cap sync ios

python3 - << 'PY'
import pathlib, re
p = pathlib.Path('ios/App/Podfile')
HOOK = """
post_install do |installer|
  assertDeploymentTarget(installer)

  pods_needing_manifest = %w[GTMAppAuth GTMSessionFetcher GoogleSignIn]

  privacy_manifest_content = <<~PLIST
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
      "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>NSPrivacyTracking</key><false/>
      <key>NSPrivacyTrackingDomains</key><array/>
      <key>NSPrivacyCollectedDataTypes</key><array/>
      <key>NSPrivacyAccessedAPITypes</key>
      <array>
        <dict>
          <key>NSPrivacyAccessedAPIType</key>
          <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
          <key>NSPrivacyAccessedAPITypeReasons</key>
          <array><string>CA92.1</string></array>
        </dict>
      </array>
    </dict>
    </plist>
  PLIST

  installer.pods_project.targets.each do |target|
    if pods_needing_manifest.include?(target.name)
      pod_dir = installer.sandbox.pod_dir(target.name)
      manifest_path = pod_dir + 'PrivacyInfo.xcprivacy'
      File.write(manifest_path, privacy_manifest_content) unless manifest_path.exist?
      file_ref = target.project.new_file(manifest_path.to_s)
      target.resources_build_phase.add_file_reference(file_ref)
    end
  end
end
"""
content = p.read_text()
new = re.sub(r'post_install do \|installer\|.*?\nend\s*\Z', HOOK.strip()+'\n', content, flags=re.DOTALL)
p.write_text(new if new != content else content.rstrip()+'\n\n'+HOOK.strip()+'\n')
print("Podfile post_install hook re-applied")
PY

cd ios/App && pod install
```

CI workflows (`.github/workflows/ios-testflight.yml`) already call this in
their build steps. If you're building locally, integrate it into your
build script.

---

## Capacitor CLI / Core / iOS version mismatch

**Symptom:** `cap sync` succeeds but produces a broken `capacitor.config.json`
or empty `packageClassList`. App archives but black-screens at runtime, or
plugins are silently not registered.

**Root cause:** `@capacitor/cli` is version-locked to a different major
version than `@capacitor/core` and `@capacitor/ios`. The CLI generates output
in its own format; the iOS pod expects matching format. Mixing CLI v6 with
core/ios v8 produces a config the runtime can't parse correctly.

**Fix:** keep all three packages on the same major version in `package.json`:

```jsonc
"dependencies": {
  "@capacitor/cli":  "^8.3.0",
  "@capacitor/core": "^8.3.0",
  "@capacitor/ios":  "^8.3.0",
  "@capacitor/android": "^8.3.0"
}
```

**Node version requirement:** Capacitor CLI v8.3+ requires Node `>=22.0.0`.
On Node 20, `cap sync` aborts with `[fatal] The Capacitor CLI requires
NodeJS >=22.0.0`. Use `nvm use 22` (or set `NVM_NODE` in your build script
to a v22 path) before any `cap` invocation.

---

## Sign-in-with-Apple button renders blank white in WKWebView

**Symptom:** The "Continue with Apple" button is visible as a rounded pill
shape but contains no logo and no text — just a flat white rectangle.

**Root cause:** the button uses `bg-white/10` (10% white over a translucent
backdrop) plus `backdrop-blur-sm` plus `text-white`. WKWebView on iOS
sometimes renders translucent + backdrop-filter as solid white when the
underlying content is dark, hiding the white logo and text.

**Fix:** use Apple's HIG-compliant solid-black variant for the dark mode
button instead of trying to integrate it with the surrounding glass UI.

```tsx
<Button
  onClick={() => handleOAuthSignIn("apple")}
  // Inline style avoids any utility-class compile/order issue.
  style={{ backgroundColor: "#000000", color: "#ffffff" }}
  className="w-full rounded-full h-[44px] gap-2.5 hover:opacity-90 border-0 shadow-md"
>
  <svg viewBox="0 0 24 24" fill="#ffffff" className="w-[18px] h-[18px]">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
  Continue with Apple
</Button>
```

The pure-black + white-icon variant matches Apple's reference button and
contrasts cleanly against any background.

---

## Pre-archive verification checklist (run before every TestFlight upload)

These are the silent-failure causes worth the 30 seconds of script overhead.
Bake them into your build script — the cost of catching them late is a
30-minute round-trip through TestFlight processing.

```bash
set -e
cd ios/App/App

# 1. UIMainStoryboardFile — silent black screen if missing
/usr/libexec/PlistBuddy -c 'Print :UIMainStoryboardFile' Info.plist | grep -q '^Main$' \
  || { echo 'FAIL: UIMainStoryboardFile missing from Info.plist'; exit 1; }

# 2. iosScheme:'https' must NOT be in capacitor.config — silent black screen
! grep -q "iosScheme.*['\"]https['\"]" ../../capacitor.config.ts \
  || { echo 'FAIL: iosScheme:'\''https'\'' is silently rejected by Capacitor — remove it'; exit 1; }

# 3. CLI / core / ios versions all on same major
NODE_VERSION=$(node --version | sed 's/v//')
[[ "${NODE_VERSION%%.*}" -ge 22 ]] || { echo 'FAIL: Node 22+ required for Capacitor CLI v8'; exit 1; }
CLI=$(node -p "require('../../node_modules/@capacitor/cli/package.json').version")
CORE=$(node -p "require('../../node_modules/@capacitor/core/package.json').version")
IOS=$(node -p "require('../../node_modules/@capacitor/ios/package.json').version")
[[ "${CLI%%.*}" == "${CORE%%.*}" && "${CORE%%.*}" == "${IOS%%.*}" ]] \
  || { echo "FAIL: Capacitor majors mismatch — CLI=$CLI CORE=$CORE IOS=$IOS"; exit 1; }

# 4. Podfile post_install must include privacy manifest hook (or you'll hit ITMS-91061)
grep -q 'pods_needing_manifest' ../Podfile \
  || { echo 'FAIL: Podfile missing privacy manifest post_install hook (run cap sync, then re-apply)'; exit 1; }

# 5. GoogleSignIn pod >= 7.1.0 (required for App Store submission)
GS=$(grep -A1 'GoogleSignIn (' ../Podfile.lock 2>/dev/null | head -2 | tail -1 | grep -oE '[0-9]+\.[0-9]+')
[[ -n "$GS" ]] && [[ "$GS" > "7.0" ]] || { echo "FAIL: GoogleSignIn pod $GS < 7.1 — ITMS-91061 will block upload"; exit 1; }

# 6. Bundled web assets are present in public/
[ -f public/index.html ] && [ "$(wc -c < public/index.html)" -gt 1000 ] \
  || { echo 'FAIL: ios/App/App/public/index.html missing or too small'; exit 1; }

echo '✓ Pre-archive verification passed'
```

If you use the GitHub Actions CI workflow (recommended), add this script as
a step before `xcodebuild archive`.

---

## Pre-flight on simulator BEFORE TestFlight upload

**Why:** TestFlight processing + propagation = 5–15 minutes per upload. If
your build has a bug, that's wasted round-trip time. A simulator install
takes 90 seconds and reproduces the same bundled assets, native plugins,
and Capacitor wiring. Catching a regression there saves hours.

**Recipe:**

```bash
# Build for simulator with the SAME source — no signing required
DEVICE_ID=$(xcrun simctl list devices available \
  | grep -E '^\s+iPhone 1[5-9] Pro \(' | head -1 \
  | grep -oE '\([0-9A-F-]{36}\)' | tr -d '()')
xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
open -a Simulator

xcodebuild build \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath /tmp/sim-derived \
  CODE_SIGNING_ALLOWED=NO

APP=$(find /tmp/sim-derived/Build/Products -name 'App.app' -path '*Simulator*' | head -1)
xcrun simctl install "$DEVICE_ID" "$APP"
xcrun simctl launch "$DEVICE_ID" {{BUNDLE_ID}}

sleep 8
xcrun simctl io "$DEVICE_ID" screenshot /tmp/sim-test.png
open /tmp/sim-test.png
```

If the simulator screenshot shows your actual login screen → the build
is good, archive + upload. If it shows a black screen or the boot-error
overlay → fix it locally before burning a TestFlight slot.

The app-publisher memory file should record `simulator_test_passed` per
build to enforce this in future workflows.

---

## Verify the archive's embedded provisioning profile is AppStore type

**Symptom:** `xcodebuild archive` succeeds. Upload to TestFlight fails
with "Invalid Binary" or "Distribution-only signing required."

**Root cause:** Your pbxproj or CLI flags ended up using Apple
Development cert + Team Provisioning Profile (which is for development
sideloading), not Apple/iPhone Distribution + App Store profile.
TestFlight requires the latter.

**Fix:** verify before uploading:

```bash
APP=~/finally-archive/Build${N}.xcarchive/Products/Applications/App.app

# 1. Profile type
security cms -D -i "$APP/embedded.mobileprovision" 2>/dev/null \
  | python3 -c '
import plistlib, sys
d = plistlib.loads(sys.stdin.buffer.read())
type_ = "AppStore" if not d.get("ProvisionedDevices") and d.get("ProvisionsAllDevices") is None else "Dev/AdHoc"
print("Type:", type_, "  Name:", d.get("Name"))
'
# Must say  Type: AppStore  Name: ... AppStore

# 2. Cert authority
codesign -dvv "$APP" 2>&1 | grep '^Authority='
# Must include "Apple Distribution" or "iPhone Distribution"
# If you see "Apple Development" → build was Dev-signed, will fail upload
```

The `templates/build-local.sh` template runs both checks automatically
between archive and export, so you can't accidentally upload a
Dev-signed binary.

---

## NEVER pass `CODE_SIGN_STYLE` or `CODE_SIGN_IDENTITY` on the xcodebuild CLI

**Symptom:** `xcodebuild archive` says it's using Manual signing with
your Distribution cert, but the embedded.mobileprovision in the produced
archive is a Development profile, signed with Apple Development cert.
Upload fails.

**Root cause:** xcodebuild CLI signing overrides do **not** propagate to
SPM dependency targets like RevenueCat, RevenueCatUI, or any other
Swift Package Manager package. They keep their own per-target signing
settings from the pbxproj, which default to "automatic" and pick the
first available cert (usually Apple Development).

**Fix:** patch signing into pbxproj globally with Python BEFORE running
`xcodebuild archive`. This affects every target in the file (app + SPM
dependencies + CocoaPods targets). See `04-build-and-submit.md` Step 2
for the canonical Python snippet, or use `templates/build-local.sh`
which calls it for you.

Then run xcodebuild **without** any signing-related flags:

```bash
xcodebuild archive \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/Build.xcarchive \
  DEVELOPMENT_TEAM=$TEAM_ID \
  "OTHER_CODE_SIGN_FLAGS=--keychain $KEYCHAIN"
  # NO CODE_SIGN_STYLE, NO CODE_SIGN_IDENTITY, NO PROVISIONING_PROFILE_SPECIFIER
```

---

## Parallel build instances duplicate the Podfile post_install hook

**Symptom:** `pod install` fails with `[!] Invalid Podfile: Specifying
multiple post_install hooks is unsupported.`

**Root cause:** You ran two build scripts at the same time. The first
re-applied the privacy-manifest hook (which `cap sync` had wiped). The
second saw a Podfile that already had the hook, didn't recognize it as
a duplicate of its OWN re-injection, and appended again. Now the file
has two `post_install do |installer|` blocks.

**Fix:** put a lock file at the top of every build script. Refuse to
run if another instance is going. The `templates/build-local.sh`
template has the canonical pattern:

```bash
LOCKFILE=/tmp/myapp-build.lock
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Another instance running (PID $PID). Aborting."; exit 1
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT
```

If you do hit the duplicate-hook error, manually edit `ios/App/Podfile`
to delete one of the `post_install do ... end` blocks before re-running.

---

## PurchasesHybridCommon: missing Swift files after pod install

**Symptom:** `xcodebuild archive` fails repeatedly with errors like:

```
error: Error opening input file '.../Pods/PurchasesHybridCommon/ios/PurchasesHybridCommon/PurchasesHybridCommon/VirtualCurrency+HybridAdditions.swift' (No such file or directory)
```

…even though `pod install` completed without errors.

**Root cause:** Your local CocoaPods cache has an incomplete copy of the
`PurchasesHybridCommon` pod. When pod install runs, it sees the cached
podspec and copies what it has — which is missing the Swift files that
were added in a later release. The Podfile.lock claims version X but
the on-disk pod is missing files from version X.

**Fix:** clear the pod cache for that specific pod, then reinstall:

```bash
pod cache clean PurchasesHybridCommon --all
rm -rf ios/App/Pods ios/App/Podfile.lock
cd ios/App && pod install --repo-update
```

The `--repo-update` flag forces CocoaPods to refresh its specs index
before install, picking up the latest podspec versions.

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
