# Google Native Sign-In — Capacitor + Supabase (Lovable)

Complete guide to wiring up native Google Sign-In on iOS/Android in a Lovable + Capacitor app backed by Supabase auth. This is the **only** approach that works when Supabase is managed by Lovable (no access to "Authorized Client IDs" setting).

---

## Architecture

```
┌─────────────┐   native SDK    ┌──────────┐
│  iOS/Android │  ───────────►  │  Google   │
│  GoogleAuth  │  ◄─────────── │  OAuth    │
│  plugin      │  idToken +     │  servers  │
│              │  serverAuthCode│          │
└──────┬───────┘                └──────────┘
       │
       │ serverAuthCode (NOT idToken!)
       ▼
┌──────────────────────┐    code exchange    ┌──────────┐
│  Supabase Edge Fn    │  ───────────────►  │  Google   │
│  google-native-signin│  ◄───────────────  │  token    │
│                      │  new idToken       │  endpoint │
│  (has client secret) │  (aud=WEB_ID)      │          │
└──────┬───────────────┘                    └──────────┘
       │
       │ idToken (aud = web client ID)
       ▼
┌──────────────────────┐
│  Supabase Auth       │
│  signInWithIdToken() │  ← accepts because aud matches
│                      │     the configured Google provider
└──────────────────────┘
```

**Why not use the native idToken directly?**

The native Google Sign-In SDK sets the ID token's `aud` (audience) to the **iOS client ID** (or Android client ID). But Supabase validates the token's `aud` against the **web client ID** configured in the Google auth provider. On Lovable-managed Supabase, you can't add additional authorized client IDs. So the native ID token gets rejected.

The fix: use the `serverAuthCode` from the native SDK. Exchange it server-side (Edge Function) with the web client ID + client secret. Google returns a new ID token with `aud = web client ID`, which Supabase accepts.

---

## Prerequisites

Before starting, you need three Google OAuth client IDs from Google Cloud Console:

| Client Type | Used For | Where Configured |
|-------------|----------|-----------------|
| Web | Supabase auth provider + Edge Function code exchange | Supabase dashboard (via Lovable) + Edge Function env vars |
| iOS | Native iOS sign-in SDK | `capacitor.config.ts` as `iosClientId` + URL scheme in Info.plist |
| Android | Native Android sign-in SDK | `capacitor.config.ts` as `androidClientId` (or auto-detected) |

You also need the **Web client secret** (from the Web client ID's page in Google Cloud Console), stored as a Supabase Edge Function secret.

---

## Step 1: Create Google OAuth Clients

In Google Cloud Console → APIs & Services → Credentials:

### Web Client
- Application type: Web application
- Authorized redirect URI: `https://<supabase-ref>.supabase.co/auth/v1/callback`
- Save the **Client ID** and **Client Secret**

### iOS Client
- Application type: iOS
- Bundle ID: your app's bundle ID (e.g., `com.yourcompany.musicapp`)
- Save the **Client ID** (format: `XXXX.apps.googleusercontent.com`)
- Note the **reversed client ID** (reverse the segments: `com.googleusercontent.apps.XXXX`)

### Android Client
- Application type: Android
- Package name: your app's package name (same as bundle ID)
- SHA-1 fingerprint: from your signing keystore (`keytool -list -v -keystore your.keystore`)
- Save the **Client ID**

---

## Step 2: Configure Supabase Google Auth Provider

In Lovable's Supabase settings (or Supabase dashboard if accessible):
- Set Google Client ID = **Web** client ID
- Set Google Client Secret = **Web** client secret
- Enable Google auth provider

---

## Step 3: Create the Edge Function

Create `supabase/functions/google-native-signin/index.ts`:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID not configured');

    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_SECRET not configured');

    const { serverAuthCode } = await req.json();
    if (!serverAuthCode) throw new Error('serverAuthCode is required');

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: serverAuthCode,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: '',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const err = tokenData?.error_description || tokenData?.error || 'Token exchange failed';
      console.error('Google token exchange failed:', JSON.stringify(tokenData));
      return new Response(
        JSON.stringify({ error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!tokenData.id_token) {
      return new Response(
        JSON.stringify({ error: 'No id_token in Google response' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ id_token: tokenData.id_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('google-native-signin error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

### Edge Function Secrets

Set these via Supabase dashboard or CLI:
- `GOOGLE_CLIENT_ID` = the **Web** client ID
- `GOOGLE_CLIENT_SECRET` = the **Web** client secret

### CRITICAL: Deploying Edge Functions with Lovable

Lovable does **NOT** auto-deploy new Edge Functions when you push code to GitHub or pull changes into Lovable. You must explicitly ask Lovable to deploy the function. Verify deployment with:

```bash
curl -s -o /dev/null -w '%{http_code}' -X POST \
  'https://<ref>.supabase.co/functions/v1/google-native-signin'
# Should return 400 (bad request, no body), NOT 404
```

If you get 404, the function isn't deployed yet.

---

## Step 4: Configure capacitor.config.ts

Add the GoogleAuth plugin configuration:

```typescript
plugins: {
  GoogleAuth: {
    scopes: ['profile', 'email'],
    iosClientId: '<iOS-client-ID>.apps.googleusercontent.com',
    serverClientId: '<Web-client-ID>.apps.googleusercontent.com',
    forceCodeForRefreshToken: true,
  },
}
```

**Critical rules:**
- `iosClientId` = iOS client ID (used by native SDK for the sign-in flow)
- `serverClientId` = **Web** client ID (tells the SDK to generate a `serverAuthCode` using this as the audience)
- `forceCodeForRefreshToken: true` = ensures `serverAuthCode` is always returned
- Do NOT set a top-level `clientId` here — it overrides platform-specific IDs and breaks everything

---

## Step 5: Add iOS URL Scheme

In `ios/App/App/Info.plist`, add the **reversed iOS client ID** as a URL scheme:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.XXXX</string>
    </array>
  </dict>
</array>
```

This is how the Google Sign-In SDK routes the OAuth callback back to the app. Without it, the auth drawer will never close.

---

## Step 6: Write the Native Sign-In Code

Create `src/lib/native/google-sign-in.ts`:

```typescript
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from '@/integrations/supabase/client';

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
let initialized = false;

const ensureInitialized = () => {
  if (initialized) return;

  if (Capacitor.isNativePlatform()) {
    // On native, do NOT pass clientId. The plugin reads iosClientId from
    // capacitor.config.ts. Passing clientId overrides the native client ID
    // and breaks the OAuth callback (drawer never closes).
    GoogleAuth.initialize({
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
  } else {
    if (!WEB_CLIENT_ID) {
      throw new Error('VITE_GOOGLE_WEB_CLIENT_ID is not set.');
    }
    GoogleAuth.initialize({
      clientId: WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
  }

  initialized = true;
};

export const nativeGoogleSignIn = async (): Promise<{ success: boolean; error?: string }> => {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: 'Not running on native platform' };
  }

  try {
    ensureInitialized();
    const googleUser = await GoogleAuth.signIn();
    const serverAuthCode = googleUser?.serverAuthCode;

    if (!serverAuthCode) {
      return { success: false, error: 'No server auth code received from Google' };
    }

    // Exchange serverAuthCode via Edge Function — gets ID token with aud=web_client_id
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'google-native-signin',
      { body: { serverAuthCode } }
    );

    if (fnError) {
      console.error('[GoogleSignIn] Edge function error:', fnError);
      return { success: false, error: fnError.message || 'Token exchange failed' };
    }

    const idToken = fnData?.id_token;
    if (!idToken) {
      const errMsg = fnData?.error || 'No id_token from token exchange';
      console.error('[GoogleSignIn] No id_token:', errMsg);
      return { success: false, error: errMsg };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      console.error('[GoogleSignIn] Supabase signInWithIdToken error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message || e?.error || '';
    if (msg.includes('cancel') || msg.includes('popup_closed') || e?.code === '12501') {
      return { success: false };
    }
    console.error('[GoogleSignIn] Unexpected error:', e);
    return { success: false, error: msg || 'Google Sign In failed' };
  }
};

export const isNativeGoogleSignInAvailable = (): boolean => {
  return Capacitor.isNativePlatform();
};
```

---

## Step 7: Wire into Login UI

In your OAuth handler or login page:

```typescript
import { Capacitor } from '@capacitor/core';
import { nativeGoogleSignIn } from '@/lib/native/google-sign-in';

if (Capacitor.isNativePlatform()) {
  const result = await nativeGoogleSignIn();
  if (result.success) {
    // Auth state change listener handles navigation
    return;
  }
  if (result.error) {
    showError(result.error);
  }
} else {
  // Web OAuth flow (redirect-based)
  await supabase.auth.signInWithOAuth({ provider: 'google' });
}
```

---

## Common Failures and Fixes

### Auth drawer opens but never closes
**Cause:** The iOS URL scheme doesn't match the client ID being used for sign-in.
**Fix:** Ensure `iosClientId` in capacitor.config.ts matches the reversed URL scheme in Info.plist. Do NOT pass `clientId` in `GoogleAuth.initialize()` on native platforms.

### Drawer closes but user isn't logged in
**Cause:** The native ID token has `aud = iOS client ID`, but Supabase only accepts `aud = web client ID`.
**Fix:** Use the Edge Function approach (exchange serverAuthCode, not idToken).

### Edge Function returns 404
**Cause:** Lovable hasn't deployed the function yet.
**Fix:** Explicitly ask Lovable to deploy Edge Functions. Verify with curl.

### "invalid_grant" from Google token exchange
**Cause:** Auth code was already used, or too much time passed between sign-in and exchange.
**Fix:** Auth codes are single-use. Have the user sign in again.

### Google Sign-In crash on iOS
**Cause:** Missing reversed client ID URL scheme, or `clientId` override in initialize().
**Fix:** Check Info.plist URL schemes and ensure initialize() doesn't pass clientId on native.

### Plugin reads wrong client ID
**Cause:** The `@codetrix-studio/capacitor-google-auth` plugin Swift code checks `call.getString("clientId")` FIRST, then falls through to `getClientIdValue()` which reads `iosClientId` from config. Passing clientId in JS overrides everything.
**Fix:** Never pass clientId on native platforms. Let the plugin read from capacitor.config.ts.

---

## Checklist

Before submitting a build with Google Sign-In:

- [ ] Three OAuth client IDs created (Web, iOS, Android)
- [ ] Web client ID + secret set in Supabase Google auth provider
- [ ] `capacitor.config.ts` has `GoogleAuth.iosClientId` (iOS client ID)
- [ ] `capacitor.config.ts` has `GoogleAuth.serverClientId` (Web client ID)
- [ ] `capacitor.config.ts` has `GoogleAuth.forceCodeForRefreshToken: true`
- [ ] Info.plist has reversed iOS client ID as URL scheme
- [ ] Edge Function `google-native-signin` created with code exchange logic
- [ ] Edge Function secrets set: `GOOGLE_CLIENT_ID` (web), `GOOGLE_CLIENT_SECRET` (web)
- [ ] Edge Function deployed (verified with curl, not 404)
- [ ] `google-sign-in.ts` does NOT pass `clientId` to `GoogleAuth.initialize()` on native
- [ ] `google-sign-in.ts` uses `serverAuthCode` (not `idToken`) for the Edge Function call
- [ ] `VITE_GOOGLE_WEB_CLIENT_ID` set in Lovable Cloud Secrets for web fallback

---

## Memory Schema Additions

When recording Google Auth in an app's memory file, include:

```json
{
  "google_auth": {
    "web_client_id": "stored in [location]",
    "ios_client_id": "stored in [location]",
    "android_client_id": "stored in [location]",
    "ios_reversed_client_id": "com.googleusercontent.apps.XXXX",
    "edge_function": "google-native-signin",
    "edge_function_secrets": ["GOOGLE_CLIENT_ID (web)", "GOOGLE_CLIENT_SECRET (web)"],
    "architecture": "serverAuthCode -> Edge Function -> code exchange -> idToken (aud=web) -> signInWithIdToken"
  }
}
```
