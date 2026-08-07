#!/usr/bin/env bash
# The host stack's end-to-end check, run on the dev machine: the production
# shapes (TLS, secret path, basic auth, WebSocket proxy, hardened friend
# container) against the local image, self-signed. Proves 02 item 1's
# config actually carries the game before any of it touches the VPS.
#
#   deploy/host/localcheck.sh          # expects world-console:latest built
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DOOR="https://localhost:8443/f/localtest00000000000000000000"

compose() { docker compose -f "$HERE/compose.yaml" --profile local "$@"; }
cleanup() { compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "=== up (caddy-local + wc-test) ==="
compose config -q
compose up -d caddy-local wc-test

echo "=== door: wrong password is refused ==="
for _ in $(seq 1 20); do
	CODE="$(curl -ks -o /dev/null -w '%{http_code}' "$DOOR/" || true)"
	[ "$CODE" != "000" ] && break
	sleep 0.5
done
[ "$CODE" = "401" ] || { echo "FAIL: expected 401 without auth, got $CODE"; exit 1; }
CODE="$(curl -ks -o /dev/null -w '%{http_code}' -u test:wrong "$DOOR/")"
[ "$CODE" = "401" ] || { echo "FAIL: expected 401 with wrong password, got $CODE"; exit 1; }

echo "=== door: the right pair opens the page ==="
CODE="$(curl -ks -o /dev/null -w '%{http_code}' -u test:local-test-password "$DOOR/")"
[ "$CODE" = "200" ] || { echo "FAIL: expected 200 with auth, got $CODE"; exit 1; }

echo "=== no directory of doors: unmatched paths say nothing ==="
CODE="$(curl -ks -o /dev/null -w '%{http_code}' "https://localhost:8443/")"
[ "$CODE" = "404" ] || { echo "FAIL: expected 404 at /, got $CODE"; exit 1; }

echo "=== the game streams through the proxied WebSocket ==="
NODE_TLS_REJECT_UNAUTHORIZED=0 WS_PROBE_AUTH="test:local-test-password" \
	node "$HERE/../image/ws-probe.mjs" "$DOOR"

echo "=== localcheck green ==="
