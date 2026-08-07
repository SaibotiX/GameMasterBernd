#!/usr/bin/env bash
# In-container verification — 02 item 3, the automatable parts, run in the
# PRODUCTION shape: read-only root, tmpfs for /tmp, ~/.pi/agent and data/.
#
#   deploy/image/verify.sh [image]      # default world-console:latest
#
# Three legs:
#   1. the unit gate inside the container — engine logic plus all three
#      scrying lenses against live Wikipedia/Commons (proves the image's
#      network path and CA ground),
#   2. the pseudo-TTY probe inside the container — the TUI's dress renders
#      under a real PTY exactly as the local recipe checks it,
#   3. the ttyd WebSocket probe from the host — the same stream a browser
#      would receive, footer mark asserted (ws-probe.mjs).
# What this cannot prove: how the dress LOOKS in a real browser — that
# eyeball check happens at first deploy and with each friend's first sitting.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IMG="${1:-world-console:latest}"

HARDEN=(--read-only
	--tmpfs /tmp:rw,uid=1001,gid=1001
	--tmpfs /home/player/.pi/agent:rw,uid=1001,gid=1001
	--tmpfs /home/player/game/data:rw,uid=1001,gid=1001)

echo "=== 1/3 unit gate (engine + three lenses, live) ==="
docker run --rm "${HARDEN[@]}" "$IMG" node extension/test/unit.ts

echo "=== 2/3 tty-probe (TUI dress under a real PTY) ==="
docker run --rm "${HARDEN[@]}" "$IMG" bash extension/test/tty-probe.sh

echo "=== 3/3 ttyd WebSocket probe (the browser's stream) ==="
CID="$(docker run -d --rm "${HARDEN[@]}" -p 127.0.0.1:0:7681 "$IMG")"
cleanup() { docker stop -t 2 "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
ADDR="$(docker port "$CID" 7681/tcp | head -1)"
for _ in $(seq 1 20); do
	if node -e "fetch('http://$ADDR/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then break; fi
	sleep 0.5
done
node "$HERE/ws-probe.mjs" "http://$ADDR"

echo "=== verify green: $IMG ==="
