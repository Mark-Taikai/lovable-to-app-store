# FAQ

The questions most Lovable users actually ask, with honest answers.

## Money

### How much does this cost to run?

The plugin itself is free (MIT). The accounts it uses:

| Service | Cost | What you get free |
|---|---|---|
| Apple Developer Program | **$99/year** | Required for any iOS publishing |
| Google Play Console | **$25 one-time** | Required for any Android publishing |
| RevenueCat | Free up to $2.5k/mo MTR | In-app purchases / subscriptions |
| OneSignal | Free up to 10k subs | Push notifications |
| Capgo | Free tier available | OTA updates |
| Supabase | Free tier | Edge Functions for native sign-in (only if used) |

So your floor is $99/year + $25 once = **$124 to publish on both stores forever**, assuming a small audience. For most Lovable apps that's the total cost for the first year.

### Can I just ship to one platform?

Yes. Tell Claude *"only iOS for now, skip Android"* (or vice versa) when running the ship skill.

### Can I publish without RevenueCat / OneSignal / Capgo?

Yes — you can answer "skip" or "don't add" when the plugin asks about each. The plugin will just leave those out of the SDK init code. You can always add them later via the `add-native` skill.

## Process

### How long does the first ship take?

About 30–60 minutes of active time, plus 15–20 minutes of waiting for CI. Most of that is browser navigation through Apple Developer Portal and Google Play Console — the plugin drives the browser; you click approve.

### How long do subsequent ships take?

For a new app under the same Apple Developer account: ~15 minutes (the registration steps are skipped because your account already exists).

For OTA updates to an existing app: under 5 minutes, end to end.

### Will the plugin actually look like Apple's website / Google's website?

Yes — it uses your real browser session via Cowork's Chrome MCP integration to click through the real Apple Developer Portal, App Store Connect, Google Play Console, etc. You'll see exactly what you'd see if you were doing it manually, except Claude is filling in the forms.

### Do I need a Mac?

**No** — the plugin uses GitHub Actions with macOS runners for the iOS build, so you can run on Linux, Windows, or any other OS. You only need a Mac if you want to build locally instead of in CI.

### Do I need to know Capacitor?

No. The plugin handles all Capacitor configuration. You'll see Capacitor files appear in your repo (`capacitor.config.ts`, `ios/`, `android/`) but you don't need to edit them by hand.

## Quality

### Will my app feel "native"?

It loads from your live Lovable URL and runs in a WebView. So:
- ✅ Looks and animates like a native app (you control all the visuals).
- ✅ Has access to native iOS/Android APIs through Capacitor plugins (camera, Face ID, push, etc.).
- ✅ Updates instantly via OTA (the WebView re-fetches from your Lovable URL).
- ⚠️ If your Lovable app feels webby (form fields that look like browser fields, pull-to-refresh, etc.), the wrapped version will feel webby too. The plugin doesn't fix UX issues — it ships what you built.

For most non-game Lovable apps, users won't be able to tell it's a webview.

### Will Apple reject my app?

The plugin handles every common Apple rejection cause for Capacitor / WebView apps:
- ✅ The 1024×1024 icon "Any Appearance" rejection
- ✅ Missing privacy manifest (ITMS-91061) for GoogleSignIn
- ✅ Missing location usage descriptions (ITMS-90683)
- ✅ Missing encryption compliance dialog
- ✅ App Transport Security violations

Apple may still reject for content/UX reasons — that's on you. The most common are: 
- "App appears to be a website wrapper" — fix by ensuring your app has functionality beyond what's on a public URL (login, personalized content, native features).
- "Insufficient functionality" — add some local interactivity beyond just displaying remote content.
- Adult / regulated content without proper age gating.

### Can I customize what the plugin does?

Yes. Either fork the repo and modify the skills directly, or override individual reference docs in your own copy. Each `.md` file under `skills/ship/references/` is a self-contained set of instructions you can swap.

## Edge cases

### What if my Supabase isn't managed by Lovable?

If you have direct Supabase dashboard access (Authorized Client IDs), you don't need the edge function trick — you can configure native sign-in the conventional way. The plugin will still work but Step 3 of refs 07/08 (the edge function creation) becomes optional. Tell Claude *"my Supabase is self-managed, skip the edge function step"*.

### What if I'm not using Supabase at all?

You can skip the entire native sign-in branch. Answer "Neither" to the upfront sign-in question. The plugin will ship a working iOS/Android app without any auth setup.

### Can I use this with apps that aren't from Lovable?

Yes — the plugin doesn't actually require Lovable. It works with any web app that:
- Has a public URL (the WebView's `server.url`)
- Lives in a GitHub repo
- Builds with `npm run build` to produce a `dist/` folder

You'd just answer "yes" to the upfront URL question with whatever your live URL is.

### What's the relationship between this plugin and Capgo / Lovable / Anthropic?

None of them officially. This is a community plugin. Capgo is a third-party OTA service; Lovable is a third-party app builder; Anthropic makes Claude. The plugin orchestrates them but isn't endorsed by any of the three.

## Help

### How do I get help?

1. Read the [Troubleshooting](./troubleshooting.md) guide.
2. Search [closed issues](https://github.com/Mark-Taikai/lovable-to-app-store/issues?q=is%3Aissue+is%3Aclosed) — your problem is probably there.
3. [Open a new issue](https://github.com/Mark-Taikai/lovable-to-app-store/issues/new) with the bug report template, including the exact error message and what you said to Claude.

### How do I report a security issue?

See [SECURITY.md](../SECURITY.md). Don't open a public issue for security problems — email instead.
