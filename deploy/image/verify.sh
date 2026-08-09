#!/usr/bin/env bash
# In-container verification — 02 item 3's automatable parts plus the app
# server's own probes (02 item 5), run in the PRODUCTION shape: read-only
# root, tmpfs for /tmp, ~/.pi/agent and data/.
#
#   deploy/image/verify.sh [image]      # default world-console:latest
#
# Four legs:
#   1. the unit gate inside the container — engine logic plus all three
#      scrying lenses against live Wikipedia/Commons (proves the image's
#      network path and CA ground),
#   2. the pseudo-TTY probe inside the container — the TUI's dress renders
#      under a real PTY exactly as the local recipe checks it,
#   3. the app server from the host — page, health, the pane APIs (tree,
#      file, refused traversal, events hello, a timed watcher push) and the
#      same PTY stream a browser would receive over /ws/term
#      (appserver-probe.mjs),
#   4. the ttyd FALLBACK bridge — R14 keeps it aboard; a fallback that
#      rotted silently is no fallback (ws-probe.mjs).
# What this cannot prove: how the dress LOOKS in a real browser — that
# eyeball check happens at first deploy and with each friend's first sitting.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IMG="${1:-world-console:latest}"

HARDEN=(--read-only
	--tmpfs /tmp:rw,uid=1001,gid=1001
	--tmpfs /home/player/.pi/agent:rw,uid=1001,gid=1001
	--tmpfs /home/player/game/data:rw,uid=1001,gid=1001)

CID=""
cleanup() { [ -n "$CID" ] && docker stop -t 2 "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# The host-side probe legs need a node. The dev machine has one; the box
# deliberately has only docker/compose/git — there, the image under test
# lends its own (host network so 127.0.0.1:<published port> resolves; the
# DOCKER-USER egress block guards the bridge, loopback is untouched).
if command -v node >/dev/null 2>&1; then
	NODEBIN=(node)
	PROBE_DIR="$HERE"
else
	NODEBIN=(docker run --rm --network host -v "$HERE":/probe:ro "$IMG" node)
	PROBE_DIR="/probe"
fi

wait_http() { # $1 = url; poll until it answers
	for _ in $(seq 1 40); do
		if "${NODEBIN[@]}" -e "fetch('$1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
			return 0
		fi
		sleep 0.5
	done
	echo "FAIL: $1 never answered" >&2
	return 1
}

echo "=== 1/4 unit gate (engine + three lenses, live) ==="
docker run --rm "${HARDEN[@]}" "$IMG" node extension/test/unit.ts

echo "=== 2/4 tty-probe (TUI dress under a real PTY) ==="
docker run --rm "${HARDEN[@]}" "$IMG" bash extension/test/tty-probe.sh

echo "=== 3/4 app server probe (page + health + pane APIs + /ws/term stream) ==="
CID="$(docker run -d --rm "${HARDEN[@]}" -p 127.0.0.1:0:7681 "$IMG")"
ADDR="$(docker port "$CID" 7681/tcp | head -1)"
wait_http "http://$ADDR/healthz"
"${NODEBIN[@]}" "$PROBE_DIR/appserver-probe.mjs" "http://$ADDR"

echo "--- watcher: a write in data/ reaches the events channel ---"
"${NODEBIN[@]}" "$PROBE_DIR/appserver-probe.mjs" "http://$ADDR" --fs-event &
PROBE=$!
sleep 1
docker exec "$CID" sh -c 'echo probe >> /home/player/game/data/probe-touch.md'
wait "$PROBE"

docker stop -t 2 "$CID" >/dev/null
CID=""

echo "=== 4/4 ttyd fallback probe (the bare-page rung still carries) ==="
CID="$(docker run -d --rm "${HARDEN[@]}" -p 127.0.0.1:0:7681 "$IMG" \
	ttyd --writable --max-clients 1 --port 7681 \
	-t titleFixed="World Console" -t disableLeaveAlert=true pi)"
ADDR="$(docker port "$CID" 7681/tcp | head -1)"
wait_http "http://$ADDR/"
"${NODEBIN[@]}" "$PROBE_DIR/ws-probe.mjs" "http://$ADDR"
docker stop -t 2 "$CID" >/dev/null
CID=""

echo "=== verify green: $IMG ==="
