#!/usr/bin/env python3
"""
patch_xcode_signing.py — Patch project.pbxproj signing settings GLOBALLY.

WHY THIS EXISTS:
  Capacitor apps that include RevenueCat (or any other Swift Package Manager
  dependency) cannot use `CODE_SIGN_STYLE=Automatic` passed as an xcodebuild
  CLI argument. Xcode silently ignores CLI signing overrides for SPM packages,
  causing the build to fail with:

    error: No profiles for 'com.yourapp.bundle': iOS App Development
    provisioning profiles are not available for App Store distribution.

  The fix is to patch signing settings DIRECTLY into project.pbxproj before
  running `xcodebuild archive`, so every target (including SPM dependencies)
  sees the correct values.

  Doing this manually inside the pbxproj is error-prone because the file has
  multiple XCBuildConfiguration blocks — one per target × configuration
  (Debug/Release). Trying to patch only the app's Release block by counting
  braces is fragile. We replace ALL occurrences globally instead, which is
  safe because `xcodebuild archive` uses Release, and all distribution
  targets should sign with the same cert anyway.

USAGE:
  Environment variables required:
    BUNDLE_ID            — e.g. com.yourcompany.yourapp
    APPLE_TEAM_ID        — your 10-char team ID
    PROVISIONING_PROFILE — UUID of the .mobileprovision (installed at
                           ~/Library/MobileDevice/Provisioning Profiles/{uuid}.mobileprovision)

  python3 patch_xcode_signing.py ios/App/App.xcodeproj/project.pbxproj

IDEMPOTENT:
  Running twice is a no-op.

WHAT IT DOES (in order):
  1. Sets CODE_SIGN_IDENTITY = "iPhone Distribution" everywhere
  2. Sets CODE_SIGN_STYLE = Manual everywhere
  3. Removes any existing PROVISIONING_PROFILE lines
  4. Inserts PROVISIONING_PROFILE = "{uuid}" after every PRODUCT_BUNDLE_IDENTIFIER
  5. Sets DEVELOPMENT_TEAM = {team_id} everywhere
"""
import os
import re
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        print("Usage: patch_xcode_signing.py <path-to-project.pbxproj>", file=sys.stderr)
        sys.exit(1)

    pbx = Path(sys.argv[1])
    if not pbx.exists():
        print(f"ERROR: {pbx} does not exist", file=sys.stderr)
        sys.exit(1)
    if pbx.name != "project.pbxproj":
        print(f"ERROR: refusing to patch non-pbxproj: {pbx.name}", file=sys.stderr)
        sys.exit(1)

    bundle_id = os.environ.get("BUNDLE_ID")
    profile_uuid = os.environ.get("PROVISIONING_PROFILE")
    team_id = os.environ.get("APPLE_TEAM_ID")
    if not all([bundle_id, profile_uuid, team_id]):
        print("ERROR: BUNDLE_ID, PROVISIONING_PROFILE, APPLE_TEAM_ID env vars all required", file=sys.stderr)
        sys.exit(1)

    c = pbx.read_text()

    # 1. CODE_SIGN_IDENTITY → iPhone Distribution
    c = re.sub(
        r'CODE_SIGN_IDENTITY = "[^"]*";',
        'CODE_SIGN_IDENTITY = "iPhone Distribution";',
        c,
    )

    # 2. CODE_SIGN_STYLE → Manual
    c = re.sub(
        r'CODE_SIGN_STYLE = [A-Za-z]+;',
        'CODE_SIGN_STYLE = Manual;',
        c,
    )

    # 3. Strip any existing PROVISIONING_PROFILE lines
    c = re.sub(r'\n\s+PROVISIONING_PROFILE[^\n]*', '', c)

    # 4. Insert PROVISIONING_PROFILE after every PRODUCT_BUNDLE_IDENTIFIER
    #    matching this bundle (skip pod build targets — they have their own bundles)
    c = c.replace(
        f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
        f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};\n\t\t\t\tPROVISIONING_PROFILE = "{profile_uuid}";',
    )

    # 5. DEVELOPMENT_TEAM everywhere
    c = re.sub(r'DEVELOPMENT_TEAM = [^;]*;', f'DEVELOPMENT_TEAM = {team_id};', c)

    pbx.write_text(c)
    print(f"✓ {pbx}: patched (bundle={bundle_id}, team={team_id}, profile={profile_uuid[:8]}...)")


if __name__ == "__main__":
    main()
