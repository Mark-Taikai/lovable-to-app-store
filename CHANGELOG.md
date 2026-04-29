# Changelog

All notable changes to the `lovable-to-app-store` plugin are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] — 2026-04-27

### Fixed
- **`update` skill rewritten.** The previous version assumed Capgo was set up during `ship`, but the default ship flow uses `server.url` pointing to Lovable for automatic OTA — Capgo was never configured, so any Capgo CLI command would fail. The skill now correctly explains the three update paths: (1) web-only changes flow automatically via the Lovable URL, (2) edge function changes need a manual deploy request to Lovable + curl verification, (3) native code changes redirect to `add-native` or a re-run of `ship`. Capgo is documented as an optional advanced path with its own setup, not the default.
- **`add-native` skill** no longer requires `capgo.api_key` from memory (it produces a new build, not an OTA — Capgo isn't relevant).
- **Haptics example** in `add-native` rewritten to use a clean lookup map instead of bracket-indexing into the `ImpactStyle` enum, which produced fragile and hard-to-read code.
- **Substitution artifacts:** removed leftover `{org-slug}` placeholders from `ship/SKILL.md`, `01-questions.md`, `00-preflight.md`, and `09-returning-client-fast-path.md`.
- **`01-questions.md`** header corrected: said "The Eight Questions" but lists nine (the upfront sign-in question added in v1.1.0 brought the count to 9).
- **Pre-flight summary** now substitutes the actual agency name from memory instead of literally announcing "Agency: your agency".

### Changed
- Plugin description and metadata reflect the three real OTA paths (`server.url`, edge function deploy, optional Capgo).

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
