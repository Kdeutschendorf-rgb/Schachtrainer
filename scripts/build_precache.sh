#!/bin/sh
# Schreibt app/precache.json (alle Dateien, die offline verfügbar sein sollen).
# Optional: VERSION als erstes Argument, wird in app/sw.js eingetragen (beim Veröffentlichen die Commit-ID).
cd "$(dirname "$0")/../app" || exit 1
find . -type f ! -name '.*' ! -name 'sw.js' ! -name 'precache.json' | sed 's|^\./||' | sort |
  python3 -c 'import json,sys; print(json.dumps(["./"] + [l.strip() for l in sys.stdin]))' > precache.json
if [ -n "$1" ]; then sed -i.bak "s/^const VERSION = .*/const VERSION = '$1';/" sw.js && rm -f sw.js.bak; fi
echo "precache.json: $(python3 -c 'import json; print(len(json.load(open("precache.json"))))') Dateien"
