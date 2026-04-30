// SDK INIT SNIPPET — inject at the top of src/main.tsx, AFTER React's createRoot
// call (so React is fully initialized before any native SDK loads).
//
// Substitute these 3 values:
//   {{REVENUECAT_IOS_KEY}}     →  starts with appl_  (RevenueCat → Project Settings → API Keys → Public SDK Key)
//   {{REVENUECAT_ANDROID_KEY}} →  starts with goog_  (same page, Android tab)
//   {{ONESIGNAL_APP_ID}}       →  UUID from OneSignal → your app → Settings
//
// ⚠️ NEVER use test_ prefixed RevenueCat keys — they crash the app on startup
//    with no error message in TestFlight builds.

// Native SDK initialization — added by the lovable-to-app-store plugin.
// All imports use dynamic import() so a missing/broken plugin can never break
// React's initial mount — the boot-time error overlay in index.html will
// catch it and surface the error instead of leaving a black screen.

import { Capacitor } from '@capacitor/core';

// Signal to the boot-time error overlay (in index.html) that JS is running,
// then remove any overlay that fired while we were starting up.
(window as any).__finally_booted__ = true;
queueMicrotask(() => {
  document.querySelectorAll('[data-boot-error]').forEach((n) => n.remove());
});

if (Capacitor.isNativePlatform()) {
  (async () => {
    try {
      const platform = Capacitor.getPlatform();

      // Lazy-load native SDK plugins so a broken plugin can't break module init.
      const [
        { Purchases, LOG_LEVEL },
        OneSignalMod,
        { SplashScreen },
        { CapacitorUpdater },
        { App },
      ] = await Promise.all([
        import('@revenuecat/purchases-capacitor'),
        import('onesignal-cordova-plugin'),
        import('@capacitor/splash-screen'),
        import('@capgo/capacitor-updater'),
        import('@capacitor/app'),
      ]);
      const OneSignal = (OneSignalMod as any).default ?? OneSignalMod;

      // ─── RevenueCat — in-app purchases ────────────────────────────────────
      const rcKey = platform === 'ios'
        ? '{{REVENUECAT_IOS_KEY}}'
        : '{{REVENUECAT_ANDROID_KEY}}';
      const validPrefix = platform === 'ios' ? 'appl_' : 'goog_';
      if (!rcKey.startsWith(validPrefix)) {
        console.error(
          `[RevenueCat] INVALID key for ${platform} — must start with "${validPrefix}". ` +
          `Got: "${rcKey.substring(0, 5)}". Use Public SDK Key, not test_ key.`
        );
      } else {
        try {
          await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
          await Purchases.configure({ apiKey: rcKey });
        } catch (err) {
          console.error('[RevenueCat] configure() failed:', err);
        }
      }

      // ─── OneSignal — push notifications ───────────────────────────────────
      try {
        OneSignal.initialize('{{ONESIGNAL_APP_ID}}');
        OneSignal.Notifications.requestPermission(true);
      } catch (err) {
        console.error('[OneSignal] initialize() failed:', err);
      }

      // ─── Capacitor Updater — OTA bundle health-check ──────────────────────
      // Mark the currently-running bundle healthy so Capgo's plugin doesn't
      // roll back to the previous one. If we never reach this line (because
      // the bundle crashed before mount), the plugin auto-rolls back at
      // appReadyTimeout (10s in capacitor.config.ts). See ./11-bundled-ota.md.
      try {
        await CapacitorUpdater.notifyAppReady();
      } catch (err) {
        console.warn('[CapacitorUpdater] notifyAppReady failed:', err);
      }

      // Check for OTA updates in the background (one-shot at boot).
      // Re-check on resume from background. The actual download/apply logic
      // lives in src/lib/ota-updater.ts — see ./11-bundled-ota.md.
      try {
        const { checkForOtaUpdate } = await import('@/lib/ota-updater');
        void checkForOtaUpdate();
        App.addListener('appStateChange', (state) => {
          if (state.isActive) void checkForOtaUpdate();
        });
      } catch {
        // ota-updater.ts is optional; if not present, OTA is disabled. App still works.
      }

      // ─── Hide the splash screen ──────────────────────────────────────────
      // launchShowDuration:2000 + launchAutoHide:true in capacitor.config.ts
      // is the safety backstop. We hide manually here as soon as React is up
      // so users see content faster than the 2s timeout.
      setTimeout(() => SplashScreen.hide(), 100);
    } catch (err) {
      // Native init failure must never crash the app. The web UI keeps working.
      console.error('[Native init] failed:', err);
    }
  })();
}
