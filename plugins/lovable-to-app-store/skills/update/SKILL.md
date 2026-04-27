---
name: update
description: >
  Push an OTA update to a published app after making changes in Lovable. Pulls the
  latest code, builds, and deploys via Capgo so installed apps update silently without
  a new App Store submission. Triggered by: "update [app name]", "push update for
  [app]", "deploy latest Lovable changes", "push OTA", "sync latest changes to the app",
  "publish new version", "the app needs an update".
tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Push an OTA Update

Pull the latest Lovable changes and push them to installed apps via Capgo — no App Store submission needed for JS/CSS/asset changes.

## When OTA Updates Work (and When They Don't)

**OTA updates work for:**
- Any change made in Lovable (UI, logic, copy, styling)
- Bug fixes that don't require new native APIs
- New screens, features built with existing web technologies

**OTA updates DO NOT work for:**
- Adding new Capacitor native plugins
- Changes to iOS/Android native code
- App icon or splash screen changes
- Changing the bundle ID or app name

If the user asks to add a new native feature, redirect to the `add-native` skill instead.

## Workflow

### Step 1: Load app memory

```bash
# Find the app in memory by name or bundle ID
ls ~/Documents/Claude/lovable-to-app-store/memory/apps/
```

If the user says "update Acme Tracker", search memory files for `app_name` matching "Acme Tracker". Load the memory file.

Required from memory:
- `github_repo`
- `capgo.api_key`
- `capgo.app_id`
- `capgo.channel`

If memory file not found, ask: "Which app do you want to update? (Provide the GitHub URL or app name)"

### Step 2: Pull latest code

```bash
# Check if repo is already cloned
if [ -d "/tmp/lovable-to-app-store/{repo-name}" ]; then
  cd /tmp/lovable-to-app-store/{repo-name}
  git pull origin main
else
  git clone {github_repo} /tmp/lovable-to-app-store/{repo-name} --depth=1
  cd /tmp/lovable-to-app-store/{repo-name}
fi
```

### Step 2.5: Check for Supabase Edge Function changes

```bash
cd /tmp/lovable-to-app-store/{repo-name}
git diff HEAD~1..HEAD --name-only | grep '^supabase/functions/' || echo "no edge function changes"
```

**If there are changes under `supabase/functions/`:** Lovable does **not** auto-deploy edge functions when you push to GitHub or pull changes into Lovable. You must explicitly tell Lovable: *"Please deploy the edge functions"*. Until that happens, the live app will continue running the old function code (or 404 if the function is brand new).

For each changed function, verify deployment after Lovable confirms:
```bash
curl -s -o /dev/null -w '%{http_code}' -X POST \
  'https://{supabase_ref}.supabase.co/functions/v1/{function_name}'
# Expect 400 (bad request — no body) NOT 404 (function not deployed)
```

A 404 means the function wasn't deployed — ask Lovable again. Common cases this matters for: `google-native-signin`, `apple-native-signin` (Step 6/Step 9 of refs 07/08 in the `ship` skill).

OTA updates pushed via Capgo **only update the WebView bundle** — they cannot deploy edge functions.

### Step 3: Install dependencies and build

```bash
cd /tmp/lovable-to-app-store/{repo-name}
npm install
npm run build
npx cap sync
```

### Step 4: Push update via Capgo

```bash
# Install Capgo CLI if not present
npm install -g @capgo/cli

# Deploy update to the production channel
npx @capgo/cli bundle upload \
  --apikey {capgo.api_key} \
  --bundle-id {bundle_id} \
  --channel {capgo.channel}
```

### Step 5: Confirm and summarize

After successful push:
```
✅ OTA update pushed for {AppName}

Installed apps will receive the update within a few minutes.
Users don't need to do anything — it happens automatically.

Channel: {capgo.channel}
Bundle: {version from package.json}
```

Update `build.last_build_date` in the memory file.

## If the Build Fails

Read the error and attempt to fix it. Common issues:
- TypeScript errors after Lovable changes: fix types and retry
- Missing dependencies: run `npm install` and retry
- Build script changed: check `package.json` scripts

If still failing after 2 attempts, report the error to the user and suggest they check the Lovable build logs first.

## Major Version Updates (New App Store Build Required)

If the user says "I added a new feature that needs a camera" or similar native capability, tell them:
- OTA updates can't add new native plugins
- Use the `add-native` skill to add the capability and rebuild
- A new TestFlight/Play Store submission will be required
