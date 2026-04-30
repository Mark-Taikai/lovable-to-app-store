---
name: update
description: >
  Push updates to a published app after making changes in Lovable. With the
  v2.0+ ship setup (bundled dist + Capacitor Updater + Supabase Storage OTA),
  this skill builds a new web bundle, uploads it to your OTA bucket, and
  flips the active row in the ota_releases table — installed apps pick it up
  on their next launch (or next resume from background). Triggered by:
  "update [app name]", "push update for [app]", "deploy latest Lovable
  changes", "push OTA", "sync latest changes to the app", "publish new
  version", "the app needs an update".
tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Push an Update

After the user changes something in Lovable, this skill makes sure those
changes reach installed apps.

## How updates work in v2.0+ (bundled + Capacitor Updater)

The `ship` skill bundles `dist/` into the .ipa and uses
`@capgo/capacitor-updater` to download new bundles from the user's own
Supabase Storage bucket. Updates have three buckets:

1. **Web-only changes (UI, copy, logic, styling) →** rebuild dist,
   upload as a new OTA bundle, flip the active row. Installed apps pick
   it up on next launch. Most updates fall here.
2. **Edge function changes (`supabase/functions/*`) →** Lovable does NOT
   auto-deploy edge functions. Tell the user to ask Lovable to deploy
   and verify with `curl`.
3. **Native code changes (new plugins, native config, app icon) →**
   redirect to `add-native` or re-run `ship`. Apple does not allow OTA
   delivery of native code; users must install the new TestFlight build.

> 🆙 **Migrating from v1.x?** If the app was first shipped with v1.x
> (`server.url = LOVABLE_URL`), follow `../ship/references/12-migration-guide.md`
> first. The v1.x update model (Lovable redeploys → app sees new code on
> next launch) doesn't apply here. Until the user updates to a v2.0
> binary via TestFlight, OTA pushes won't reach them.

---

## Workflow

### Step 1 — Identify what changed

Ask the user what they changed in Lovable. Map to one of the three
buckets above:

| User said | Bucket | Action |
|---|---|---|
| "Updated some screens / fixed a bug / changed copy" | Web-only | Step 2 |
| "Added a new edge function / changed `supabase/functions/...`" | Edge function | Step 3 |
| "Added camera / Face ID / push / new native plugin" | Native | Redirect to `add-native` |
| "Changed app icon / splash screen / bundle ID" | Native config | Re-run `ship` |

### Step 2 — Web-only OTA push

Load the app's memory file (`~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json`)
to get `github_repo`, `lovable_url`, `supabase.project_ref`, and `ota`
config (bucket name, edge-function URL, etc.).

#### 2a. Pull the latest code

```bash
if [ -d "/tmp/lovable-to-app-store/{repo-name}" ]; then
  cd /tmp/lovable-to-app-store/{repo-name} && git pull origin main
else
  git clone {github_repo} /tmp/lovable-to-app-store/{repo-name} --depth=1
fi
```

#### 2b. Build the new bundle

```bash
NODE_OPTIONS=--max-old-space-size=2048 \
  node_modules/.bin/vite build --config vite.config.prod.ts
```

Use `vite.config.prod.ts` (not the dev config) — it omits `lovable-tagger`
which can hang on iCloud-synced projects.

#### 2c. Zip + sha256

```bash
VERSION=$(date +%Y.%m.%d-%H%M%S)
cd dist && zip -r "../bundle-${VERSION}.zip" . && cd ..
SHA=$(shasum -a 256 "bundle-${VERSION}.zip" | awk '{print $1}')
echo "Version: $VERSION  sha256: $SHA"
```

The version string can be any deterministic identifier — date+time
guarantees monotonic ordering.

#### 2d. Upload to Supabase Storage

Use the Supabase CLI or the dashboard:

```bash
# Via Supabase CLI (recommended):
supabase storage cp \
  "bundle-${VERSION}.zip" \
  "ota-bundles/ios/${VERSION}/bundle.zip"

# OR upload via dashboard: Storage → ota-bundles → upload to ios/{VERSION}/
```

Same for Android if the app supports it
(`ota-bundles/android/${VERSION}/bundle.zip`).

#### 2e. Flip the active row in the database

```bash
SUPABASE_REF="{from memory: supabase.project_ref}"
DB_PASSWORD="{from memory or env}"

psql "postgresql://postgres:${DB_PASSWORD}@db.${SUPABASE_REF}.supabase.co:5432/postgres" <<SQL
update ota_releases set active = false where platform = 'ios' and active = true;
insert into ota_releases (platform, version, storage_path, sha256, active)
values ('ios', '${VERSION}', 'ios/${VERSION}/bundle.zip', '${SHA}', true);
SQL
```

For Android, do the same with `platform = 'android'`.

#### 2f. Verify the manifest endpoint serves the new version

```bash
curl -s -X POST \
  "https://${SUPABASE_REF}.supabase.co/functions/v1/ota-manifest" \
  -H 'Content-Type: application/json' \
  -d '{"platform": "ios", "currentVersion": "builtin"}'
```

Expected output:
```json
{
  "update": true,
  "url": "https://...signed-url...",
  "version": "2026.04.29-093412",
  "sha256": "..."
}
```

Confirm to the user:

```
✅ OTA bundle ${VERSION} pushed for {AppName}

Platform:  iOS (also Android: Y/N)
Bundle:    bundle-${VERSION}.zip  (XX KB)
SHA256:    ${SHA:0:16}…
Active:    yes

Installed apps will download + apply on next launch.
For an immediate refresh on a test device:
  1. Force-quit the app (swipe up in app switcher)
  2. Reopen — it pulls the manifest, downloads the bundle, restarts
  3. Reopen again — new bundle is now active

If a tester is on the v1.x binary they won't see this update — they
need to update to a v2.0 binary via TestFlight first.
```

### Step 3 — Edge function changes

Lovable does **not** auto-deploy Supabase edge functions. If the user
changed anything under `supabase/functions/`, they have to ask Lovable
explicitly:

> *"Please deploy the edge functions"*

Verify deployment by curling each changed function:

```bash
SUPABASE_REF="{from memory}"
FUNCTION_NAME="google-native-signin"  # or whatever changed

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://${SUPABASE_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"
# Expect 400 (bad request — empty body), NOT 404 (function not deployed)
```

If 404 → ask Lovable to deploy again. If 400 → function is live.

Common cases this matters for:
- `google-native-signin` (see `../ship/references/07-google-native-signin.md`)
- `apple-native-signin` (see `../ship/references/08-apple-native-signin.md`)
- `ota-manifest` (your own deploy via Lovable — needed for OTA to work at all)

Update memory with the verification timestamp.

### Step 4 — Native changes redirect

If the user said anything that implies native code changed:

- "Added the camera", "added Face ID", "added push", "installed a new
  Capacitor plugin" → redirect to `add-native` skill
- "Changed the app icon", "changed the splash", "changed the bundle ID",
  "changed the app name" → redirect to `ship` skill (these need a new
  build with the same workflow)

Tell the user:

> *"That kind of change can't be delivered as an OTA — installed apps run
> cached native code. I'll switch to the `add-native` skill (or re-run
> `ship`) to produce a new TestFlight build with your changes."*

---

## Rollback

If a tester reports the new bundle is broken, you have two options:

### A) Auto-rollback (already happens)

If the new bundle has a JS error that prevents React from mounting, the
SDK init snippet's `notifyAppReady()` call never fires. Capacitor
Updater notices the 10-second `appReadyTimeout` expire and automatically
rolls back to the previous healthy bundle on next launch. No manual
intervention needed for crash-on-mount bugs.

### B) Manual rollback (for "it loaded but does the wrong thing" bugs)

Flip the active row back to the previous version:

```sql
update ota_releases set active = false where platform = 'ios' and active = true;
update ota_releases set active = true where platform = 'ios' and version = '{previous-version}';
```

Then anyone who's already running the bad bundle: tell them to force-quit
+ reopen. The manifest now points at the older version, Capacitor Updater
downloads it, applies, and the next launch is on the rollback bundle.

---

## If the build fails (when re-running ship for native changes)

Read the error and attempt to fix it. Common issues:
- TypeScript errors after Lovable changes: fix types and retry
- Missing dependencies: run `npm install` and retry
- Build script changed: check `package.json` scripts

If still failing after 2 attempts, report the error to the user and
suggest they check the Lovable build logs first.

## If the build succeeds but the resulting app shows a black screen

Run the **pre-archive verification checklist** in
`../ship/references/10-build-gotchas-addendum.md`. The most common silent
black-screen cause is `UIMainStoryboardFile` being missing from
`ios/App/App/Info.plist` — without it, iOS doesn't load
`Main.storyboard`, so `CAPBridgeViewController` never instantiates and
the app shows a bare black UIWindow + status bar. Verify with:

```bash
/usr/libexec/PlistBuddy -c 'Print :UIMainStoryboardFile' \
                        ios/App/App/Info.plist
# Must print "Main".
```

Other silent causes covered in the gotchas addendum:
- `iosScheme: 'https'` in capacitor.config (silently rejected → black)
- Capacitor CLI / core / ios major version mismatch
- `cap sync` wiped the Podfile post_install hook → ITMS-91061 on next upload
