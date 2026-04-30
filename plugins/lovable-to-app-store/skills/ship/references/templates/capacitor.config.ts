// FROZEN TEMPLATE — substitute these 3 values then commit:
//   {{BUNDLE_ID}}        →  e.g. com.yourcompany.gamechime
//   {{APP_DISPLAY_NAME}} →  e.g. GameChime
//   {{LOVABLE_URL}}      →  e.g. https://abc123.lovable.app
//
// Everything else is identical across every app you ship with this plugin.
//
// IF THIS APP USES GOOGLE SIGN-IN: also uncomment the GoogleAuth block at the
// bottom of plugins{} and substitute the 3 client-ID values. See
// references/07-google-native-signin.md for the full architecture.
//
// ⚠️  DO NOT add `iosScheme: 'https'` to the server block. Capacitor's
//     normalize() silently rejects it (see CAPInstanceDescriptor.swift
//     `normalize()` — only custom URL schemes pass WKWebView.handlesURLScheme).
//     If iosScheme is rejected, the WebView is registered for `capacitor://`
//     while the bundled config thinks the URL is `https://`, leading to
//     navigation failure and a black screen on launch. iOS uses the
//     default `capacitor` scheme — leave it unset.

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '{{BUNDLE_ID}}',
  appName: '{{APP_DISPLAY_NAME}}',
  webDir: 'dist',
  // Root-level backgroundColor is applied to the WKWebView itself (white).
  // Without this, an unfinished navigation leaves the WebView showing
  // UIColor.systemBackground — which is BLACK in iOS dark mode. With it,
  // any loading hiccup shows white instead of an unrecoverable black screen.
  backgroundColor: '#ffffff',
  ios: {
    // Lets Safari Web Inspector attach to TestFlight builds. Safe to ship —
    // no user-facing effect, just a debugging on-ramp when something breaks.
    webContentsDebuggingEnabled: true
  },
  server: {
    // Live Lovable URL — enables automatic OTA updates.
    // Users see new versions next time they open the app.
    url: '{{LOVABLE_URL}}',
    cleartext: false,
    androidScheme: 'https'
    // NOTE: do NOT set `iosScheme: 'https'` here. See header comment.
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      // CRITICAL: launchAutoHide MUST be false when using server.url.
      // The 2-second auto-hide fires before the WebView loads the remote URL,
      // leaving users on a black screen. We hide manually after mount instead
      // (see SplashScreen.hide() in the SDK init snippet).
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999'
    },
    StatusBar: {
      style: 'Default'
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
