// Drop this at src/lib/ota-updater.ts
//
// Pairs with:
//   - Plugin:   @capgo/capacitor-updater  (in package.json)
//   - Config:   plugins.CapacitorUpdater block in capacitor.config.ts
//   - Init:     CapacitorUpdater.notifyAppReady() called in src/main.tsx
//   - Backend:  supabase/functions/ota-manifest (see ota-manifest-edge-function.ts template)
//
// How OTA works in this plugin:
//
//   1. Install:  Capacitor Updater ships installed inside the .ipa as the
//                fallback bundle. App launches that fallback first.
//   2. Boot:     main.tsx calls CapacitorUpdater.notifyAppReady() so the
//                running bundle is marked healthy (avoids auto-rollback).
//   3. Check:    on cold launch + on resume, we call checkForOtaUpdate()
//                below. It POSTs to your /functions/v1/ota-manifest with
//                the bundle ID, current version, and platform.
//   4. Manifest: the edge function looks at your `ota_releases` table and
//                returns either {update: false} or {update: true, url, version, sha256}.
//   5. Download: CapacitorUpdater.download() pulls the .zip from the signed
//                URL, verifies the sha256, and stages the bundle.
//   6. Apply:    CapacitorUpdater.set() activates the new bundle on next
//                cold start. (directUpdate: false in capacitor.config.ts =
//                no hot-swap; users see the new version after restart.)
//   7. Rollback: if the new bundle crashes before notifyAppReady() fires
//                (10-second appReadyTimeout), Capacitor Updater auto-rolls
//                back to the previous healthy bundle. Self-healing.
//
// Apple Guideline 4.2 compliance: the update PAYLOAD is web assets only
// (HTML / JS / CSS / images). Native code never changes via OTA — that
// still requires a TestFlight build. This is what Apple's policy permits.

import { Capacitor } from '@capacitor/core';

const OTA_MANIFEST_URL = '{{SUPABASE_URL}}/functions/v1/ota-manifest';

/**
 * Check the OTA manifest endpoint for a new bundle and, if available,
 * download + stage it. The new bundle becomes active on next cold start.
 *
 * Idempotent — safe to call from boot, on resume, and from a manual
 * "Check for updates" button.
 */
export async function checkForOtaUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  let CapacitorUpdater: any;
  try {
    ({ CapacitorUpdater } = await import('@capgo/capacitor-updater'));
  } catch {
    // Plugin not installed — OTA is opt-in, app keeps working.
    return;
  }

  // What version are we running right now?
  let currentVersion = 'builtin';
  try {
    const info = await CapacitorUpdater.current();
    currentVersion = info?.bundle?.version || 'builtin';
  } catch {
    /* ignore — first boot */
  }

  const platform = Capacitor.getPlatform();

  // Ask the manifest endpoint if a newer bundle exists.
  let manifest: {
    update: boolean;
    url?: string;
    version?: string;
    sha256?: string;
    minNativeVersion?: string;
  };
  try {
    const res = await fetch(OTA_MANIFEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,                  // 'ios' | 'android'
        currentVersion,            // string identifier of installed bundle
        appVersion: '{{APP_VERSION}}', // injected at build time
      }),
    });
    if (!res.ok) {
      console.warn('[OTA] manifest non-200:', res.status);
      return;
    }
    manifest = await res.json();
  } catch (err) {
    // Network failure: silently retry on next launch.
    return;
  }

  if (!manifest.update || !manifest.url || !manifest.version) return;

  // If the new bundle requires a newer native binary than we're running,
  // skip it — the user has to update from the App Store first.
  if (manifest.minNativeVersion) {
    // Compare against your CFBundleShortVersionString here. Skipped for brevity.
  }

  try {
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
      sessionKey: undefined,
      checksum: manifest.sha256,
    });

    // Stage it — applies on next cold start.
    await CapacitorUpdater.set({ id: bundle.id });
    console.log('[OTA] staged bundle', manifest.version, '— restart to apply');
  } catch (err) {
    console.error('[OTA] download/stage failed:', err);
  }
}
