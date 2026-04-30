// FROZEN TEMPLATE — substitute these 3 values then commit:
//   {{BUNDLE_ID}}        →  e.g. com.yourcompany.gamechime
//   {{APP_DISPLAY_NAME}} →  e.g. GameChime
//   {{LOVABLE_URL}}      →  e.g. https://abc123.lovable.app  (used ONLY for dev hot-reload, see below)
//
// IF THIS APP USES GOOGLE SIGN-IN: also uncomment the GoogleAuth block at the
// bottom of plugins{} and substitute the 3 client-ID values. See
// references/07-google-native-signin.md for the full architecture.
//
// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION = BUNDLED ASSETS, NOT LIVE URL
// ═══════════════════════════════════════════════════════════════════════════
// Production iOS/Android builds load the bundled `dist/` web assets from
// inside the .ipa / .apk. We do NOT ship a `server.url` pointing at the
// live Lovable URL in production because:
//   1. Apple Guideline 4.2 (Minimum Functionality) can reject apps that
//      are essentially just a website wrapper. A reviewer who opens an
//      app whose root URL is https://yourapp.lovable.app sees a website
//      and may reject before noticing the native plugins underneath.
//   2. Operational fragility: a bad client-side deploy on the live site
//      bricks every installed app on every user's device. There is no
//      rollback short of a new App Store binary.
//
// OTA updates are still automatic, just delivered via @capgo/capacitor-updater
// pulling new bundles from your own Supabase Storage bucket. See
// references/11-bundled-ota.md for the full setup.
//
// ⚠️  DEV HOT-RELOAD: set the env var `CAP_DEV_RELOAD=1` BEFORE running
//     `npx cap sync` if you want the WebView to point at the live Lovable
//     URL for fast iteration. NEVER commit a build made with that flag set.
//
// ⚠️  DO NOT add `iosScheme: 'https'` to the server block. Capacitor's
//     normalize() silently rejects it (see CAPInstanceDescriptor.swift —
//     WKWebView reserves https). The WebView would register for capacitor://
//     while the bundled config thinks the URL is https://, breaking
//     navigation and producing a black screen on launch.

import { CapacitorConfig } from '@capacitor/cli';

const isDevReload = process.env.CAP_DEV_RELOAD === '1';

const config: CapacitorConfig = {
  appId: '{{BUNDLE_ID}}',
  appName: '{{APP_DISPLAY_NAME}}',
  webDir: 'dist',
  // Root-level backgroundColor is applied to the WKWebView itself (white).
  // Without this, an unfinished navigation leaves the WebView showing
  // UIColor.systemBackground — BLACK in iOS dark mode. With it, any loading
  // hiccup shows white instead of an unrecoverable black screen.
  backgroundColor: '#ffffff',
  ios: {
    // Lets Safari Web Inspector attach to TestFlight builds. Safe to ship —
    // no user-facing effect, just a debugging on-ramp when something breaks.
    webContentsDebuggingEnabled: true
  },
  ...(isDevReload
    ? {
        server: {
          // DEV ONLY — never commit a build made with CAP_DEV_RELOAD=1.
          url: '{{LOVABLE_URL}}',
          cleartext: false,
          androidScheme: 'https'
        }
      }
    : {
        server: {
          // Production: only set androidScheme. iOS uses the default
          // `capacitor` scheme. NO `url` — the WebView loads from bundled
          // public/index.html via capacitor://localhost.
          androidScheme: 'https'
        }
      }),
  plugins: {
    SplashScreen: {
      // Auto-hide after 2s as a backstop. The app calls SplashScreen.hide()
      // from main.tsx as soon as React mounts (typically <500ms), but if
      // the JS bundle ever fails to execute, the timeout prevents a forever
      // splash → black screen.
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999'
    },
    StatusBar: {
      style: 'Default'
    },
    CapacitorUpdater: {
      // OTA bundles ship from your own Supabase Storage signed URLs via
      // an `ota-manifest` edge function. We do NOT use Capgo's hosted CDN.
      // See references/11-bundled-ota.md for the full setup.
      autoUpdate: false,            // we trigger checks manually from src/lib/ota-updater.ts
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      keepUrlPathAfterReload: true,
      appReadyTimeout: 10000,       // 10s window for new bundle to call notifyAppReady() before rollback
      directUpdate: false           // restart-to-apply, not hot-swap
    }
    // ═══════════════════════════════════════════════════════════════════════
    // ONLY UNCOMMENT IF THE APP USES GOOGLE SIGN-IN
    // ═══════════════════════════════════════════════════════════════════════
    // Substitute:
    //   {{GOOGLE_IOS_CLIENT_ID}}     →  iOS OAuth client ID from Google Cloud Console
    //                                   format: NUMERIC.apps.googleusercontent.com
    //   {{GOOGLE_WEB_CLIENT_ID}}     →  Web OAuth client ID (used as serverClientId)
    //                                   format: NUMERIC.apps.googleusercontent.com
    //
    // CRITICAL RULES (see references/07-google-native-signin.md for full context):
    //   • iosClientId    = iOS client ID (drives the native sign-in flow)
    //   • serverClientId = WEB client ID (sets the aud claim on serverAuthCode)
    //   • forceCodeForRefreshToken: true — otherwise serverAuthCode is sometimes
    //                                       missing and the Edge Function 400s
    //   • Do NOT set a top-level `clientId` — it overrides everything and breaks
    //     the OAuth callback ("drawer never closes")
    //
    // ,GoogleAuth: {
    //   scopes: ['profile', 'email'],
    //   iosClientId: '{{GOOGLE_IOS_CLIENT_ID}}',
    //   serverClientId: '{{GOOGLE_WEB_CLIENT_ID}}',
    //   forceCodeForRefreshToken: true
    // }
  }
};

export default config;
