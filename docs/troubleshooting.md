# Troubleshooting

The most common things that go wrong, and how to fix them. If your problem isn't here, [open an issue](https://github.com/Mark-Taikai/lovable-to-app-store/issues/new?template=bug_report.md) — we'll add it.

## Build & submission

### "My GitHub Actions build failed"

Open the failed run in GitHub. Tell Claude:
> *"The CI build for [app name] failed, here's the error: [paste the failed step]"*

Claude will diagnose using the patterns in `references/04-build-and-submit.md` and `references/10-build-gotchas-addendum.md`. Common causes:
- **`ITMS-91061: Missing Privacy Manifest (GoogleSignIn)`** — fixed in Lovable 2026-04-22. Update `@codetrix-studio/capacitor-google-auth` and re-run.
- **Provisioning profile "Invalid"** — happens after enabling a capability (e.g. Sign in with Apple). Regenerate in Apple Developer Portal. The plugin can do this automatically.
- **`PRODUCT_BUNDLE_IDENTIFIER` collision** — your repo previously shipped under a different bundle ID. Run `pod deintegrate` and re-sync.

### "TestFlight says my build is processing for 24+ hours"

Apple's processing queue is sometimes slow. If a build is "Processing" for over 4 hours, contact Apple Developer Support — there's nothing the plugin can do about it. Check [Apple System Status](https://developer.apple.com/system-status/) for ongoing incidents.

### "Apple emailed me about Missing Compliance / encryption export"

This happens once per app. In App Store Connect → your app → TestFlight → click the "Manage Compliance" button next to the build → answer "No" if your app uses only standard HTTPS (almost all Lovable apps do) → submit. Future builds skip this prompt because the plugin sets `ITSAppUsesNonExemptEncryption=false` in `Info.plist`.

## Native sign-in

### "Google sign-in drawer opens but never closes"

The reversed iOS client ID in `Info.plist` doesn't match what `capacitor.config.ts` is using. Two checks:
1. `capacitor.config.ts` must NOT have a top-level `GoogleAuth.clientId` — only `iosClientId` and `serverClientId`.
2. The reversed iOS client ID URL scheme in `Info.plist` must match the `iosClientId` exactly.

Tell Claude *"the Google sign-in drawer won't close on the [app name] iOS build"* and it'll diff your config against the canonical setup.

### "Sign-in completes but no session"

Your edge function probably isn't deployed. Run this to check:
```bash
curl -s -o /dev/null -w '%{http_code}' -X POST \
  'https://YOUR-PROJECT.supabase.co/functions/v1/google-native-signin'
```
**Expected: 400** (missing body). **If you see 404**, the function isn't deployed — ask Lovable: *"please deploy the edge functions"*.

### "Apple sign-in says invalid_client"

Three things must match:
- The Apple Services ID's primary App ID = your app's bundle ID
- Supabase's Apple provider Client ID = your bundle ID (NOT the Services ID)
- The JWT client secret in Supabase must be signed with `sub = bundle ID`

If these don't match, regenerate per `references/08-apple-native-signin.md` Step 2.

## Memory & state

### "The plugin asked me a question it should already know the answer to"

Memory files live in `~/Documents/Claude/lovable-to-app-store/memory/`. If a file got deleted or never saved, the plugin re-asks. Tell Claude *"check what's in memory for [app name] and rebuild any missing files"*.

### "I deleted my keystore"

If you've already shipped to Google Play with the deleted keystore, you have a problem — Google does not allow keystore replacement for an existing app. Your options:
1. Restore from your password manager / encrypted backup (you did make one, right?)
2. If it's truly gone, contact [Google Play developer support](https://support.google.com/googleplay/android-developer/contact/keylost) — in some cases they can reset.
3. Last resort: ship under a new bundle ID, ask users to migrate.

This is why the plugin's keystore guidance includes *"back up to a password manager IMMEDIATELY after creation."*

## OTA updates

### "I pushed an OTA update but users still see the old version"

A few things can cause this:
1. **Capgo channel mismatch** — the install is on a different channel than you deployed to. Check the Capgo dashboard.
2. **Update threshold** — Capgo defaults to deferred updates (apply on next app launch, not immediately). Force-quit the app to test.
3. **Edge function changes need separate deployment** — if your Lovable change touched `supabase/functions/`, OTA via Capgo doesn't deploy edge functions. Ask Lovable to deploy them.

### "Lovable doesn't auto-deploy edge functions"

This is a Lovable platform limitation, not the plugin. After every Lovable change to `supabase/functions/*`, you must explicitly tell Lovable: *"please deploy the edge functions"*. Verify with the `curl` check above (expect 400, not 404).

## Other

### "Where do I see what the plugin actually did?"

`~/Documents/Claude/lovable-to-app-store/memory/apps/{your-bundle-id}.json` is a complete record of every ID, key, and setting. If something seems off, that file is the source of truth.

### "I want to start over from scratch on an app"

Delete the app's memory file at `~/Documents/Claude/lovable-to-app-store/memory/apps/{bundle-id}.json`, delete the GitHub Actions secrets in your repo (Settings → Secrets and variables → Actions), and delete the iOS folder from your repo if you want a totally clean Capacitor regeneration. Then re-run *"ship this app"*.
