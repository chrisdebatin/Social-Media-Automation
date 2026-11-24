#!/bin/bash
# Smoke test for basic auth against a production build: npm run build && bash scripts/smoke-auth.sh
cd "$(dirname "$0")/.."
APP_PASSWORD=geheim npx next start -p 3124 >/tmp/ps1.log 2>&1 &
npx next start -p 3125 >/tmp/ps2.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3124 && curl -s -o /dev/null localhost:3125 && break; sleep 1; done
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "no auth:                  $(code localhost:3124/)"
echo "wrong password:           $(code -u x:falsch localhost:3124/api/status)"
echo "right password:           $(code -u team:geheim localhost:3124/api/status)"
BODY='{"slide":{"id":"x","template":"cta","headline":"Hallo","button":"Los"},"index":0,"total":1}'
echo "render with password:     $(code -u team:geheim -X POST localhost:3124/api/render -H 'content-type: application/json' -d "$BODY")"
echo "prod without APP_PASSWORD: $(code localhost:3125/)"
pkill -f "next start -p 312[45]"
