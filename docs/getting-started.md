# Getting Started

> Your first ship from Lovable to TestFlight, in plain English.

This is for people who've never opened Xcode and don't intend to. The plugin is doing all the technical work — you just need to be available to provide passwords and click "approve" in browser windows.

## Before you begin (the only homework)

You need three things in place. The plugin will help with everything else.

### 1. A Lovable app on GitHub

Your Lovable project must be connected to a GitHub repo. In Lovable, this is one click — Settings → GitHub → Connect. Get the repo URL (like `https://github.com/yourname/your-app`).

### 2. An Apple Developer Program membership ($99/year)

This is Apple's tax for publishing iOS apps. Sign up at [developer.apple.com/programs](https://developer.apple.com/programs/). Approval can take 24–48 hours so do this first.

> 💡 **Side note:** TestFlight (free) lets you and up to 10,000 testers install your app via a link, without going through full App Store review. Most Lovable apps live in TestFlight for the first few months.

### 3. A Google Play Console account ($25 one-time)

Sign up at [play.google.com/console/signup](https://play.google.com/console/signup). Approval is usually instant.

> 💡 You can ship iOS first and add Android later if you want to wait on this. Just say *"skip Android for now"* when the plugin asks.

### Optional but recommended

- An [Apple device](https://www.apple.com/shop/buy-iphone) to test the TestFlight build on (iPhone, iPad, or any Mac)
- A 1024×1024 PNG icon for your app (the plugin will generate a placeholder if you don't have one yet)
- An Apple email address (the one you used for your developer account)

---

## The first ship

### Step 1 — Install the plugin

In Claude Code:
```
/plugin marketplace add Mark-Taikai/lovable-to-app-store
/plugin install lovable-to-app-store@lovable-to-app-store
```

In Cowork: open the plugin manager (Settings → Plugins → Add) and either paste the marketplace URL or drag the bundled `.plugin` zip in.

### Step 2 — Talk to Claude

> *"Ship this app to TestFlight: https://github.com/yourname/your-app"*

That's the magic phrase. Variants that also work:
- *"Get this Lovable app on TestFlight"*
- *"Turn this into a native iOS app"*
- *"Wrap this in Capacitor and submit"*

### Step 3 — Answer ~6 questions

Claude will ask you for:

1. **App display name** — what shows under the icon (e.g. *"Recipe Finder"*)
2. **Bundle ID** — Claude suggests one based on your app name (e.g. `com.yourcompany.recipefinder`)
3. **Apple Developer account email** — for the browser to log in to developer.apple.com
4. **Google Play account email** — same idea, for the Play Console
5. **Lovable URL** — your live `*.lovable.app` URL (Claude can fetch this from the repo)
6. **Native sign-in?** — *"Does the app sign users in with Google, Apple, both, or neither?"*

That's it. You'll need to provide passwords for the accounts at the moment Claude opens those browser tabs.

### Step 4 — Wait for the build

GitHub Actions takes 15–20 minutes to build and upload to TestFlight. You'll get a notification when it's ready. Then you tap the TestFlight invite on your iPhone and your Lovable app is on your home screen.

---

## After the first ship

You don't have to repeat any of the above for new versions of the same app. Just:

> *"Push an OTA update to my Recipe Finder app"*

This pushes the latest Lovable code to all installed copies of the app, **without** going through the App Store again. It usually arrives within a few minutes of the next time someone opens the app.

For new native features (camera, Face ID, push notifications):

> *"Add Face ID to Recipe Finder"*

This installs the right Capacitor plugin, wires it up, and submits a new TestFlight build.

For a brand-new second app under the same Apple Developer account, just repeat Step 2 above with the new repo URL — Claude will reuse your existing accounts and shave the registration step off.

---

## Common first-ship surprises

**"I didn't get a TestFlight email."** Sometimes Apple takes 30–60 minutes to process the build before TestFlight notifies you. Check [App Store Connect](https://appstoreconnect.apple.com) → Apps → your app → TestFlight to see the build status.

**"My build failed in CI."** Open the GitHub Actions tab in your repo and look at the failed step. Then say *"the build failed, here's the error: [paste]"* and Claude will diagnose. The most common cause for first ships is a missing or wrong Apple Team ID; the plugin double-checks for this in pre-flight, but the human-readable name vs. ID can occasionally diverge.

**"I see 'Missing Compliance' in TestFlight."** This is a one-time thing — click "Provide Export Compliance" in App Store Connect → your app → TestFlight, answer the encryption question (almost certainly "no"), and it goes away. The plugin includes the `ITSAppUsesNonExemptEncryption` Info.plist key to bypass this for future builds.

For more, see [Troubleshooting](./troubleshooting.md).

---

## Next steps

- 🎨 [Add native features](../plugins/lovable-to-app-store/skills/add-native/SKILL.md) like Face ID, camera, haptics
- 🔐 [Set up Google or Apple Sign-In](../plugins/lovable-to-app-store/skills/ship/references/07-google-native-signin.md) (the right way, with edge functions)
- 📡 [Push OTA updates](../plugins/lovable-to-app-store/skills/update/SKILL.md) when you change the app in Lovable
- 📱 [Submit to the actual App Store](https://help.apple.com/app-store-connect/#/dev067853c94) (after TestFlight testing)
