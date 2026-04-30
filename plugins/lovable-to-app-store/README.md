# Lovable to App Store

Turn any Lovable app into a fully published iOS + Android app — no app store knowledge required.

## What This Plugin Does

This plugin automates the entire journey from a Lovable web app to a native app in TestFlight and Google Play. It handles service registration, Capacitor configuration, code injection, builds, and submissions.

OTA updates are automatic — the app loads directly from your live Lovable URL, so every Lovable deploy reaches users on their next app launch. A service worker caches the app locally so it also works offline.

## Skills

### `ship` — Publish a new app
Triggered by: *"ship this app: [github URL]"*, *"get this on TestFlight"*, *"turn this Lovable app into a native app"*

Full end-to-end workflow:
1. Reads the repo and understands the app
2. Asks ~6 plain-English questions (app name, client, bundle ID, accounts, native sign-in providers)
3. Registers the app with Apple Developer, App Store Connect, Google Play Console, RevenueCat, OneSignal, and Capgo — using the browser
4. Wraps the app in Capacitor and injects SDK initialization code
5. Builds and submits to TestFlight + Play internal testing
6. Saves all settings to memory for future runs

### `update` — Push an OTA update
Triggered by: *"update [app name]"*, *"push OTA"*, *"deploy latest Lovable changes"*

Pulls the latest Lovable changes and pushes them to installed apps via Capgo — no App Store submission needed for JS / CSS / asset changes. Detects if any Supabase Edge Functions changed and reminds you to ask Lovable to redeploy them (Lovable does NOT auto-deploy edge functions on push).

### `add-native` — Add a native capability
Triggered by: *"add haptics to [app]"*, *"add camera"*, *"add Face ID"*, *"add [feature]"*

For adding native iOS/Android features as Capacitor adds support:
- Installs the right Capacitor plugin
- Adds permission strings to Info.plist and AndroidManifest.xml
- Handles Apple Developer Portal capability setup
- Injects typed wrapper code for use in Lovable
- Rebuilds and submits a new version (required for native changes)

## Memory System

The plugin remembers everything it registers — Apple Team IDs, RevenueCat keys, OneSignal App IDs, Capgo tokens, and more. On subsequent runs, it loads this data automatically.

Memory is stored at: `~/Documents/Claude/lovable-to-app-store/memory/`

**What is stored:** App IDs, API keys, bundle IDs, team IDs, account emails, OAuth client IDs.
**What is never stored:** Account passwords, keystore passwords, the App Store Connect `.p8` file content (only the path), or any value that grants standalone access to a service.

> ⚠️ **Keystore safety:** Once you publish an Android app to Google Play, you can ONLY release updates to it by signing them with the same `.keystore` file. **Losing the keystore = permanently losing the ability to update that app.** Back up your keystore file to a password manager or encrypted off-device storage immediately after creating it. The plugin stores keystores at `~/Documents/Claude/lovable-to-app-store/keystores/` so they survive between sessions, but you should still keep an off-device backup.

## Native Sign-In (Google / Apple)

If the app needs native Google or Apple Sign-In, the plugin handles the full flow — including the Supabase Edge Function that's required when Supabase is managed by Lovable. The native idToken's `aud` claim doesn't match what the Lovable-locked Supabase Google/Apple provider validates against, so a server-side code exchange is mandatory.

What gets created automatically when you answer "yes" to the upfront sign-in question:
- Three OAuth client IDs in Google Cloud Console (Web, iOS, Android) and/or an Apple Services ID + JWT key
- A `google-native-signin` and/or `apple-native-signin` edge function in the repo
- The right `iosClientId` / `serverClientId` block in `capacitor.config.ts`
- The reversed iOS client ID URL scheme in `Info.plist`
- An `App.entitlements` file with `com.apple.developer.applesignin`
- The native client wrapper at `src/lib/native/google-sign-in.ts` (and the Apple equivalent)
- A reminder to ask Lovable to deploy the edge functions (Lovable does NOT auto-deploy)

See `skills/ship/references/07-google-native-signin.md` and `08-apple-native-signin.md` for the architecture details.

## Services Used

| Service | Purpose | Cost |
|---------|---------|------|
| Apple Developer Program | App ID registration, TestFlight | $99/year |
| App Store Connect | App listing and submission | Included with Apple Developer |
| Google Play Console | Android listing and submission | $25 one-time |
| RevenueCat | In-app purchases and subscriptions | Free up to $2.5k monthly tracked revenue |
| OneSignal | Push notifications | Free up to 10,000 subscribers |
| Capgo | OTA update delivery | Free tier available; paid plans for higher volume |
| Supabase | Backend + Edge Functions (when used by the app) | Free tier available |

OTA updates also rely on your existing Lovable hosting (the live `server.url` the app loads from) — included with your Lovable plan.

## Requirements

- macOS with Xcode installed (for iOS builds), OR a CI runner with macOS access (the plugin includes a battle-tested GitHub Actions workflow that uses `runs-on: macos-15`)
- Node.js 18+
- Apple Developer Program membership
- Google Play Console account
- Accounts (or willingness to create) at RevenueCat, OneSignal, and Capgo
- A Supabase project ONLY if the app uses native Google or Apple Sign-In (the edge-function flow assumes Supabase auth)

## Installation

This plugin is distributed as a Claude / Cowork plugin. To install:

1. Clone or download this repository.
2. Open Claude Code or Cowork and add this repo as a plugin marketplace, or drag-and-drop the bundled `.plugin` zip into the plugin install UI.
3. Verify the skills are available — try the trigger *"ship this app: [github URL of any Lovable repo]"* and the `ship` skill should activate.

The exact install command depends on your Claude/Cowork version. Refer to the official Claude Code plugin documentation for the current syntax.

## First Run

On first use, Claude will:
1. Create the memory directory at `~/Documents/Claude/lovable-to-app-store/memory/`.
2. Ask for your agency name (the entity that owns the Apple Developer account) and your first org name and default bundle ID prefix (e.g., `com.yourcompany`).
3. Save these as agency- and org-wide defaults.

Every subsequent app uses these defaults unless overridden per client.

## Secret Hygiene (Read Before First Push)

This plugin works with several files that must NEVER be committed to a public repo. Before your first `git push`, append the contents of `skills/ship/references/templates/.gitignore.additions` to your repo's `.gitignore`. It covers `.p8`, `.keystore`, `.env`, build outputs, and other sensitive artifacts.

If you accidentally push a `.p8` or `.keystore` to a public repo, **rotate the credential immediately** in the issuing console — scrubbing git history is not enough. See `skills/ship/references/04-build-and-submit.md` for full incident-response guidance.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. Before submitting changes:
- Sanity-check that no real credentials, internal URLs, or personal information are in the diff.
- Run a full ship workflow on a throwaway test app to verify your change doesn't break end-to-end behavior.
