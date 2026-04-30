# Migration Guide — v1.x → v2.0

If you shipped your app with this plugin under v1.x (`server.url` pointing
at the Lovable URL), v2.0 is a breaking change for your build pipeline.
Your **already-installed** apps keep working — they're still pointed at
the live URL via the binary they're running. The migration matters for
the NEXT build you ship.

## What broke between v1.x and v2.0

| Aspect | v1.x | v2.0 |
|---|---|---|
| Default WebView source | `server.url = LOVABLE_URL` | bundled `dist/` |
| OTA mechanism | Lovable redeploys, app loads on next launch | `@capgo/capacitor-updater` + Supabase Storage |
| Apple 4.2 risk | Yes | No |
| `update` skill | Verifies Lovable redeployed, done | Builds + uploads OTA bundle |
| `add-native` skill | Always re-runs `ship` for native changes | Same |

## Should I migrate?

**Yes if any of these:**

- App is still in TestFlight and you haven't shipped to App Store yet —
  the safest time to fix the architecture before review
- Apple has flagged the app under Guideline 4.2
- You've had a bad live-site deploy that broke installed apps
- You need offline-first behavior
- You want per-tester rollouts (canary, percentage rollout)

**No if all of these:**

- App is live in App Store and was approved at least a month ago
- Lovable hosting is reliable for your use case
- Switching costs > the operational risk

This is a real call. The Finally app went through it because Apple was
about to look at it under 4.2 review and the v1.x pattern was a
known-rejection risk. If your situation is different, v1.x can stay.

## Migration steps

These are listed in order. Do them in order — the build pipeline change
in Step 6 only works after Steps 1–5 are in place.

### 1. Install the OTA plugin

```bash
npm install @capgo/capacitor-updater@^8
npx cap sync ios
```

Then re-apply the Podfile post_install hook (cap sync wipes it — see
`10-build-gotchas-addendum.md`).

### 2. Replace `capacitor.config.ts`

Copy `templates/capacitor.config.ts` (v2.0 version), substituting:

- `{{BUNDLE_ID}}`        — your bundle ID (unchanged from v1.x)
- `{{APP_DISPLAY_NAME}}` — your app display name
- `{{LOVABLE_URL}}`      — your Lovable URL (now ONLY used in dev hot-reload mode)

**Critical change:** the new config defaults to bundled mode. If you
need to run a hot-reload dev build against the live URL, set
`CAP_DEV_RELOAD=1` before `npx cap sync`. Production builds must NOT
set that env var. The frozen template enforces this with an `isDevReload`
ternary so you can't accidentally ship `server.url` in a production build.

### 3. Update `src/main.tsx`

Replace your existing SDK init block with `templates/sdk-init-snippet.ts`
(v2.0 version). Key changes vs. v1.x:

- All native-plugin imports are now dynamic (`await import(...)`) so a
  broken plugin can't break React's initial mount
- Calls `CapacitorUpdater.notifyAppReady()` to mark the running bundle
  healthy
- Registers `appStateChange` listener to re-check OTA on resume
- Splash hide reduced from 300ms to 100ms (since we're loading bundled
  assets, not waiting for a remote URL)

### 4. Add the boot-time error overlay to `index.html`

Copy from `templates/index-html-boot-overlay.html`. This isn't strictly
required but it's the difference between "user reports black screen,
session takes 4 hours to debug" and "user reports a Retry button with the
exact JS error message visible."

### 5. Set up the OTA backend

Follow `11-bundled-ota.md` Steps 5, 6, 7:

- Drop the `ota-manifest` edge function
- Ask Lovable to deploy it
- Create the `ota_releases` table
- Create the `ota-bundles` Storage bucket (private, signed URLs)

Skip this only if you're explicitly OK with users having to install a
new TestFlight build for every web change. (If you're still in active
development, that's actually fine — you can add OTA later.)

### 6. Update your build script

Follow `templates/build-local.sh`. The key changes vs. a v1.x build:

- Calls the pre-archive verification block (catches silent failures)
- Re-applies the Podfile post_install hook automatically after cap sync
- Calls `asc-submit.py` to handle App Store Connect API automation
  (poll processing → add to Beta Testers → submit for Beta Review)

### 7. Bump CFBundleVersion + ship

The new build uploads with bundled assets. Apple will process it normally.
Existing TestFlight installs will update to the new bundled-mode binary
on next refresh. Once they do, OTA bundles you push will reach them.

## Backwards-compatibility note for already-installed v1.x users

A v1.x build out in the wild keeps loading from `server.url = LOVABLE_URL`.
That doesn't change retroactively — those installs will keep behaving
the v1.x way until users update to your v2.0 binary via TestFlight or
the App Store. Plan for a transition period where you may have two
populations:

1. v1.x installs — see live site changes immediately
2. v2.0 installs — see OTA bundle changes after your next OTA push

If you maintain a Lovable web-only deploy alongside, that's fine — it
keeps serving the v1.x population while you migrate.

## What if the migration goes wrong

The migration involves a binary update (Step 7). If something breaks in
the new bundle, App Store users can downgrade by reinstalling the
previous version (TestFlight users can switch back via the TestFlight
app's Previous Builds tab). Web users are unaffected — Lovable's live
site is independent.

The OTA system itself has rollback built in: any new OTA bundle that
doesn't call `notifyAppReady()` within 10 seconds of launch (because
it crashed or has a JS error) auto-rolls back to the previous healthy
bundle. You don't need to manually intervene.

## When you're done

Update the app's memory file at
`~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json`:

```json
{
  ...,
  "ota": {
    "method": "capacitor-updater + supabase-storage",
    "manifest_url": "{supabase_url}/functions/v1/ota-manifest",
    "bucket": "ota-bundles",
    "table": "public.ota_releases",
    "migrated_from_v1x": "{date}"
  }
}
```
