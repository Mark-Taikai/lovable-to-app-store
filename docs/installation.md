# Installation

This plugin works in two environments. Pick the one you use.

## Claude Code (terminal-based)

1. Add this repo as a plugin marketplace:
   ```
   /plugin marketplace add YOUR-GITHUB-USERNAME/lovable-to-app-store
   ```
2. Install the plugin from the marketplace:
   ```
   /plugin install lovable-to-app-store@lovable-to-app-store
   ```
3. Verify by listing your plugins:
   ```
   /plugin list
   ```
   You should see `lovable-to-app-store v1.1.0` in the output.

To update later when a new version ships:
```
/plugin update lovable-to-app-store@lovable-to-app-store
```

## Cowork (desktop chat)

1. Open the Cowork settings → Plugins.
2. Add this marketplace by URL — paste `https://github.com/YOUR-GITHUB-USERNAME/lovable-to-app-store`.
3. Find `lovable-to-app-store` in the marketplace list and click Install.

Or, for a one-off install without the marketplace:
1. Download the latest `.plugin` zip from the [Releases page](https://github.com/YOUR-GITHUB-USERNAME/lovable-to-app-store/releases).
2. Drag it into the Cowork plugin install UI.

> **Note:** the marketplace `marketplace.json` schema is still evolving in Claude / Cowork. If install fails, check the official [Claude Code plugin docs](https://docs.claude.com/en/docs/claude-code/plugins) for the current syntax.

## What gets installed

The plugin adds three skills to your environment:

- `lovable-to-app-store:ship` — first-time app submission
- `lovable-to-app-store:update` — OTA updates after Lovable changes
- `lovable-to-app-store:add-native` — add native Capacitor features

It also creates `~/Documents/Claude/lovable-to-app-store/memory/` for persistent state (Apple Team IDs, RevenueCat keys, OneSignal IDs etc.). Nothing leaves your machine.

## What does NOT get installed

The plugin does NOT install:

- Xcode, Android Studio, or any SDK (the build runs on GitHub Actions)
- Node.js or any global packages (those go into your individual app repos as needed)
- Any browser extensions
- Anything that connects to the internet on its own — the plugin is dormant until you trigger it
