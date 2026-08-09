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

# A throwaway store in the production layout (R13): under the repo, not
# /tmp — the repo tree is what Docker Desktop provably shares. wc-test
# mounts only its staging slice, exactly like a friend on the box; 777 so
# the container's player uid can write through the bind whatever the
# mapping.
WC_TEST_STORE="$(mktemp -d "$HERE/.localcheck-store.XXXXXX")"
mkdir -p "$WC_TEST_STORE/staging/test" "$WC_TEST_STORE/sessions"
chmod 777 "$WC_TEST_STORE" "$WC_TEST_STORE/staging" "$WC_TEST_STORE/staging/test" "$WC_TEST_STORE/sessions"
export WC_TEST_SHIP="$WC_TEST_STORE/staging/test"

compose() { docker compose -f "$HERE/compose.yaml" --profile local "$@"; }
cleanup() {
	compose down -v --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$WC_TEST_STORE"
}
trap cleanup EXIT

echo "=== up (caddy-local + wc-test + waker) ==="
compose config -q
compose up -d caddy-local wc-test waker

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

echo "=== store side: verify hashes, compact to tar.zst, prune to markers ==="
"$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only
TAR="$(find "$WC_TEST_STORE/sessions" -name '*.tar.zst' | head -1)"
[ -n "$TAR" ] || { echo "FAIL: no compacted tarball"; ls -laR "$WC_TEST_STORE"; exit 1; }
tar --zstd -tf "$TAR" | grep -q '^session.jsonl$' \
	|| { echo "FAIL: tarball misses session.jsonl"; exit 1; }
find "$WC_TEST_STORE/staging" -name session.jsonl | grep -q . \
	&& { echo "FAIL: staged data files were not pruned"; exit 1; }
find "$WC_TEST_STORE/staging" -name sealed | grep -q . \
	|| { echo "FAIL: the sealed marker did not survive compaction"; exit 1; }

echo "=== store side twice is a no-op ==="
"$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only
[ "$(find "$WC_TEST_STORE/sessions" -name '*.tar.zst' | wc -l)" = "1" ] \
	|| { echo "FAIL: a second store-sweep changed the store"; exit 1; }

echo "=== the reaper: an idle friend is stopped, and the stop seals ==="
compose up -d wc-test
for _ in $(seq 1 20); do
	compose exec -T wc-test node -e \
		'fetch("http://127.0.0.1:7681/healthz").then(()=>process.exit(0)).catch(()=>process.exit(1))' \
		>/dev/null 2>&1 && break
	sleep 0.5
done
REAP_OUT="$(COMPOSE_PROFILES=local IDLE_LIMIT=0 STORE="$WC_TEST_STORE" "$HERE/reaper.sh" wc-test)"
grep -q "stop: wc-test" <<<"$REAP_OUT" \
	|| { echo "FAIL: the reaper left the idle friend running"; echo "$REAP_OUT"; exit 1; }
compose ps --services --status running | grep -qx wc-test \
	&& { echo "FAIL: wc-test still running after the reaper"; exit 1; }

echo "=== the waker: a knock on the sleeping door wakes the friend ==="
# The reaper just put wc-test to sleep. The first knock must serve the
# waking page (second upstream) AND start the container; within a few
# knocks the real page answers again — start-on-connect, end to end.
BODY="$(curl -ks -u test:local-test-password "$DOOR/")"
grep -qi "waking" <<<"$BODY" \
	|| { echo "FAIL: a sleeping door did not serve the waking page"; echo "$BODY" | head -8; exit 1; }
WOKE=0
for _ in $(seq 1 40); do
	BODY="$(curl -ks -u test:local-test-password "$DOOR/" || true)"
	if grep -q "assets/app.js" <<<"$BODY"; then WOKE=1; break; fi
	sleep 0.5
done
[ "$WOKE" = 1 ] || { echo "FAIL: the friend never woke behind the door"; exit 1; }

echo "=== a tampered manifest is refused loudly ==="
SID2=0198cccc-dddd-7eee-8fff-000011112222
S2="$WC_TEST_STORE/staging/test/$SID2"
mkdir -p "$S2"
echo '{"type":"session","timestamp":"2026-08-09T13:00:00.000Z"}' >"$S2/session.jsonl"
printf '{"manifestVersion":1,"sessionId":"%s","player":"test","sourceSize":61,"files":{"session.jsonl":{"size":61,"sha256":"%s"}}}\n' \
	"$SID2" "0000000000000000000000000000000000000000000000000000000000000000" >"$S2/manifest.json"
echo '{}' >"$S2/sealed"
if "$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only 2>/dev/null; then
	echo "FAIL: a tampered manifest was accepted"; exit 1
fi
[ ! -e "$WC_TEST_STORE/sessions/test/$SID2.tar.zst" ] \
	|| { echo "FAIL: the tampered session was compacted anyway"; exit 1; }
[ -f "$S2/session.jsonl" ] \
	|| { echo "FAIL: the tampered staging dir was pruned"; exit 1; }

echo "=== localcheck green ==="
