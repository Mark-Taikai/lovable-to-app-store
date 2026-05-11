# FROZEN — Capacitor + native-plugin version pins (Nov 2026)

These are the versions verified to ship together to TestFlight cleanly. Pin these in the target app's `package.json` BEFORE the first build.

> **Why pin?** Capacitor 8.x defaults to Swift Package Manager (SPM). As of late 2026, several community plugins we depend on (`@capacitor-community/apple-sign-in`, `@codetrix-studio/capacitor-google-auth`) don't support SPM yet — their iOS code is only published as CocoaPods specs. Using Cap 8 with these plugins produces a broken build: `pod install` fails with "no podspec found" or the build produces an unsigned binary.
>
> Capacitor 7.6.x is the latest stable that still uses CocoaPods by default. All community plugins we use have iOS support pinned to versions compatible with Cap 7.6.x.

## Verified pins (paste into `package.json` dependencies)

```json
"dependencies": {
  "@capacitor/core": "^7.6.0",
  "@capacitor/ios": "^7.6.0",
  "@capacitor/android": "^7.6.0",
  "@capacitor/cli": "^7.6.0",
  "@capacitor/haptics": "^7.0.0",
  "@capacitor/splash-screen": "^7.0.0",
  "@capacitor/status-bar": "^7.0.0",
  "@capacitor/keyboard": "^7.0.0",

  "@capgo/capacitor-updater": "^7.5.0",
  "@revenuecat/purchases-capacitor": "^11.3.0",
  "@onesignal/onesignal-capacitor": "^5.0.0",

  "@codetrix-studio/capacitor-google-auth": "^3.3.6",
  "@capacitor-community/apple-sign-in": "^7.1.0"
}
```

## Before pinning, sanity-check with `npm view`

Run this for any plugin you're adding for the first time:

```bash
npm view {pkg-name} version          # what's the latest published?
npm view {pkg-name} versions --json  # all versions
npm view {pkg-name} peerDependencies # what Cap version does it need?
```

If the latest version's `peerDependencies` requires Capacitor 8.x AND we're on 7.6.x, look for the previous major. Example resolution:

```bash
npm view @capacitor-community/apple-sign-in versions --json
# Look for the highest version with peerDep "@capacitor/core": "^7.0.0"
```

Then pin that specific major (`^7.1.0` here).

## When Cap 8 becomes safe

The migration to Cap 8 is blocked on three plugins publishing SPM-compatible podspecs:
- `@capacitor-community/apple-sign-in` — track [this issue](https://github.com/capacitor-community/apple-sign-in/issues)
- `@codetrix-studio/capacitor-google-auth` — track [this issue](https://github.com/CodetrixStudio/CapacitorGoogleAuth/issues)
- `@capgo/capacitor-updater` — usually fast to update; check the release notes

When all three publish SPM-compatible versions, this pin doc gets a v8 update and we bump.

## What goes wrong if you ignore the pins

Three real failure modes from CI logs we've seen:
1. **`pod install` fails** with "Unable to find a specification for X" — Cap 8 expects an SPM Package.swift; the plugin only ships a Podfile spec.
2. **Build succeeds but the IPA crashes on launch** with EXC_BAD_ACCESS in the auth plugin — Cap 8's ABI is incompatible with the plugin's compiled binary.
3. **altool upload returns 409** — the binary references symbols that don't exist in the iOS 26 runtime because the plugin was compiled against an older SDK.

Pin first. Test second. Upgrade only when all peer plugins catch up.
