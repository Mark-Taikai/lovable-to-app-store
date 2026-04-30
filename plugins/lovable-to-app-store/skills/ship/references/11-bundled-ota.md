# Bundled-Dist + Capacitor Updater OTA — the App-Store-Compliant Path

This is the architecture v2.0.0 ships by default. It supersedes the
v1.x web-shell approach (`server.url = LOVABLE_URL`). If you're upgrading
an existing app from v1.x, see `12-migration-guide.md` first.

## Why this architecture

Apple's Guideline 4.2 (Minimum Functionality) can reject apps that are
"essentially just a website wrapper." If the WebView's root URL is your
live web app, a reviewer who opens the app sees a website before they
notice the native plugins underneath. Some reviewers approve, some
reject — it's reviewer-roulette.

Loading bundled `dist/` assets makes the app a real native app from the
moment it launches. OTA updates still work: `@capgo/capacitor-updater`
downloads new bundles from your own infrastructure on next launch. Apple
permits OTA updates of web assets specifically (Guideline 3.3.1
"interpreted code") — what's prohibited is downloading new native code.

A bundled-dist app also can't be bricked by a bad live-site deploy. If
the live web app breaks today, every installed app keeps running last
known good bundle.

## Architecture overview

```
┌──────────────┐     1. cold launch                   ┌──────────────┐
│  Native iOS  │────────────────────────────────────▶│  Bundled     │
│   binary     │     loads capacitor://localhost      │  dist/       │
│  (TestFlight │     from public/index.html           │  in .ipa     │
│   build)     │                                      └──────┬───────┘
└──────┬───────┘                                              │
       │  2. main.tsx mounts React,                           │
       │     calls CapacitorUpdater.notifyAppReady()          │
       │     (marks current bundle healthy → no rollback)     │
       │                                                      │
       │  3. checkForOtaUpdate() POSTs                        │
       │       { platform, currentVersion, appVersion }       │
       │     to your /functions/v1/ota-manifest               │
       ▼                                                      │
┌──────────────┐                                       ┌──────▼───────┐
│  Supabase    │     4. queries ota_releases table     │  Postgres    │
│  edge fn     │────────────────────────────────────▶│  ota_releases│
│ ota-manifest │     latest active for platform        │              │
└──────┬───────┘                                       └──────────────┘
       │  5. createSignedUrl on the bundle .zip
       │     (1-hour TTL — app downloads immediately)
       ▼
┌──────────────┐
│  Supabase    │     6. CapacitorUpdater.download()
│  Storage     │────▶  pulls .zip, verifies sha256,
│ ota-bundles  │       stages bundle for next launch
│ (private)    │
└──────────────┘

  7. NEXT cold start: app loads the new bundle automatically.
  8. If new bundle crashes before notifyAppReady() (10s timeout),
     CapacitorUpdater auto-rolls back to the previous healthy bundle.
```

## What ships in the .ipa vs. what ships OTA

| Layer                    | In .ipa? | OTA? | Why                                      |
|--------------------------|---------|------|------------------------------------------|
| Native Swift / Capacitor | ✅      | ❌   | Apple prohibits OTA native code          |
| Native plugins (Cocoapods)| ✅     | ❌   | Same — they're native binaries           |
| `public/index.html`       | ✅ (fallback) | ✅ | Web entry point — fallback in .ipa, OTA replaces |
| `public/assets/*.{js,css}`| ✅ (fallback) | ✅ | Same                                     |
| Web images / fonts        | ✅ (fallback) | ✅ | Same                                     |
| Native icons / splash     | ✅      | ❌   | They're in Assets.xcassets               |
| Capacitor config          | ✅      | ❌   | Plugin registration — native             |

## Setup steps (run during `ship`)

### 1. Install the plugin

```bash
npm install @capgo/capacitor-updater
npx cap sync ios
```

The plugin is from Capgo but **we do not use Capgo's hosted CDN**. We
just need the client-side download/swap/rollback machinery. Bundles ship
from your own Supabase Storage.

### 2. capacitor.config.ts

Use `templates/capacitor.config.ts` — the v2.0.0 frozen template
already includes the `CapacitorUpdater` plugin block with the right
settings (`autoUpdate: false`, `appReadyTimeout: 10000`,
`directUpdate: false`).

### 3. SDK init snippet

Use `templates/sdk-init-snippet.ts` — it calls
`CapacitorUpdater.notifyAppReady()` on mount and registers the
foreground/background listener that re-checks for updates on resume.

### 4. Client-side updater

Drop `templates/ota-updater-client.ts` at `src/lib/ota-updater.ts`,
substituting `{{SUPABASE_URL}}` and `{{APP_VERSION}}`. Exports a
single `checkForOtaUpdate()` function that the SDK init snippet calls
at boot and on resume.

### 5. Edge function

Drop `templates/ota-manifest-edge-function.ts` at
`supabase/functions/ota-manifest/index.ts`. Then ask Lovable
**"please deploy the ota-manifest edge function"** — Lovable does NOT
auto-deploy edge functions on push. Verify with:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://{your-supabase-ref}.supabase.co/functions/v1/ota-manifest"
# Expect 400 (empty body), NOT 404 (function not deployed)
```

### 6. Database table

Run in Supabase SQL editor:

```sql
create table public.ota_releases (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null check (platform in ('ios', 'android')),
  version         text not null,
  storage_path    text not null,        -- e.g. ios/2026.04.29-1/bundle.zip
  sha256          text not null,
  min_native_ver  text,                  -- optional minimum CFBundleShortVersionString
  active          boolean not null default false,
  released_at     timestamptz not null default now()
);
create unique index on public.ota_releases (platform, version);
```

### 7. Storage bucket

In Supabase Dashboard → Storage:

- Create a bucket named `ota-bundles`
- **Public: NO** (signed URLs only)
- Layout: `ios/{version}/bundle.zip`, `android/{version}/bundle.zip`
- Upload via Dashboard, the Storage API, or your CI

## Pushing an OTA update

```bash
# 1. Build the new web bundle locally
npm run build              # produces ./dist/

# 2. Zip it
cd dist && zip -r ../bundle.zip . && cd ..

# 3. Compute the sha256
shasum -a 256 bundle.zip   # → save the hex digest

# 4. Upload to Supabase Storage
#    via dashboard, or:
supabase storage cp bundle.zip ota-bundles/ios/{version}/bundle.zip

# 5. Insert into ota_releases (and flip the previous active row to false)
psql ... <<'SQL'
update ota_releases set active = false where platform = 'ios' and active = true;
insert into ota_releases (platform, version, storage_path, sha256, active)
values ('ios', '2026.04.29-1', 'ios/2026.04.29-1/bundle.zip', '{sha256-hex}', true);
SQL
```

Next launch on every installed app, it pulls the new bundle, validates
the sha256, stages it, and applies on the launch after that.

## Rollback safety

`appReadyTimeout: 10000` in capacitor.config.ts gives a new bundle 10
seconds after launch to call `CapacitorUpdater.notifyAppReady()` (which
the SDK init snippet does on mount). If that call doesn't happen — for
example, the new bundle has a JS error that prevents React from mounting —
Capacitor Updater automatically rolls back to the previous healthy
bundle. Self-healing without user intervention.

## What changes when the user runs `update`

The `update` skill in v2.x focuses on **pushing OTA bundles via this
infrastructure**, not on re-running `ship` for every change. Web-only
changes flow as: build → upload → update DB → done. See `update`
SKILL.md for the full workflow.

## Comparison to the v1.x server.url approach

| | v1.x web shell | v2.x bundled + OTA |
|---|---|---|
| Apple 4.2 risk | Yes (reviewer-roulette) | No |
| Bad-deploy bricks installed apps | Yes | No (cached bundle keeps working) |
| OTA latency | Instant on next launch | Instant on next launch (after sha256 download) |
| Offline launch | PWA service worker only | Always (bundled assets) |
| Setup complexity | Low | +30 min for Storage + edge function |
| Rollback | Manual binary release | Automatic via 10s appReadyTimeout |
| Per-tester rollout | None | Possible (filter by tester ID in edge function) |

For ~95% of Lovable apps the v2.x architecture is the right choice. The
30 minutes of OTA setup buys you immunity from Apple 4.2 rejection AND
operational safety against bad deploys.
