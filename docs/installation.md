# Installation

This plugin works in two Claude products. Pick the one you use.

---

## 📱 Cowork (desktop chat app — recommended for non-technical Lovable users)

The fastest path:

1. Download the plugin file from the latest release: **[lovable-to-app-store.plugin](https://github.com/Mark-Taikai/lovable-to-app-store/releases/latest/download/lovable-to-app-store.plugin)**
2. Open Cowork → **Settings → Plugins → Add plugin** (the exact menu name may vary between Cowork versions — look for something like "Add plugin", "Install plugin", or a `+` button next to "Personal plugins")
3. Drag the downloaded `.plugin` file onto the install dialog, or click "Choose file" and select it.
4. After install, the three skills (`ship`, `update`, `add-native`) become available in any Cowork conversation.

> **Why not the slash commands?** Cowork doesn't currently expose adding arbitrary GitHub marketplaces from chat — that flow only exists in the Claude Code terminal CLI. The `.plugin` file is a portable zip of the marketplace contents and works the same way in Cowork.

To update to a new version: download the latest `.plugin` file and re-install. Cowork will replace the old version.

---

## 💻 Claude Code (terminal CLI)

In your terminal, with Claude Code running:

1. Add this repo as a plugin marketplace:
   ```
   /plugin marketplace add Mark-Taikai/lovable-to-app-store
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

> **Note:** the marketplace `marketplace.json` schema is still evolving in Claude Code. If install fails, check the official [Claude Code plugin docs](https://docs.claude.com/en/docs/claude-code/plugins) for the current syntax, or download the `.plugin` file from the [latest release](https://github.com/Mark-Taikai/lovable-to-app-store/releases/latest) as a fallback.

---

## What gets installed

The plugin adds three skills to your Claude environment:

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
