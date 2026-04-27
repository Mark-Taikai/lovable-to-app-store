// SDK INIT SNIPPET — inject at the top of src/main.tsx (after existing imports)
// Substitute these 3 values:
//   {{REVENUECAT_IOS_KEY}}     →  starts with appl_  (from RevenueCat → Project Settings → API Keys → Public SDK Key)
//   {{REVENUECAT_ANDROID_KEY}} →  starts with goog_  (same page, Android tab)
//   {{ONESIGNAL_APP_ID}}       →  UUID from OneSignal → your app → Settings
//
// ⚠️ NEVER use test_ prefixed keys — they crash the app on startup with no error message.

// Native SDK initialization — added by the lovable-to-app-store plugin
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import OneSignal from '@onesignal/onesignal-capacitor';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

if (Capacitor.isNativePlatform()) {
  (async () => {
    const platform = Capacitor.getPlatform();

    // RevenueCat — in-app purchases
    // iOS key must start with "appl_", Android key with "goog_".
    // A "test_" key causes an immediate crash on startup.
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

    // OneSignal — push notifications
    try {
      OneSignal.initialize('{{ONESIGNAL_APP_ID}}');
      OneSignal.Notifications.requestPermission(true);
    } catch (err) {
      console.error('[OneSignal] initialize() failed:', err);
    }

    // Hide splash screen after WebView loads the Lovable URL.
    // 300ms gives the WebView time to start loading — prevents black screen.
    // launchAutoHide is false in capacitor.config.ts, so this call is required.
    setTimeout(() => SplashScreen.hide(), 300);
  })();
}
