# Apple Native Sign-In — Capacitor + Supabase (Lovable)

Complete guide to wiring up native Apple Sign-In on iOS in a Lovable + Capacitor app backed by Supabase auth. Uses the same Edge Function auth code exchange pattern as Google Sign-In.

---

## Architecture

```
┌─────────────┐   ASAuthorization  ┌──────────┐
│  iOS native  │  ──────────────► │  Apple    │
│  Sign In     │  ◄────────────── │  ID       │
│  (@capacitor-│  identityToken + │  servers  │
│  community/  │  authorizationCode│          │
│  apple-sign- │                   │          │
│  in)         │                   │          │
└──────┬───────┘                  └──────────┘
       │
       │ authorizationCode (NOT identityToken!)
       ▼
┌──────────────────────┐    code exchange    ┌──────────┐
│  Supabase Edge Fn    │  ───────────────►  │  Apple    │
│  apple-native-signin │  ◄───────────────  │  token    │
│                      │  new id_token      │  endpoint │
│  (has client secret) │  (aud=BUNDLE ID)   │          │
└──────┬───────────────┘                    └──────────┘
       │
       │ id_token (aud = BUNDLE ID)
       ▼
┌──────────────────────┐
│  Supabase Auth       │
│  signInWithIdToken() │  ← accepts because aud matches
│  provider: 'apple'   │     the configured Apple provider
└──────────────────────┘     (client_id = bundle ID)
```

**CRITICAL: Native iOS uses BUNDLE ID, not Services ID**

On native iOS, ASAuthorization ALWAYS binds authorization codes to the app's **bundle ID** (e.g., `com.yourcompany.musicapp`). The Edge Function MUST exchange the code using the bundle ID as `client_id`, and the JWT client secret MUST have `sub = bundle ID`. The resulting id_token will have `aud = bundle ID`, so the Supabase Apple auth provider MUST be configured with `client_id = bundle ID`.

The **Services ID** (e.g., `com.yourcompany.musicapp.web`) is ONLY used for web-based OAuth redirect flows. It is NOT used for native iOS auth code exchange.

**Why not use the native identityToken directly?**

The native identityToken from ASAuthorization has no nonce, and Supabase requires one for signInWithIdToken. The auth code exchange approach lets us get a fresh id_token from Apple's token endpoint that Supabase can validate.

---

## Prerequisites

### Apple Developer Portal Setup

| Item | Purpose | Where Configured |
|------|---------|-----------------|
| App ID | Bundle ID with Sign in with Apple capability | Certificates, Identifiers & Profiles → Identifiers |
| Services ID | Web Sign in with Apple (audience for Supabase) | Certificates, Identifiers & Profiles → Identifiers (Services IDs) |
| Sign in with Apple Key (.p8) | Generate JWT client secrets | Certificates, Identifiers & Profiles → Keys |

### Key Info

- **Bundle ID**: Your app's bundle ID (e.g., `com.yourcompany.musicapp`)
- **Services ID**: A separate identifier for web auth (e.g., `com.yourcompany.musicapp.web`)
- **Team ID**: Your Apple Developer team ID
- **Key ID**: From the .p8 key you create

---

## Step 1: Apple Developer Portal Configuration

### Enable Sign in with Apple on App ID
1. Go to Identifiers → App IDs → your app
2. Enable "Sign in with Apple" capability
3. Save

### Create Services ID
1. Go to Identifiers → "+" → Services IDs
2. Description: e.g., "MusicApp Web Auth"
3. Identifier: e.g., `com.yourcompany.musicapp.web`
4. Enable "Sign in with Apple"
5. Configure domains and return URLs:
   - Domains: `<supabase-ref>.supabase.co`, `yourdomain.com`
   - Return URLs: `https://<supabase-ref>.supabase.co/auth/v1/callback`, `https://yourdomain.com/auth/callback`

### Create Sign in with Apple Key
1. Go to Keys → "+" 
2. Name: e.g., "App Name Sign In"
3. Enable "Sign in with Apple", configure with your App ID
4. Register and download the `.p8` file
5. **Keep the .p8 file safe — you can only download it once!**

---

## Step 2: Generate JWT Client Secret

Apple uses a JWT as the client secret (not a static string like Google). It expires after max 6 months and must be regenerated.

```python
# regenerate-apple-secret.py
import jwt, time

TEAM_ID = "YOUR_TEAM_ID"
KEY_ID = "YOUR_KEY_ID"
SERVICES_ID = "com.example.app.web"

with open("AuthKey_XXXX.p8", "r") as f:
    private_key = f.read()

now = int(time.time())
six_months = 15777000

headers = {"kid": KEY_ID, "alg": "ES256"}
payload = {
    "iss": TEAM_ID,
    "iat": now,
    "exp": now + six_months,
    "aud": "https://appleid.apple.com",
    "sub": SERVICES_ID,
}

secret = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
print(f"Client Secret:\n{secret}")
```

Requires: `pip install PyJWT cryptography`

**IMPORTANT:** Set a calendar reminder to regenerate before expiry! The JWT has a max 6-month lifetime.

---

## Step 3: Configure Supabase Apple Auth Provider

In Lovable's Supabase settings:
- Switch Apple auth from "Managed by Lovable" to "Your own credentials"
- Client ID = **Services ID** (e.g., `com.yourcompany.musicapp.web`)
- Client Secret = **JWT** generated in Step 2

---

## Step 4: Create the Edge Function

Create `supabase/functions/apple-native-signin/index.ts`:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APPLE_CLIENT_ID = Deno.env.get('APPLE_CLIENT_ID');
    if (!APPLE_CLIENT_ID) throw new Error('APPLE_CLIENT_ID not configured');

    const APPLE_CLIENT_SECRET = Deno.env.get('APPLE_CLIENT_SECRET');
    if (!APPLE_CLIENT_SECRET) throw new Error('APPLE_CLIENT_SECRET not configured');

    const { authorizationCode } = await req.json();
    if (!authorizationCode) throw new Error('authorizationCode is required');

    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authorizationCode,
        client_id: APPLE_CLIENT_ID,
        client_secret: APPLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const err = tokenData?.error_description || tokenData?.error || 'Token exchange failed';
      console.error('Apple token exchange failed:', JSON.stringify(tokenData));
      return new Response(
        JSON.stringify({ error: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!tokenData.id_token) {
      return new Response(
        JSON.stringify({ error: 'No id_token in Apple response' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ id_token: tokenData.id_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('apple-native-signin error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

### Edge Function Secrets

- `APPLE_CLIENT_ID` = the **Services ID** (e.g., `com.yourcompany.musicapp.web`)
- `APPLE_CLIENT_SECRET` = the **JWT client secret** generated from the .p8 key

---

## Step 5: Add App.entitlements

Create `ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.applesignin</key>
    <array>
        <string>Default</string>
    </array>
</dict>
</plist>
```

Add `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` to the build settings in `project.pbxproj` for both Debug and Release configurations.

**IMPORTANT:** The provisioning profile must include the Sign in with Apple entitlement. If the profile is "Invalid" after enabling the capability on the App ID, regenerate it in the Apple Developer Portal.

---

## Step 6: Write the Native Sign-In Code

Create `src/lib/native/apple-sign-in.ts`:

```typescript
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from '@/integrations/supabase/client';

export const nativeAppleSignIn = async (): Promise<{ success: boolean; error?: string }> => {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  try {
    const result = await SignInWithApple.authorize({
      clientId: 'com.example.app.web', // Services ID
      scopes: 'name email',
    });

    const authorizationCode = result?.response?.authorizationCode;
    if (!authorizationCode) {
      return { success: false, error: 'No authorization code from Apple' };
    }

    // Exchange authorizationCode via Edge Function
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'apple-native-signin',
      { body: { authorizationCode } }
    );

    if (fnError) {
      return { success: false, error: fnError.message || 'Token exchange failed' };
    }

    const idToken = fnData?.id_token;
    if (!idToken) {
      return { success: false, error: fnData?.error || 'No id_token from exchange' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('cancel') || msg.includes('1001')) {
      return { success: false }; // User cancelled
    }
    return { success: false, error: msg || 'Apple Sign In failed' };
  }
};
```

---

## Step 7: Wire into Login UI

In your OAuth handler (same file that handles Google):

```typescript
if (provider === 'apple' && Capacitor.isNativePlatform()) {
  const result = await nativeAppleSignIn();
  if (result.success) return;
  if (result.error) showError(result.error);
}
```

---

## Common Failures and Fixes

### "invalid_client" from Apple token exchange
**Cause:** The JWT client secret has expired (max 6-month lifetime) or the Services ID doesn't match.
**Fix:** Regenerate the JWT using the .p8 key. Verify the `sub` claim = Services ID.

### "invalid_grant" from Apple token exchange
**Cause:** Authorization code was already used, or too much time elapsed.
**Fix:** Auth codes are single-use and expire in 5 minutes. Have the user sign in again.

### Edge Function returns 404
**Cause:** Lovable hasn't deployed the function yet.
**Fix:** Explicitly ask Lovable to deploy. Verify: `curl -s -o /dev/null -w '%{http_code}' -X POST 'https://<ref>.supabase.co/functions/v1/apple-native-signin'` → should return 400, not 404.

### Provisioning profile "Invalid" after enabling Sign in with Apple
**Cause:** The App ID capabilities changed but the profile wasn't regenerated.
**Fix:** Go to Apple Developer Portal → Profiles → Edit the profile → Save → Download and install.

### ITMS-90683: Missing NSLocationWhenInUseUsageDescription
**Cause:** A Capacitor plugin (e.g., @bglocation/capacitor, OneSignal) references location APIs.
**Fix:** Add all three location usage descriptions to Info.plist even if you don't use location:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`  
- `NSLocationAlwaysUsageDescription`

### Build fails with "no entitlements" or signing error
**Cause:** Missing App.entitlements file or CODE_SIGN_ENTITLEMENTS not set in pbxproj.
**Fix:** Create the entitlements file and add `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` to build settings.

---

## Differences from Google Sign-In

| Aspect | Google | Apple |
|--------|--------|-------|
| Native SDK | `@codetrix-studio/capacitor-google-auth` | `@capacitor-community/apple-sign-in` |
| Exchange field | `serverAuthCode` | `authorizationCode` |
| Token endpoint | `https://oauth2.googleapis.com/token` | `https://appleid.apple.com/auth/token` |
| Client secret | Static (web client secret from Google Cloud) | JWT (signed with .p8 key, expires every 6 months) |
| Audience mismatch | aud=iOS client ID vs. aud=Web client ID | aud=Bundle ID vs. aud=Services ID |
| Extra requirements | Reversed client ID URL scheme in Info.plist | App.entitlements + regenerate provisioning profile |
| Capacitor config | `GoogleAuth` plugin in capacitor.config.ts | None needed — plugin uses clientId from JS call |

---

## Checklist

Before submitting a build with Apple Sign-In:

- [ ] App ID has "Sign in with Apple" capability enabled
- [ ] Services ID created with domains and return URLs configured
- [ ] .p8 key created and downloaded (keep safe!)
- [ ] JWT client secret generated (check expiry date!)
- [ ] Supabase Apple auth provider set to "Your own credentials" with Services ID + JWT
- [ ] Edge Function `apple-native-signin` created with code exchange logic
- [ ] Edge Function secrets set: `APPLE_CLIENT_ID` (Services ID), `APPLE_CLIENT_SECRET` (JWT)
- [ ] Edge Function deployed (verified with curl, not 404)
- [ ] `@capacitor-community/apple-sign-in` installed
- [ ] `apple-sign-in.ts` uses `authorizationCode` (not `identityToken`) for Edge Function
- [ ] `App.entitlements` exists with `com.apple.developer.applesignin`
- [ ] `CODE_SIGN_ENTITLEMENTS` set in pbxproj
- [ ] Provisioning profile regenerated with Sign in with Apple entitlement
- [ ] `NSLocationWhenInUseUsageDescription` in Info.plist (prevents ITMS-90683)
- [ ] JWT renewal reminder set (max 6-month lifetime)

---

## Memory Schema Additions

When recording Apple Auth in an app's memory file, include:

```json
{
  "apple_auth": {
    "services_id": "com.example.app.web",
    "key_id": "XXXXXXXXXX",
    "p8_file": "AuthKey_XXXXXXXXXX.p8",
    "edge_function": "apple-native-signin",
    "edge_function_secrets": ["APPLE_CLIENT_ID (Services ID)", "APPLE_CLIENT_SECRET (JWT)"],
    "jwt_secret_expiry": "YYYY-MM-DD",
    "jwt_renewal_scheduled": "YYYY-MM-DD",
    "architecture": "authorizationCode -> Edge Function -> code exchange -> id_token (aud=Services ID) -> signInWithIdToken"
  }
}
```
