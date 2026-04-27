#!/bin/bash
# Rebuild the .plugin file from this source tree.
# Usage:  bash lovable-to-app-store-src/build.sh
# Output: ../lovable-to-app-store.plugin (overwritten in place)
set -e
cd "$(dirname "$0")"
OUT="../lovable-to-app-store.plugin"
TMP="/tmp/lovable-to-app-store.build.$$.plugin"

rm -f "$TMP"
zip -r -X "$TMP" . -x ".DS_Store" -x "*/.DS_Store" -x "build.sh" > /dev/null

cat "$TMP" > "$OUT"
rm -f "$TMP"

echo "Built $OUT"
python3 -c "import json; m=json.load(open('.claude-plugin/plugin.json')); print(f'  Manifest: {m[\"name\"]} v{m[\"version\"]}')"
echo "  Size:     $(du -h "$OUT" | cut -f1)"
echo "  Files:    $(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
