# 03 — Capacitor Setup (v2.0+ redirect)

> ⚠️ **STOP. This file used to contain the v1.x manual Capacitor setup that
> pointed `server.url` at the live Lovable URL. That pattern is no longer
> supported and apps shipped that way are at risk of Apple Guideline 4.2
> ("Minimum Functionality") rejection because the binary is effectively a
> remote-loaded webview wrapper.**
>
> **Do NOT follow any v1.x server-url instructions you find online or in
> archived versions of this doc.**

## Where the actual Capacitor setup lives

The v2.0+ workflow bundles `dist/` inside the IPA and uses
`@capgo/capacitor-updater` for OTA updates — not `server.url`. Setup happens
through frozen templates that the `ship` skill copies and substitutes
automatically. You do not run the steps manually.

If you need to understand or modify the setup:

- **`references/11-bundled-ota.md`** — the canonical v2.0+ architecture. Read
  this first. Explains:
  - `capacitor.config.ts` shape (no `server.url`)
  - `vite.config.prod.ts` (production build that emits a hashed bundle ready
    for native packaging)
  - How `@capgo/capacitor-updater` pulls signed bundles from your Supabase
    Storage bucket with sha256 verification + 10-second auto-rollback
  - The `ota-updater-client.ts` boot snippet that calls
    `Updater.notifyAppReady()` so the rollback safety arms correctly
  - Why `iosScheme: 'https'` is silently rejected and what to use instead
  - Why `UIMainStoryboardFile = Main` must be in `Info.plist`

- **`references/12-migration-guide.md`** — the v1.x → v2.0 migration path.
  Read this if the app you're updating was originally shipped with the v1.x
  server-url pattern. Apple has been flagging those under 4.2 review starting
  April 2026.

- **`references/templates/`** — the frozen files the `ship` skill copies.
  Don't regenerate from scratch; substitute placeholders only. The ones
  relevant to Capacitor setup:
  - `capacitor.config.ts` (3 substitutions)
  - `vite.config.prod.ts` (no substitutions)
  - `index-html-boot-overlay.html` (no substitutions)
  - `sdk-init-snippet.ts` (3 substitutions)
  - `info-plist-additions.xml` (1 substitution + optional Google Sign-In block)
  - `App.entitlements` (only if Apple Sign-In is used)

## If you arrived here looking for a manual fallback

There is no longer a separate "manual Capacitor setup" path. Either:

1. **Run the `ship` skill** and let it copy templates automatically (the
   recommended path for 100% of new apps), or
2. **Read `11-bundled-ota.md`** for the architecture, then look at the
   templates directly.

Pre-archive verification (the silent-failure checklist that catches the most
common build issues — black screens, wrong WebView config, GoogleSignIn pod
version, etc.) lives in `references/10-build-gotchas-addendum.md`.

## Why this file exists at all

To prevent Claude (or a curious user reading the references in numerical
order) from accidentally following the v1.x instructions and producing an
Apple-rejection-prone build. If you see this file, you're already doing the
right thing — proceed to ref 11.
