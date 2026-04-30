#!/bin/bash
# build-local.sh — Idempotent local-Mac TestFlight build script.
#
# Substitute the {{...}} values for your app, then run:
#   bash build-local.sh
#
# What it does (in order):
#   0. Lock file — refuses to run if another instance is already going
#      (prevents Finally-style "two parallel instances duplicate the
#       Podfile post_install hook" bugs).
#   1. Selects Node 22 from nvm (Capacitor CLI v8.3+ requires it).
#   2. Re-applies the privacy-manifest post_install hook to ios/App/Podfile
#      (cap sync wipes it every time — see ../10-build-gotchas-addendum.md).
#   3. Runs the pre-archive verification block from the gotchas addendum.
#   4. Unlocks the build keychain (Distribution cert lives there).
#   5. Bumps CFBundleVersion + CURRENT_PROJECT_VERSION.
#   6. xcodebuild archive with Manual signing (NEVER pass CODE_SIGN_STYLE
#      on CLI — it doesn't propagate to SPM dependencies like RevenueCat).
#   7. Verifies the archive's embedded.mobileprovision is AppStore type
#      and signed with iPhone Distribution (not Apple Development).
#   8. xcodebuild -exportArchive → IPA.
#   9. xcrun altool --upload-app → TestFlight.
#  10. Calls asc-submit.py to add to Beta Testers + submit for review.

set -e
set -o pipefail

# ──────── 0. Lock file (parallel-instance guard) ────────────────────────────
LOCKFILE=/tmp/{{LOCK_NAME}}.lock
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Another instance running (PID $PID). Aborting."; exit 1
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

# ──────── 1. Environment + Node 22 ──────────────────────────────────────────
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
NODE_DIR=$(ls -d ~/.nvm/versions/node/v22* 2>/dev/null | sort -V | tail -1)
[ -z "$NODE_DIR" ] && { echo 'FAIL: Node 22 not in nvm. Capacitor CLI v8.3+ requires it.'; exit 1; }
export PATH="$NODE_DIR/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

BASE={{PROJECT_PATH}}                          # e.g. ~/Documents/Claude/myapp
BUILD_NUM={{BUILD_NUM}}                        # e.g. 42 — sequential, never reuse
ARCHIVE_DIR=~/finally-archive                  # cache between builds
EXPORT_DIR=$ARCHIVE_DIR/export-$BUILD_NUM
LOG=~/build-${BUILD_NUM}.log

# Signing (from app-publisher memory file)
TEAM_ID={{APPLE_TEAM_ID}}                       # e.g. ABCDE12345
PROFILE_UUID={{PROVISIONING_PROFILE_UUID}}     # e.g. 37d39993-...
KEYCHAIN={{KEYCHAIN_PATH}}                      # e.g. ~/Library/Keychains/build.keychain-db

# App Store Connect API
API_KEY_ID={{ASC_KEY_ID}}                       # 10-char ID from ASC Users and Access -> Integrations -> Keys
API_ISSUER={{ASC_ISSUER_ID}}                   # UUID from same page (top-right)

cd $BASE
echo "=== BUILD $BUILD_NUM START $(date) ===" | tee $LOG
echo "Node: $(node --version)  CLI: $(node -p 'require(\"./node_modules/@capacitor/cli/package.json\").version')" | tee -a $LOG

# ──────── 2. cap sync wipes the post_install hook — re-apply it ─────────────
echo '[2] cap sync ios + re-apply Podfile post_install hook...' | tee -a $LOG
unset CAP_DEV_RELOAD                  # belt-and-suspenders: production = bundled
npx cap sync ios >> $LOG 2>&1 || true # may fail at pod install (we re-run below)
python3 - << 'PY' >> $LOG 2>&1
import pathlib, re
p = pathlib.Path('ios/App/Podfile')
HOOK = """
post_install do |installer|
  assertDeploymentTarget(installer)
  pods_needing_manifest = %w[GTMAppAuth GTMSessionFetcher GoogleSignIn]
  privacy_manifest_content = <<~PLIST
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
      <key>NSPrivacyTracking</key><false/>
      <key>NSPrivacyTrackingDomains</key><array/>
      <key>NSPrivacyCollectedDataTypes</key><array/>
      <key>NSPrivacyAccessedAPITypes</key><array>
        <dict>
          <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
          <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
        </dict>
      </array>
    </dict></plist>
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
print('Podfile post_install hook re-applied')
PY

# Strip @bglocation/capacitor pod (broken iOS podspec — see gotchas).
# Comment out if your app actually uses it on iOS.
python3 -c "
import pathlib, re
p = pathlib.Path('ios/App/Podfile')
p.write_text(re.sub(r\"\\s*pod 'BglocationCapacitor'.*?\\n\", '\\n', p.read_text()))
" || true

# Fresh pod install with cleared cache (avoids PurchasesHybridCommon
# missing-Swift-files errors from incomplete pod cache).
echo '[2b] pod install (fresh, with --repo-update)...' | tee -a $LOG
pod cache clean PurchasesHybridCommon --all >> $LOG 2>&1 || true
rm -rf ios/App/Pods ios/App/Podfile.lock
(cd ios/App && pod install --repo-update) >> $LOG 2>&1

# ──────── 3. Pre-archive verification ───────────────────────────────────────
echo '[3] Pre-archive verification...' | tee -a $LOG
cd $BASE/ios/App/App
/usr/libexec/PlistBuddy -c 'Print :UIMainStoryboardFile' Info.plist | grep -q '^Main$' \
  || { echo 'FAIL: UIMainStoryboardFile missing — silent black screen on launch'; exit 1; }
! grep -q "iosScheme.*['\"]https['\"]" ../../capacitor.config.ts \
  || { echo 'FAIL: iosScheme:https is silently rejected by Capacitor'; exit 1; }
GS=$(grep -A1 'GoogleSignIn (' ../Podfile.lock 2>/dev/null | head -2 | tail -1 | grep -oE '[0-9]+\.[0-9]+')
[ -n "$GS" ] && [[ "$GS" > "7.0" ]] || { echo "FAIL: GoogleSignIn pod $GS < 7.1 (ITMS-91061 will block upload)"; exit 1; }
[ -f public/index.html ] && [ "$(wc -c < public/index.html)" -gt 1000 ] \
  || { echo 'FAIL: ios/App/App/public/index.html missing or empty'; exit 1; }
grep -q 'pods_needing_manifest' ../Podfile \
  || { echo 'FAIL: Podfile missing privacy-manifest post_install hook'; exit 1; }
echo '  ✓ pre-archive verification passed' | tee -a $LOG
cd $BASE

# ──────── 4. Unlock build keychain ──────────────────────────────────────────
echo '[4] Unlock build.keychain-db...' | tee -a $LOG
security unlock-keychain -p '' "$KEYCHAIN" 2>/dev/null || true
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '' "$KEYCHAIN" 2>/dev/null || true

# ──────── 5. Bump CFBundleVersion ───────────────────────────────────────────
echo "[5] Bumping CFBundleVersion to $BUILD_NUM..." | tee -a $LOG
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUM" $BASE/ios/App/App/Info.plist
python3 -c "
import pathlib, re
p = pathlib.Path('ios/App/App.xcodeproj/project.pbxproj')
p.write_text(re.sub(r'CURRENT_PROJECT_VERSION = [0-9]+;', 'CURRENT_PROJECT_VERSION = $BUILD_NUM;', p.read_text()))
"

# ──────── 6. Archive ────────────────────────────────────────────────────────
echo '[6] xcodebuild archive (5-12 min)...' | tee -a $LOG
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*
mkdir -p $ARCHIVE_DIR
SDK=$(xcodebuild -showsdks 2>/dev/null | grep iphoneos | tail -1 | awk '{print $NF}')

xcodebuild archive \
  -workspace "$BASE/ios/App/App.xcworkspace" \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_DIR/Build${BUILD_NUM}.xcarchive" \
  -destination 'generic/platform=iOS' \
  DEVELOPMENT_TEAM=$TEAM_ID \
  "OTHER_CODE_SIGN_FLAGS=--keychain $KEYCHAIN" \
  >> $LOG 2>&1

[ -d "$ARCHIVE_DIR/Build${BUILD_NUM}.xcarchive" ] || { tail -50 $LOG; exit 1; }

# ──────── 7. Verify embedded.mobileprovision is AppStore type ───────────────
echo '[7] Verify archive signing...' | tee -a $LOG
APP_BUNDLE="$ARCHIVE_DIR/Build${BUILD_NUM}.xcarchive/Products/Applications/App.app"
EMBEDDED=$(security cms -D -i "$APP_BUNDLE/embedded.mobileprovision" 2>/dev/null | python3 -c "
import plistlib, sys
d = plistlib.loads(sys.stdin.buffer.read())
print('AppStore' if not d.get('ProvisionedDevices') and d.get('ProvisionsAllDevices') is None else 'Dev/AdHoc')
")
[ "$EMBEDDED" = "AppStore" ] || { echo 'FAIL: archive signed with non-AppStore profile'; exit 1; }
codesign -dvv "$APP_BUNDLE" 2>&1 | grep -q 'iPhone Distribution\|Apple Distribution' \
  || { echo 'FAIL: not signed with Distribution cert'; exit 1; }
echo '  ✓ AppStore profile + Distribution cert' | tee -a $LOG

# ──────── 8. Export IPA ─────────────────────────────────────────────────────
echo '[8] xcodebuild -exportArchive → IPA...' | tee -a $LOG
EXPORT_PLIST=$ARCHIVE_DIR/ExportOptions-${BUILD_NUM}.plist
cat > "$EXPORT_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>iPhone Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>{{BUNDLE_ID}}</key><string>{{PROVISIONING_PROFILE_NAME}}</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>stripSwiftSymbols</key><true/>
</dict></plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_DIR/Build${BUILD_NUM}.xcarchive" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  >> $LOG 2>&1

IPA=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
[ -z "$IPA" ] && { echo 'FAIL: IPA not produced'; exit 1; }
echo "  ✓ IPA: $IPA ($(du -sh "$IPA" | awk '{print $1}'))" | tee -a $LOG

# ──────── 9. altool upload ──────────────────────────────────────────────────
echo '[9] altool upload to App Store Connect...' | tee -a $LOG
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey $API_KEY_ID --apiIssuer $API_ISSUER --output-format xml \
  > /tmp/altool-${BUILD_NUM}.xml 2>> $LOG
grep -q 'success-message' /tmp/altool-${BUILD_NUM}.xml \
  || { echo 'FAIL: altool upload failed'; cat /tmp/altool-${BUILD_NUM}.xml; exit 1; }
grep delivery-uuid /tmp/altool-${BUILD_NUM}.xml | tee -a $LOG

# ──────── 10. Add to Beta Testers + submit for review ───────────────────────
echo '[10] asc-submit.py: poll processing → group → review submission...' | tee -a $LOG
python3 asc-submit.py \
  --app-id {{ASC_APP_ID}} \
  --build-number $BUILD_NUM \
  --group-name "Beta Testers" \
  --key-id $API_KEY_ID \
  --issuer-id $API_ISSUER \
  | tee -a $LOG

echo "=== BUILD $BUILD_NUM COMPLETE $(date) ==="
echo "TestFlight: https://testflight.apple.com/join/{{TESTFLIGHT_PUBLIC_KEY}}"
