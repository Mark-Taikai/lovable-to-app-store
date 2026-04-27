# Changelog

All notable changes to the `lovable-to-app-store` plugin are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-04-27

### Added
- Native Google Sign-In support via Supabase Edge Function code-exchange flow (`07-google-native-signin.md`).
- Native Apple Sign-In support via Supabase Edge Function code-exchange flow (`08-apple-native-signin.md`).
- Build-gotchas addendum capturing April 2026 issues (`10-build-gotchas-addendum.md`): ITMS-91061 GoogleSignIn privacy manifest, provisioning-profile invalidation after capability changes, /tmp clearing between sessions, BglocationCapacitor pod removal, CocoaPods Unicode encoding workaround.
- New `App.entitlements` template for Apple Sign-In.
- Three OAuth client types (Web + iOS + Android) in Google service registration; previously only documented two.
- Apple Sign-In service-registration section (Services ID + JWT key + Sign in with Apple capability).
- Upfront question 9: native sign-in providers (Google / Apple / Both / Neither). Branches downstream service registration accordingly.
- Lovable Cloud Secret tracking for `VITE_GOOGLE_WEB_CLIENT_ID` (web fallback).
- `update` skill now detects `supabase/functions/` changes and warns user to ask Lovable to redeploy edge functions.
- README installation instructions, `update` skill section, secret-hygiene callout, keystore-loss warning.
- `templates/.gitignore.additions` — ready-to-paste `.gitignore` block covering `.p8`, `.keystore`, `.env`, build outputs.

### Changed
- `capacitor.config.ts` template now includes a commented `GoogleAuth` plugin block with the right `iosClientId` / `serverClientId` / `forceCodeForRefreshToken: true` rules.
- `info-plist-additions.xml` now includes `NSLocation*UsageDescription` keys (preempts ITMS-90683) with a callout to override placeholder strings if the app actually uses location.
- Android keystore creation moved from `/tmp/` to `~/Documents/Claude/lovable-to-app-store/keystores/` so it survives between sessions.
- Memory schema (`05-memory-schema.md`) now documents optional `google_auth` and `apple_auth` blocks per app, including JWT expiry tracking for Apple.
- Returning-client fast path renamed for clarity (now `09-returning-client-fast-path.md`).
- Agency and org template files renamed to generic placeholders (`agency-template.json`, `org-template.json`).
- CERT_PASS guidance strengthened to forbid reusing account passwords.
- Default keystore path now lives under the persistent memory tree, not `/tmp`.

### Security
- Added explicit warnings against committing `.p8`, `.keystore`, and `.env` files. Repository now ships a `.gitignore.additions` template covering all the common signing artifacts.
- Documented credential-rotation playbook for accidental commits.

## [1.0.0] — initial release

### Added
- `ship` skill: end-to-end Lovable → Capacitor → TestFlight + Google Play submission.
- `add-native` skill: add Capacitor native plugins to a published app.
- `update` skill: push OTA updates via Capgo without an App Store submission.
- Frozen templates for `capacitor.config.ts`, the GitHub Actions iOS build workflow, the SDK init snippet, and `Info.plist` additions.
- Three-tier memory schema (agency / org / app).
