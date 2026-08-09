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

# wc-test's staging slice of a throwaway store (R13): under the repo, not
# /tmp — the repo tree is what Docker Desktop provably shares. 777 so the
# container's player uid can write through the bind whatever the mapping.
export WC_TEST_SHIP="$(mktemp -d "$HERE/.localcheck-ship.XXXXXX")"
chmod 777 "$WC_TEST_SHIP"

compose() { docker compose -f "$HERE/compose.yaml" --profile local "$@"; }
cleanup() {
	compose down -v --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$WC_TEST_SHIP"
}
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

echo "=== the whole page carries through the door (prefix strip, auth, TLS) ==="
# appserver-probe walks page + health + pane APIs + the PTY stream — every
# client URL is relative, and THIS is where that promise is proven: behind
# /f/<token>/ with basic auth over self-signed TLS, exactly like a friend.
NODE_TLS_REJECT_UNAUTHORIZED=0 WS_PROBE_AUTH="test:local-test-password" \
	node "$HERE/../image/appserver-probe.mjs" "$DOOR"

echo "=== a stop is a seal: a session in the live volumes reaches the store (R13) ==="
# localcheck runs KEYLESS by design — pi cannot finish a turn, so it never
# writes a real session here (the box's end-to-end receipt proves that
# half). Fabricate one in the live volumes instead — same fixture shape as
# verify leg 5 — and let the real seam do the rest: compose stop → SIGTERM
# → pi's hangup → the seal lands in wc-test's staging slice.
compose exec -T wc-test sh <<'FIXTURE'
set -e
SID=0198bbbb-cccc-7ddd-8eee-ffff00001111
SDIR=/home/player/.pi/agent/sessions/--home-player-game--
STORY=/home/player/game/data/world/localcheck-world/$SID
mkdir -p "$SDIR" "$STORY"
{
	echo '{"type":"session","version":3,"timestamp":"2026-08-09T12:00:00.000Z","cwd":"/home/player/game"}'
	echo '{"type":"message","timestamp":"2026-08-09T12:00:10.000Z","message":{"role":"user","content":"through the door"}}'
} > "$SDIR/2026-08-09T12-00-00_$SID.jsonl"
echo '# quests' > "$STORY/quests.md"
FIXTURE
compose stop wc-test
find "$WC_TEST_SHIP" -name sealed | grep -q . \
	|| { echo "FAIL: no sealed session in the store after stop"; ls -laR "$WC_TEST_SHIP"; exit 1; }
MANIFEST="$(find "$WC_TEST_SHIP" -name manifest.json | head -1)"
grep -q '"player": "test"' "$MANIFEST" \
	|| { echo "FAIL: manifest does not name the player"; cat "$MANIFEST"; exit 1; }

echo "=== the one-shot sweep (the host's seam) finds nothing left to do ==="
SWEEP_OUT="$(compose run --rm --no-deps -T --entrypoint "node /opt/appserver/shipper.js sweep" wc-test)"
echo "$SWEEP_OUT" | grep -q '"copied":0' && echo "$SWEEP_OUT" | grep -q '"sealed":0' \
	|| { echo "FAIL: re-sweep of a sealed store was not a no-op"; echo "$SWEEP_OUT"; exit 1; }

echo "=== localcheck green ==="
