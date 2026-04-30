// PRODUCTION VITE CONFIG — for `vite build --config vite.config.prod.ts`
//
// Why this exists separately from `vite.config.ts`:
//
//   1. `lovable-tagger` (used by Lovable for in-editor inspection) imports
//      `tailwindcss/resolveConfig.js` at module load time. On iCloud-synced
//      project directories this triggers a PostCSS / Tailwind config scan
//      that hangs forever. The dev config keeps lovable-tagger; this prod
//      config omits it so production builds don't hang.
//
//   2. `vite-plugin-pwa` runs PostCSS in a post-build phase to generate
//      the service worker. That post-build phase ETIMEDOUTs on iCloud-
//      synced projects. Service workers also don't apply inside a
//      Capacitor native shell (the WebView ignores them) — they only
//      matter for the web/PWA version. Skip the plugin entirely.
//
//   3. Capacitor native scheme (capacitor://localhost) doesn't tolerate
//      `crossorigin` attributes on local script tags as well as some
//      remote-URL setups. Strip them.
//
// Use it with:
//   NODE_OPTIONS=--max-old-space-size=2048 \
//     node_modules/.bin/vite build --config vite.config.prod.ts

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

/**
 * Strip the `crossorigin` attribute from local asset references in
 * index.html. With the Capacitor `capacitor://` scheme handler, the
 * crossorigin attribute on bundled scripts can produce CORS errors that
 * abort the script load — leaving a black screen with no logs. The
 * attribute is unnecessary for assets served by our own scheme handler.
 */
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  // Drop console.* and debugger statements from production builds.
  esbuild: { drop: ['console', 'debugger'] },
  build: {
    rollupOptions: {
      output: {
        // Manual chunking keeps the main bundle small + cacheable.
        // Add other large deps (charts, PDF, etc.) as your app grows.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [react(), stripCrossorigin()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
