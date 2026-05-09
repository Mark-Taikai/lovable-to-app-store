# Lovable to App Store

Ship any Lovable app to TestFlight + Google Play — by talking to Claude.

---

## What you do

Once installed, you say one of these to Claude in Cowork (or Claude Code):

| Phrase | What happens |
|---|---|
| `ship this app to TestFlight: <github-url>` | First-time submission. ~30 min from clean repo to TestFlight invite. |
| `push update for <app name>` | OTA update after a Lovable change. No App Store re-submission needed. |
| `add Face ID to <app name>` | Adds a native feature, rebuilds, submits a new TestFlight build. |

Claude reads the skill, asks ~6 plain-English questions, drives your browser through Apple Developer + Google Play + RevenueCat + OneSignal, sets up Capacitor with **bundled `dist/`** (Apple Guideline 4.2 compliant by default), runs the build via GitHub Actions CI, and submits to **Beta App Review** automatically via the App Store Connect API.

---

## What you need before the first ship

**Accounts** (Claude can't create these for you):

- ✅ **Apple Developer Program** — $99/year — [enroll here](https://developer.apple.com/programs/) (allow 24–48h for approval)
- ✅ **Google Play Console** — $25 one-time — [sign up](https://play.google.com/console/signup) (usually instant)
- ✅ A Lovable app with a public GitHub repo

**Free accounts you'll create during ship** (Claude walks you through them):

- RevenueCat (in-app purchases) — free up to $2.5k MTR
- OneSignal (push notifications) — free up to 10k subscribers
- Supabase (only if your app uses Google/Apple Sign-In) — free tier

**On your computer:**

- A working **Cowork desktop app** (this is the recommended path), OR Claude Code in a terminal
- The **Cowork Chrome extension** installed and authorized — this is what lets Claude drive Apple/Google's web consoles for you. If it's not installed, the `ship` skill will detect that and tell you what to do.
- macOS is NOT required — builds run on GitHub Actions. Linux / Windows users can ship to the App Store from Cowork.

---

## Install

### Cowork (one-click drag-drop)

1. Download the latest `.plugin` file:
   **[lovable-to-app-store.plugin](https://github.com/Mark-Taikai/lovable-to-app-store/releases/latest/download/lovable-to-app-store.plugin)**
2. Open Cowork → Settings → click the **`+`** next to "Personal plugins"
3. Drop the file in
4. Done. Skills become available in any Cowork conversation.

### Claude Code (CLI)

```
/plugin marketplace add Mark-Taikai/lovable-to-app-store
/plugin install lovable-to-app-store@lovable-to-app-store
```

To update later: `/plugin update lovable-to-app-store@lovable-to-app-store` (Claude Code) or re-download and re-drop the new `.plugin` (Cowork).

---

## First-run handshake (what Claude does for you)

When you say *"ship this app to TestFlight"* for the first time, Claude will:

1. **Check prerequisites.** Detects whether the Cowork Chrome extension is connected, whether the bash sandbox has Node + Python, whether your Apple Developer account is reachable. If anything is missing, it tells you exactly what to install/enable before proceeding — it does NOT silently fail.
2. **Auto-install non-account dependencies** (Pillow for icon resizing, the GitHub CLI for PAT-less pushes, etc.) into the sandbox where it has permission.
3. **Prompt for human-only steps** (paying Apple's $99, accepting Google's terms) with direct links and clear "I'll wait for you to confirm" pauses.
4. **Save everything** to `~/Documents/Claude/lovable-to-app-store/memory/` so subsequent ships under the same Apple account skip the registration steps entirely.

If something does go wrong during the run, Claude has a battle-tested troubleshooting catalog (`references/10-build-gotchas-addendum.md`) covering ITMS-91061, provisioning-profile invalidation, the silent-black-screen Info.plist issue, and ~15 other failure modes from real shipped apps.

---

## What the plugin actually does (under the hood)

For curious users — none of this is required reading:

- **Bundled `dist/` inside the IPA** instead of a remote `server.url`. This is what makes the app pass Apple Guideline 4.2 ("Minimum Functionality") review.
- **OTA updates via `@capgo/capacitor-updater`** pulling signed bundles from your own Supabase Storage bucket. Sha256-verified, 10-second auto-rollback if the new bundle fails to call `notifyAppReady()`.
- **Native Google + Apple Sign-In** via Supabase Edge Functions that exchange the native auth code for an idToken with the right `aud` claim. (Standard `signInWithOAuth()` doesn't work on Lovable-managed Supabase — the plugin handles the workaround.)
- **GitHub Actions CI** with `runs-on: macos-15` and Xcode 26 (required by Apple after April 28, 2026). Auto-creates a fresh distribution cert and provisioning profile per build via the App Store Connect API — no manual cert management.
- **Beta App Review submission** via ASC API after every successful upload, so you don't have to click through App Store Connect after each build.

Architecture deep-dives:
- `skills/ship/references/11-bundled-ota.md` — full v2.0 architecture
- `skills/ship/references/12-migration-guide.md` — for apps shipped on v1.x
- `skills/ship/references/10-build-gotchas-addendum.md` — silent-failure checklist

---

## Costs (after install, recurring)

| Service | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/year | Required for any iOS publishing |
| Google Play Console | $25 one-time | Required for any Android publishing |
| RevenueCat | Free up to $2.5k MTR | In-app purchases |
| OneSignal | Free up to 10k subscribers | Push notifications |
| Supabase | Free tier covers most apps | Only needed for native sign-in |
| GitHub Actions | Free for public repos | Build CI |

Your floor is **$99/year + $25 once** to publish on both stores forever.

---

## Privacy / data

The plugin stores everything locally at `~/Documents/Claude/lovable-to-app-store/memory/`:
- App IDs, RevenueCat keys, OneSignal IDs, Apple Team ID, OAuth client IDs, etc.
- **Never** stores: passwords, keystore passwords, the raw `.p8` private key contents (only paths).

Nothing leaves your machine except the obvious: API calls you'd make anyway (App Store Connect, Google Play, etc.) using your own credentials.

---

## License

MIT — see `LICENSE`. Use it, fork it, ship apps with it.

## Issues

https://github.com/Mark-Taikai/lovable-to-app-store/issues
