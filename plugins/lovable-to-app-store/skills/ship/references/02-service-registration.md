# Service Registration — Browser Workflows

Register services in this order. Open each in a new browser tab. Navigate to the login page, ask the user to sign in if needed, then take over.

---

## 1. Apple Developer Portal

**URL:** https://developer.apple.com/account

**Goal:** Register the App ID (bundle ID) and note the Team ID.

Steps:
1. Navigate to https://developer.apple.com/account → "Certificates, Identifiers & Profiles"
2. Click "Identifiers" → "+" to add a new identifier
3. Select "App IDs" → "App" → Continue
4. Description: `{AppName}`
5. Bundle ID: Explicit → enter the bundle ID exactly
6. Capabilities to enable:
   - Push Notifications (for OneSignal)
   - In-App Purchase (for RevenueCat)
   - Associated Domains (if app has sign-in)
7. Click "Register"
8. **Copy the Team ID** from the top-right corner of the account page (format: 10-character alphanumeric like `ABC123DEF4`)
9. Save to memory: `apple_team_id`, `apple_app_id` (the numeric App ID shown after registration)

**Create Push Notification key (for OneSignal):**
1. Certificates, Identifiers & Profiles → Keys → "+"
2. Name: `{AppName} Push Key`
3. Enable "Apple Push Notifications service (APNs)"
4. Register → Download the `.p8` file
5. Note the Key ID
6. Save the `.p8` file path, Key ID to memory

**Create App Store Connect API Key (required for automated CI/CD signing):**
1. Navigate to https://appstoreconnect.apple.com/access/integrations/api
2. Click "Generate API Key" (or "+" if keys already exist)
3. Name: `{AppName} CI`
4. Access: **App Manager**
5. Click Generate → **Download the `.p8` key file immediately** (only downloadable once — if missed, delete and create a new key)
6. Note:
   - **Key ID** shown in the table (e.g. `ABCDE12345`)
   - **Issuer ID** shown at the top of the page (UUID format)
7. Save to memory: `asc_key_id`, `asc_issuer_id`, `asc_key_p8_path`

**Add these as GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):
```
ASC_KEY_ID       = {Key ID from step 6}
ASC_ISSUER_ID    = {Issuer ID UUID from step 6}
ASC_KEY_CONTENT  = {paste the full .p8 file contents, including -----BEGIN/END PRIVATE KEY----- lines}
CERT_PASS        = {a strong RANDOMLY-GENERATED password — never reuse account or email passwords. Used to protect the exported signing certificate.}
APPLE_TEAM_ID    = {10-character team ID, e.g. ABCDE12345}
```

---

## 2. App Store Connect — App Listing

**URL:** https://appstoreconnect.apple.com

**Goal:** Create the app listing.

Steps:
1. Navigate to "My Apps" → "+" → "New App"
2. Platform: iOS
3. Name: `{AppDisplayName}`
4. Primary Language: English (United States)
5. Bundle ID: Select the one just registered in Developer Portal
6. SKU: `{bundleid-with-dashes}` e.g. `com-acmecorp-tracker`
7. User Access: Full Access
8. Click Create
9. Fill in "App Information":
   - Category: (infer from app analysis — e.g. Productivity, Business, Utilities)
   - Content Rights: check "No" unless app has third-party content
10. Fill in "Pricing and Availability": Free
11. Go to the "1.0 Prepare for Submission" section → "App Store Information" → fill description (use Claude's analysis of the app)
12. **Copy the Apple App ID** (numeric, shown in the URL: `apps.apple.com/app/id{XXXXXXXX}`)
13. Save to memory: `app_store_connect_app_id`

---

## 3. Google Play Console

**URL:** https://play.google.com/console

**Goal:** Create the app listing and internal testing track.

Steps:
1. Sign in with the client's Google account
2. Click "Create app"
3. App name: `{AppDisplayName}`
4. Default language: English (United States)
5. App or Game: App
6. Free or Paid: Free
7. Declarations: check both boxes
8. Click "Create app"
9. Go to "Dashboard" → complete the setup checklist:
   - App access: select appropriate option
   - Ads: "No"
   - Content rating: fill out the questionnaire (answer based on app analysis)
   - Target audience: select appropriate age range
10. Go to "Testing" → "Internal testing" → Create release
11. Note the package name (should match bundle ID)
12. Save to memory: `play_console_app_id`

---

## 4. RevenueCat

**URL:** https://app.revenuecat.com

**Goal:** Create a project and link Apple + Google apps.

Steps:
1. Sign in (or create account if first time for this client)
2. Click "Create new project"
3. Project name: `{ClientName} - {AppName}`
4. Under "Apps":
   - Add iOS app: enter App Name, Bundle ID, Apple Team ID, App Store Connect App ID
   - Add Android app: enter App Name, Package Name
5. Go to **"API Keys"** in the left sidebar
6. Copy the **Public SDK Key** for each platform

> ⚠️ **CRITICAL — Two types of keys exist on this page:**
>
> | Key type | Prefix | Valid for native SDK? |
> |---|---|---|
> | Public SDK Key | `appl_` (iOS) / `goog_` (Android) | ✅ YES — use this |
> | Secret / Test keys | `test_` | ❌ NO — causes immediate crash on startup |
>
> **Always use the Public SDK Key.** The dashboard may show other keys starting with `test_` — these are **not** valid for `Purchases.configure()` on iOS or Android. Passing a `test_` key causes the native SDK to throw a fatal error on app startup, crashing the app before any JavaScript runs. This crash appears in TestFlight as the app immediately closing after launch, with no error visible to the user.
>
> **How to identify the correct key:** The Public SDK Key is listed under "Public app-specific API keys". It will start with `appl_` for iOS and `goog_` for Android. If the key you copied does not start with one of these prefixes, it is the wrong key.

7. Note both public SDK keys
8. Save to memory: `revenuecat_ios_public_key`, `revenuecat_android_public_key`, `revenuecat_project_id`

**Validation before saving:** confirm that:
- `revenuecat_ios_public_key` starts with `appl_`
- `revenuecat_android_public_key` starts with `goog_`

If either key does not match its expected prefix, go back to the RevenueCat API Keys page and find the correct Public SDK Key.

---

## 5. OneSignal

**URL:** https://app.onesignal.com

**Goal:** Create an app and configure iOS + Android push.

Steps:
1. Sign in (or create account if first time for this client)
2. Click "New App / Website"
3. App name: `{AppDisplayName}`
4. Select platform: "Apple iOS"
5. For iOS setup:
   - Choose "Auth Key (.p8 file)"
   - Upload the `.p8` file downloaded from Apple Developer Portal
   - Enter: Key ID (from Apple), Team ID, Bundle ID
   - Click Save & Continue
6. Select "Google Android" → Continue:
   - Will need FCM Server Key — navigate to Firebase Console (https://console.firebase.google.com)
   - Create new project or use existing → Project Settings → Cloud Messaging → Server Key
   - Paste Server Key in OneSignal
7. Select "React Native / Capacitor" as SDK
8. Copy the **OneSignal App ID** (UUID format)
9. Save to memory: `onesignal_app_id`, `onesignal_api_key`

---

## 6. Google OAuth / Sign-In (if app uses Google Sign-In)

**URL:** https://console.cloud.google.com/auth/overview

**Goal:** Create **three** OAuth clients (Web, iOS, Android) and wire them into Supabase, capacitor.config.ts, Info.plist, and the Lovable Cloud Secrets.

> ⚠️ **This is service registration only.** Native sign-in also requires a Supabase Edge Function that exchanges the native `serverAuthCode` for an idToken with the right `aud` claim — see `references/07-google-native-signin.md` Steps 3–7 for the Edge Function code, capacitor.config.ts wiring, and the client wrapper. **Do not consider sign-in done after finishing this section.**

**Why three clients (not two):**
- **Web client** — used by both Supabase (server-side auth flow) and the Edge Function (code exchange with the Web client secret)
- **iOS client** — used by the native iOS sign-in SDK; reversed form becomes the `CFBundleURLTypes` entry
- **Android client** — used by the native Android sign-in SDK; bound to the package name + signing keystore SHA-1

Steps:

**1. Set up Google Auth Platform (one-time per project):**
1. Navigate to https://console.cloud.google.com/auth/overview
2. Select the correct Google Cloud project (create one if needed — name it after the app)
3. Click "Get started" — this opens the 4-step OAuth consent screen wizard:
   - **App Information:** App name = `{AppDisplayName}`, support email = client's email
   - **Audience:** External (so any Google account can sign in)
   - **Contact Information:** enter client's email
   - **Finish:** agree to Google API Services User Data Policy → "Continue" → "Create"

**2. Create the Web client (for Supabase + Edge Function):**
1. Go to https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `{AppDisplayName} Web`
5. Under "Authorized redirect URIs" → Add URI:
   `https://{supabase_project_id}.supabase.co/auth/v1/callback`
   (find the project ID in the Supabase project URL or `.env` file as `VITE_SUPABASE_PROJECT_ID`)
6. Click Create → copy **Client ID** and **Client Secret**
7. Save to memory: `google_auth.web_client_id`, `google_auth.web_client_secret` (the secret is later used in the Edge Function — see ref 07 Step 3)

**3. Create the iOS client (for native iOS SDK + URL scheme):**
1. Still in APIs & Services → Credentials → "Create Credentials" → "OAuth client ID"
2. Application type: **iOS**
3. Name: `{AppDisplayName} iOS`
4. Bundle ID: `{bundleId}` (must match exactly)
5. Click Create → copy the **Client ID**
6. The **reversed Client ID** (URL scheme) = take the Client ID and reverse the dot-segments:
   e.g. `1234567890-abcdefg.apps.googleusercontent.com` → `com.googleusercontent.apps.1234567890-abcdefg`
7. Save to memory: `google_auth.ios_client_id`, `google_auth.ios_reversed_client_id`

**4. Create the Android client (for native Android SDK):**
1. Still in APIs & Services → Credentials → "Create Credentials" → "OAuth client ID"
2. Application type: **Android**
3. Name: `{AppDisplayName} Android`
4. Package name: `{bundleId}` (the Android package name is the same as the iOS bundle ID for these apps)
5. SHA-1 certificate fingerprint: extract from the org's signing keystore:
   ```bash
   keytool -list -v -keystore ~/Documents/Claude/lovable-to-app-store/keys/{org-slug}.keystore -alias upload -storepass {keystore_password} | grep 'SHA1:'
   ```
6. Click Create → copy the **Client ID**
7. Save to memory: `google_auth.android_client_id`

**5. Add Web client credentials to Supabase:**
1. Navigate to the Supabase dashboard → Authentication → Providers → Google
2. Toggle Google to **enabled**
3. Enter:
   - **Client ID**: `{google_auth.web_client_id}` (the Web client ID from step 2)
   - **Client Secret**: `{google_auth.web_client_secret}`
4. Save
5. Ask the user to complete this step themselves if Claude cannot access the Supabase dashboard

**6. Add Web client ID to Lovable Cloud Secrets (for web fallback):**
1. In Lovable, open the Cloud Secrets / Environment Variables panel
2. Add `VITE_GOOGLE_WEB_CLIENT_ID` = `{google_auth.web_client_id}`
3. This is consumed by `src/lib/native/google-sign-in.ts` for the **web** sign-in fallback (the native iOS/Android paths read from `capacitor.config.ts` instead — see ref 07 Step 6)
4. Save to memory: note that `VITE_GOOGLE_WEB_CLIENT_ID` is set in Lovable Cloud Secrets (the value itself is the Web client ID, already in memory)

**7. Add iOS URL scheme to Info.plist** (handled in `03-capacitor-setup.md` Step 8):
The reversed iOS client ID must be added as a `CFBundleURLTypes` entry so Google can redirect back into the app after sign-in.

**8. Wire up the Edge Function and client code** — proceed to `references/07-google-native-signin.md` Steps 3 (Edge Function), 4 (capacitor.config.ts), 6 (client wrapper), 7 (Login UI). Do NOT skip these.

> **Note:** The iOS and Android client IDs do NOT go into Supabase. Only the Web client credentials go into Supabase + the Edge Function. The iOS client ID appears in `Info.plist` as a URL scheme and in `capacitor.config.ts` as `iosClientId`. The Android client ID is auto-detected by the native SDK from the package name + SHA-1 (you typically don't have to reference it in code, but save it to memory for reference).

---

## 7. Apple Sign-In (if app uses Apple Sign-In)

**URL:** https://developer.apple.com/account/resources/identifiers/list

**Goal:** Enable the App ID capability, create a Services ID, generate a Sign in with Apple key, and produce the JWT client secret needed by the Edge Function.

> ⚠️ **This is service registration only.** Native Apple Sign-In also requires `App.entitlements`, a regenerated provisioning profile, and a Supabase Edge Function — see `references/08-apple-native-signin.md` Steps 4–7 for the Edge Function code, JWT regeneration, and the client wrapper. **Do not consider sign-in done after finishing this section.**

Steps:

**1. Enable Sign in with Apple on the App ID:**
1. Navigate to https://developer.apple.com/account/resources/identifiers/list
2. Find the App ID for `{bundleId}` → Edit
3. Check **Sign in with Apple** → Save
4. **CRITICAL:** the existing provisioning profile is now "Invalid" — regenerate it (Profiles → click Invalid profile → Edit → re-select cert → Save → Download). See `references/10-build-gotchas-addendum.md` for the full UUID-update procedure.

**2. Create a Services ID (for web fallback redirect):**
1. Identifiers → "+" → **Services IDs** → Continue
2. Description: `{AppDisplayName} Sign In With Apple`
3. Identifier: `{bundleId}.signinwithapple` (e.g. `com.yourcompany.gamechime.signinwithapple`)
4. Continue → Register
5. Click the new Services ID → enable **Sign In with Apple** → Configure
6. Primary App ID: select the bundle ID's App ID
7. Domains and Subdomains: `{supabase_project_id}.supabase.co`
8. Return URLs: `https://{supabase_project_id}.supabase.co/auth/v1/callback`
9. Save → Continue → Save
10. Save to memory: `apple_auth.services_id`

**3. Create a Sign in with Apple Key:**
1. Navigate to https://developer.apple.com/account/resources/authkeys/list
2. "+" → Key Name: `{AppDisplayName} Sign In Key`
3. Check **Sign in with Apple** → Configure → Primary App ID = `{bundleId}` → Save
4. Continue → Register
5. **Download the .p8 file IMMEDIATELY** — Apple only lets you download it once
6. Save to: `~/Documents/Claude/lovable-to-app-store/keys/apple-signin-{bundle_id}.p8`
7. Note the **Key ID** (10 chars, on the download page) → save to memory: `apple_auth.key_id`

**4. Generate the JWT client secret:**
The Apple provider in Supabase needs a JWT (signed with the .p8 key) as the "client secret". JWTs expire after 6 months max. See `references/08-apple-native-signin.md` Step 2 for the generation script (Node + jsonwebtoken). Output:
- Save to memory: `apple_auth.jwt_secret_expires` (calculate as today + 6 months)
- The JWT itself is stored in Supabase + as the `APPLE_CLIENT_SECRET` Edge Function secret

**5. Configure Supabase Apple provider:**
1. Supabase dashboard → Authentication → Providers → Apple → enable
2. Client ID: `{bundleId}` (the bundle ID, NOT the Services ID — native iOS uses the bundle ID as `aud`)
3. Client Secret: the JWT from step 4
4. Save

**6. Wire up the Edge Function** — proceed to `references/08-apple-native-signin.md` Steps 4 (Edge Function), 5 (App.entitlements — copy `references/templates/App.entitlements`), 6 (client wrapper), 7 (Login UI). Do NOT skip these.
