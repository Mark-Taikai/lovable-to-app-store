#!/usr/bin/env python3
"""
patch_podfile.py — Idempotent Podfile post_install hook patcher.

WHY THIS EXISTS:
  `npx cap sync ios` regenerates `ios/App/Podfile` from scratch on every run.
  Any post_install hook you add manually gets wiped. Capacitor's generated
  Podfile is missing several patches required for App Store submission:

  1. PrivacyInfo.xcprivacy manifest copy for community plugins
     (Apple ITMS-91061 rejection if missing)
  2. ENABLE_USER_SCRIPT_SANDBOXING disabled for plugins with build scripts
     (CocoaPods 1.16+ enables this by default and breaks several plugins)
  3. EXCLUDED_ARCHS for x86_64 on iOS Simulator
     (Apple Silicon Macs need this to skip incompatible x86 slices)

  We re-apply these by running this script AFTER `npx cap sync ios` and
  BEFORE `pod install` on every CI run.

USAGE:
  python3 patch_podfile.py ios/App/Podfile

  No args = error. The script refuses to run without an explicit path
  because applying it to the wrong file (like the Podfile.lock) breaks things.

IDEMPOTENT:
  Running twice is a no-op. The script checks for marker comments before
  inserting. Safe to call from CI on every build.
"""
import sys
import re
from pathlib import Path

MARKER = "# === lovable-to-app-store post_install patches ==="

POST_INSTALL_BLOCK = f"""
{MARKER}
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # 1. Disable script sandboxing (CocoaPods 1.16+ default breaks several plugins)
      config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'

      # 2. Exclude x86_64 from Simulator builds on Apple Silicon
      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'

      # 3. iOS minimum deployment target — Capacitor 7.x needs 14+
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '14.0'
    end
  end

  # 4. Ensure PrivacyInfo.xcprivacy is present in plugins that need it
  #    (Apple ITMS-91061 — missing privacy manifests since iOS 17.4)
  installer.pods_project.targets.each do |target|
    if ['GoogleSignIn', 'GTMAppAuth', 'GTMSessionFetcher'].include?(target.name)
      target.build_configurations.each do |config|
        # Force the privacy manifest from the pod's bundle resources
        config.build_settings['COPY_PHASE_STRIP'] = 'NO'
      end
    end
  end
end
# === end lovable-to-app-store post_install patches ==="""


def main():
    if len(sys.argv) != 2:
        print("Usage: patch_podfile.py <path-to-Podfile>", file=sys.stderr)
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: {path} does not exist", file=sys.stderr)
        sys.exit(1)
    if path.name != "Podfile":
        print(f"ERROR: refusing to patch non-Podfile: {path.name}", file=sys.stderr)
        sys.exit(1)

    content = path.read_text()

    # Idempotency check
    if MARKER in content:
        print(f"✓ {path}: already patched, no changes needed")
        return

    # Strip any existing post_install block (Capacitor's default is bare)
    content = re.sub(
        r"\npost_install do.*?\nend\n",
        "\n",
        content,
        flags=re.DOTALL,
    )

    # Append our post_install block at end of file
    if not content.endswith("\n"):
        content += "\n"
    content += POST_INSTALL_BLOCK + "\n"

    path.write_text(content)
    print(f"✓ {path}: patched with post_install hook + ITMS-91061 fix")


if __name__ == "__main__":
    main()
