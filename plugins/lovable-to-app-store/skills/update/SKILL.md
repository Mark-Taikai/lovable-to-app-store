---
name: update
description: >
  Push updates to a published app after making changes in Lovable. With the
  default ship setup, OTA updates happen AUTOMATICALLY when Lovable redeploys —
  this skill verifies the deploy went through, handles edge function deployment
  (which Lovable doesn't auto-deploy), and bumps native builds when web-only
  updates aren't enough. Triggered by: "update [app name]", "push update for
  [app]", "deploy latest Lovable changes", "push OTA", "sync latest changes to
  the app", "publish new version", "the app needs an update".
tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Push an Update

After the user changes something in Lovable, this skill makes sure those changes reach installed apps.

## How updates actually work in this plugin

The `ship` skill points the native app at the live Lovable URL via `server.url` in `capacitor.config.ts`. This means:

- **OTA is automatic.** When the user redeploys in Lovable, the WebView loads the new version on next app launch. No CLI commands required.
- **There is no "push update" step for web-only changes.** The update is already live the moment Lovable's deploy finishes.
- **Native code changes still require a new App Store / Play Store build.** Adding a Capacitor plugin, changing the bundle ID, swapping the app icon, etc. — those need `add-native` or a re-run of `ship`.

So this skill has three jobs depending on what the user actually changed:

1. **Web-only changes (UI, copy, logic, styling) →** verify Lovable redeployed and the live URL serves the new version. Done.
2. **Edge function changes (`supabase/functions/*`) →** Lovable does NOT auto-deploy edge functions. Tell the user to ask Lovable to deploy and verify with `curl`.
3. **Native code changes (new plugins, native config) →** redirect to `add-native` skill or re-run `ship` to produce a new TestFlight/Play build.

---

## Workflow

### Step 1 — Identify what changed

Ask the user what they changed in Lovable. Map to one of three buckets:

| User said | Bucket | Action |
|---|---|---|
| "Updated some screens / fixed a bug / changed copy" | Web-only | Step 2 |
| "Added a new edge function / changed `supabase/functions/...`" | Edge function | Step 3 |
| "Added camera / Face ID / push / new native plugin" | Native | Redirect to `add-native` |
| "Changed app icon / splash screen / bundle ID" | Native config | Re-run `ship` |

### Step 2 — Verify the Lovable redeploy reached the WebView

Load app memory:
```bash
ls ~/Documents/Claude/lovable-to-app-store/memory/apps/
```
Find the matching app file by `app_name` or `bundle_id`. Read the `lovable_url` field.

Verify the live URL is serving the latest code:
```bash
LOVABLE_URL="{lovable_url from memory}"
curl -sI "$LOVABLE_URL" | head -5
# Look at the Last-Modified header — should be recent (since the user's Lovable redeploy)

# Also fetch the index and sanity-check
curl -s "$LOVABLE_URL" | head -20
```

Confirm to the user:
```
✅ Lovable URL is live and serving the latest deploy.

The app's WebView pulls from this URL on every launch, so installed apps
will pick up the change automatically the next time someone opens them.

To force an immediate refresh on a test device:
  1. Force-quit the app (swipe up in app switcher)
  2. Reopen — it will pull the new bundle
```

If the user added a hard offline mode (the `vite-plugin-pwa` service worker caches aggressively): a PWA service worker may serve a stale shell on first launch, then update in the background. The second launch shows the new version. This is normal PWA behavior — mention it if relevant.

### Step 3 — Handle edge function changes

Lovable does **not** auto-deploy Supabase edge functions when you push web code. If the user changed anything under `supabase/functions/`, they have to ask Lovable explicitly:

> *"Please deploy the edge functions"*

Verify deployment by curling each changed function:

```bash
SUPABASE_REF="{supabase_project_id from memory or from .env}"
FUNCTION_NAME="google-native-signin"  # or whatever changed

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://${SUPABASE_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"
# Expect 400 (bad request — empty body), NOT 404 (function not deployed)
```

If 404 → ask Lovable to deploy again. If 400 → function is live.

Common cases this matters for:
- `google-native-signin` (see `ship` skill `references/07-google-native-signin.md`)
- `apple-native-signin` (see `ship` skill `references/08-apple-native-signin.md`)

Update memory with the verification timestamp:
```json
"google_auth": { ..., "edge_function_last_verified": "YYYY-MM-DD" }
```

### Step 4 — Native changes redirect

If the user said anything that implies native code changed:
- "Added the camera", "added Face ID", "added push", "installed a new Capacitor plugin" → redirect to `add-native` skill
- "Changed the app icon", "changed the splash", "changed the bundle ID", "changed the app name" → redirect to `ship` skill (these need a new build with the same workflow)

Tell the user:
> *"That kind of change can't be delivered as an OTA — installed apps run cached native code. I'll switch to the `add-native` skill (or re-run `ship`) to produce a new TestFlight/Play build with your changes."*

---

## Confirm and summarize

After successful verification:
```
✅ Update reached the app — {AppName}

What changed:    [brief description from user]
Update method:   Automatic OTA via Lovable URL (no CLI deploy needed)
Live URL:        {lovable_url}
Edge functions:  [if applicable] verified deployed (HTTP 400)

Installed apps will load the new version on next launch.
For an immediate refresh, force-quit and reopen the app.
```

Update `build.last_build_date` and (if applicable) `google_auth.edge_function_last_verified` in the memory file.

---

## When OTA via server.url isn't enough

The `server.url` approach is the simplest and works for ~95% of update scenarios. You'll hit its limits when:

- **You want offline updates** — service worker caches the last successful load, but a totally offline user with a stale cache doesn't get the new version until they reconnect.
- **You need version pinning per build** — every user always gets latest. There's no "rollout 10% to canary" capability.
- **Lovable's hosting is down** — the WebView fails to load. The PWA cache covers this for users who've launched before, but new installs fail.

For those cases, layering Capgo on top is an option — it bundles your `dist/` into the native app and serves locally with controlled rollout. **This requires extra setup that the default `ship` flow does not perform.** If the user wants Capgo:
1. Sign up at [capgo.app](https://capgo.app), create a project for the bundle ID
2. `npm install -g @capgo/cli` (or use `npx @capgo/cli` to avoid global install)
3. Run `npx @capgo/cli init --apikey <your-capgo-key>` in the repo
4. Save the API key, app ID, and channel into the app's memory file under a `capgo` block:
   ```json
   "capgo": {
     "api_key": "...",
     "app_id": "{bundle_id}",
     "channel": "production"
   }
   ```
5. Per-update push: `npx @capgo/cli bundle upload --apikey {api_key} --bundle-id {bundle_id} --channel {channel}`

This is an advanced path — only walk the user through it if they specifically ask for bundled OTA, channel-based rollout, or offline-resilient updates.

---

## If the build fails (when re-running ship for native changes)

Read the error and attempt to fix it. Common issues:
- TypeScript errors after Lovable changes: fix types and retry
- Missing dependencies: run `npm install` and retry
- Build script changed: check `package.json` scripts

If still failing after 2 attempts, report the error to the user and suggest they check the Lovable build logs first.

## If the build succeeds but the resulting app shows a black screen

Run the **pre-archive verification checklist** in
`../ship/references/10-build-gotchas-addendum.md`. The most common silent
black-screen cause is `UIMainStoryboardFile` being missing from
`ios/App/App/Info.plist` — without it, iOS doesn't load `Main.storyboard`,
so `CAPBridgeViewController` never instantiates and the app shows a bare
black UIWindow + status bar. Verify with:

```bash
/usr/libexec/PlistBuddy -c 'Print :UIMainStoryboardFile' \
                        ios/App/App/Info.plist
# Must print "Main".
```

Other silent causes covered in the gotchas addendum:
- `iosScheme: 'https'` in capacitor.config (silently rejected → black)
- Capacitor CLI / core / ios major version mismatch
- `cap sync` wiped the Podfile post_install hook → ITMS-91061 on next upload
