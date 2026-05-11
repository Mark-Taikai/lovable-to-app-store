# 13 — TanStack Start (the newer Lovable architecture)

> **Read this BEFORE touching a TanStack Start app's Capacitor setup.** The v2.0 bundled-dist templates were written for Vite SPAs. TanStack Start apps need different config — same end goal (a static bundle inside the IPA), different build invocation.

This reference is consulted from `ship/SKILL.md` Step 1 when the architecture detection returns `tanstack-start` or `tanstack-cloudflare`.

---

## 🚫 The single most important rule on this page

**Do NOT fall back to the v1.x `server.url` + WebView OAuth pattern**, no matter how complicated the TanStack Start build gets. See the "HARD RULE" section in `ship/SKILL.md`. Summary:

- Apple Guideline 4.2 rejects WebView-wrapper apps.
- Native Google/Apple Sign-In **does not work** inside a `server.url` WebView. OAuth redirects open Safari, the user authenticates there, and the app's WebView stays logged out. The edge-function flow in refs 07 + 08 is the only working path — it was developed because the WebView path was broken.
- "`window.location.origin` redirects make it work inside the WebView" — **NO**. The session lands in Safari's cookie jar, not the WebView's. Looks fine on the first sign-in screen; user is logged out by the time they return to the app.

If you can't get a TanStack Start app to static-export cleanly, STOP and surface the problem to the user. The acceptable resolutions are: refactor server-only code to client fetches, defer native sign-in, or pause the ship — NOT regress to WebView OAuth.

---

---

## How a TanStack Start Lovable app differs from a Vite SPA Lovable app

| | Vite SPA (older) | TanStack Start (newer) |
|---|---|---|
| **Entry** | `src/main.tsx` mounts a React tree into `index.html`'s `#root` | File-based routes in `src/routes/__root.tsx`, `src/routes/index.tsx`, etc. |
| **Routing** | React Router or none | TanStack Router (file-based) |
| **Build tool** | Vite | Vinxi (built on Nitro) or Vite, depending on preset |
| **Output** | `dist/` containing `index.html` + chunks | Default: server bundle for Cloudflare Workers. Static SPA output requires explicit config. |
| **Deployment** | Lovable host or any static host | Cloudflare Workers (Lovable's new default) |
| **Auth** | Supabase JS direct or `@supabase/supabase-js` | `@lovable.dev/cloud-auth-js` (a Lovable-managed wrapper) |
| **Server code** | None (pure client) | Server-only routes possible (`.server.ts`), API handlers under `routes/api/...` |

**The big issue for Capacitor:** TanStack Start's default build emits a Cloudflare Workers bundle, not a static SPA. A Capacitor IPA needs static HTML/JS to bundle. We have to coerce TanStack into a SPA build.

---

## Step 1: Detect server-only code (will it run in a WebView?)

Server-side rendering (SSR) and server-only routes only work when there's a server. A native app's WebView is the client — no server runs locally.

```bash
# Find server-only code in the repo
grep -rln "createServerFn\|createServerRoute\|defineEventHandler\|\.server\.\|use server" src/ 2>/dev/null
```

Categorize the results:

- **Server functions called from client components via TanStack RPC** — these *will* work in the native app IF the production Cloudflare URL is reachable. The native app's WebView is local HTML/JS calling out to the deployed server endpoints over HTTPS. Treat these like any external API call. ✅ no changes needed.
- **API route handlers (`routes/api/*.ts`)** — same. Stay deployed at Cloudflare; native app calls them over HTTPS. ✅ no changes needed.
- **SSR-only code that has no client equivalent** (e.g. loaders that read env vars at server time and embed in the rendered HTML) — **❌ this will break**. The bundled HTML in the IPA was rendered at *build time*, not at the user's request, so server-time values are baked in once and stale forever. Have to refactor to client fetches, or accept the stale values.

If the app has SSR-only code, surface it to the user:
> *"I found server-only code at `{file}`. In a native app, this code won't re-run per-user — the values get baked into the bundle at build time. Two options: (a) refactor to a client fetch that hits your deployed Cloudflare endpoint, or (b) accept the values frozen at build time. Which? I can do (a) for you."*

---

## Step 2: Add a SPA build preset

We need a build that emits static HTML + JS to `dist/` (or whatever output dir Capacitor reads via `webDir`).

### 2a. If the app uses Vinxi (most TanStack Start apps)

Add to `app.config.ts`:

```typescript
import { defineConfig } from "@tanstack/start/config";

export default defineConfig({
  server: {
    preset: "static",                    // emit static files instead of CF Worker bundle
    static: true,
  },
  vite: {
    plugins: [/* existing plugins */],
  },
});
```

Then the build command becomes:

```bash
vinxi build --preset static
```

Output: `.output/public/` — that becomes our `webDir` for Capacitor.

### 2b. If the app uses Vite directly (some TanStack configs)

Add a separate Vite config for the native build at `vite.config.native.ts`:

```typescript
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, defineConfig({
  build: {
    outDir: "dist-native",
    rollupOptions: {
      // Force SPA: single index.html, no SSR manifest
      input: "index.html",
    },
  },
  ssr: false,
  define: {
    // Bake build-time env vars the client needs
    "import.meta.env.VITE_LOVABLE_API_URL": JSON.stringify(process.env.LOVABLE_API_URL ?? ""),
  },
}));
```

Build command:

```bash
vite build --config vite.config.native.ts
```

Output: `dist-native/` — point Capacitor's `webDir` there.

### 2c. Detect which preset the repo uses

```bash
grep -l "vinxi" package.json && echo "vinxi" || echo "vite-direct"
```

---

## Step 3: Capacitor config differences

In `capacitor.config.ts`, the only change vs. the Vite SPA template is the `webDir`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '{{BUNDLE_ID}}',
  appName: '{{APP_DISPLAY_NAME}}',
  webDir: '.output/public',  // ← vinxi preset; OR 'dist-native' for vite-direct
  // No `server:` block — bundled-dist architecture
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#ffffff',
    },
    StatusBar: { style: 'Default' }
  }
};

export default config;
```

Everything else (Splash, native SDK initialization, OTA via Capacitor Updater) is identical to the Vite SPA path — copy from `references/templates/capacitor.config.ts` with the `webDir` change.

---

## Step 4: Handle `@lovable.dev/cloud-auth-js`

TanStack Start Lovable apps use `@lovable.dev/cloud-auth-js` instead of `@supabase/supabase-js` directly. The native sign-in flow still works, but the wiring is different.

### 4a. The auth client is already wrapped

`@lovable.dev/cloud-auth-js` exposes a typed client similar to Supabase's. The `signInWithIdToken` method exists — it's what you'll call from the native Google/Apple sign-in code.

Check the package version:
```bash
cat package.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('dependencies', {}).get('@lovable.dev/cloud-auth-js', 'not installed'))"
```

If version `< 1.0.0`: native sign-in support may be incomplete. Surface a warning to the user and offer to skip native sign-in for the first ship.

### 4b. Wire up the native sign-in handlers

In `src/lib/native/google-sign-in.ts`, the only change vs. the standard ref-07 wrapper is the import:

```typescript
// OLD (Vite + supabase-js):
import { supabase } from '@/integrations/supabase/client';

// NEW (TanStack + lovable-cloud):
import { cloudAuth } from '@/integrations/lovable-cloud/client';
// (or whatever the user's project names it — Lovable's default is /lib/cloud.ts)
```

The rest of the code (server auth code exchange via `supabase.functions.invoke('google-native-signin', ...)`) becomes a `cloudAuth.functions.invoke(...)` call. Refer to ref-07 for the underlying architecture; just swap the client.

Same logic for Apple Sign-In in ref-08.

### 4c. Edge function deployment

Lovable Cloud also doesn't auto-deploy edge functions (same as Lovable on Supabase). After creating `google-native-signin` or `apple-native-signin` edge functions in the repo, ask Lovable explicitly: *"Please deploy the edge functions"*. Verify with `curl`:

```bash
curl -s -o /dev/null -w '%{http_code}' -X POST \
  "https://YOUR-PROJECT.cloud.lovable.dev/functions/v1/google-native-signin"
# Expect 400 (no body), NOT 404
```

---

## Step 5: Test the static build before Capacitor sync

After applying the SPA preset:

```bash
# vinxi preset
vinxi build --preset static
ls -la .output/public/index.html

# OR vite-direct preset
vite build --config vite.config.native.ts
ls -la dist-native/index.html
```

Confirm:
- `index.html` exists at the expected path
- `assets/` (or `_build/`) folder with chunked JS exists
- No `.server.js` or `entry.server.tsx` artifacts in the output (those are SSR artifacts and won't run in a WebView)

Then run `npx cap sync ios` — it copies the static bundle into `ios/App/App/public/` (Capacitor's bundled-asset location).

---

## Step 6: Test in the iOS Simulator before submitting

Don't go straight to TestFlight. A working CF Worker deploy does NOT mean the static SPA build works.

```bash
npx cap open ios
# In Xcode: pick "iPhone 16" simulator → Cmd+R → run
```

Verify:
- ✅ App launches without a blank screen
- ✅ Routes navigate correctly (no 404s on internal links)
- ✅ Auth flow works (login → see authenticated content)
- ✅ Anything that calls a server endpoint actually hits the deployed Cloudflare URL

If any of those fail, the static build is missing something the SSR build had. Common fixes:
- Add the production Cloudflare URL as `VITE_API_BASE_URL` (or your project's equivalent env var) so client fetches know where to go
- Replace server loaders with `useQuery`-style client fetches
- Add a redirect handler for the SPA fallback (so deep links don't 404)

---

## Step 7: Beyond Capacitor — push state back to memory

Save the TanStack-specific facts to the app's memory file under the existing structure, plus:

```json
{
  "...existing fields": "...",
  "architecture": "tanstack-cloudflare",
  "tanstack": {
    "build_preset": "vinxi-static",
    "webDir": ".output/public",
    "build_command": "vinxi build --preset static",
    "cloudflare_worker_url": "https://app-name.your-account.workers.dev",
    "cloud_auth_lib": "@lovable.dev/cloud-auth-js",
    "uses_server_functions": true
  }
}
```

This lets subsequent `update` and `add-native` runs skip re-detection.

---

## Common failures specific to TanStack Start

| Symptom | Cause | Fix |
|---|---|---|
| White screen on iOS launch, no console errors | `webDir` points at the wrong output folder | Verify `ls -la ios/App/App/public/index.html` exists; re-run `npx cap sync` |
| Routes work in dev but 404 in TestFlight | Static export didn't include the route manifest | Run `vinxi build --preset static` and inspect `.output/public/_build/` for the manifest |
| `cloudAuth.signInWithIdToken` returns "invalid token" | Edge function for native sign-in not deployed in Lovable Cloud | Ask Lovable to deploy; verify with curl (expect 400) |
| Build succeeds but auth doesn't persist across app launches | Capacitor's default WebView treats localStorage as ephemeral on iOS in some configs | Add `WKWebView.shouldAllowUniversalAccessInMemoryStorage = true` via a Capacitor plugin, OR use the SecureStorage Capacitor plugin for tokens |
| `Module not found: @tanstack/start/config` | Build trying to load TanStack server config inside the static build | Confirm `preset: "static"` is set; if vinxi still references server entry, set `ssr: false` explicitly |

---

## Migration path: Vite SPA → TanStack Start

If an app was originally shipped via this plugin under the v1.x or early v2.x flow (Vite SPA) and Lovable has since migrated it to TanStack Start, see `12-migration-guide.md` for the upgrade path. Short version: detect the new architecture during the next `update` run, rewrite `capacitor.config.ts` and build command, re-bundle, push as a new OTA bundle. Users who installed the v1 IPA will need to update from the App Store (the native shell changed) but the app code itself transitions cleanly.
