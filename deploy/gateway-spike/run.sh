#!/usr/bin/env bash
# One candidate, end to end: start it, mint/point at spike keys, run the four
# probe legs, then leg 5 — pi itself speaking through the gateway unmodified.
#
#   ./run.sh own       # candidate B: the ~200-line node proxy
#   ./run.sh litellm   # candidate A: LiteLLM + its required Postgres (docker)
#
# Needs .env with ANTHROPIC_ORG_KEY (see .env.example). A full run costs about
# one cent upstream. Receipts print at the end — they land in the research log
# with the shape decision (map item 1, deploy/README.md §next round).
set -euo pipefail
cd "$(dirname "$0")"

CAND="${1:-own}"
[[ -f .env ]] || { echo "no .env here — cp .env.example .env and paste the house key"; exit 1; }
set -a; source ./.env; set +a
: "${ANTHROPIC_ORG_KEY:?ANTHROPIC_ORG_KEY missing from .env}"

json_field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s)$1??'')})"; }

case "$CAND" in
	own)
		GATEWAY=http://127.0.0.1:4100
		GOOD=wc-spike-good BROKE=wc-spike-broke
		rm -f usage.jsonl
		node own-proxy.mjs &
		PROXY=$!
		trap 'kill "$PROXY" 2>/dev/null || true' EXIT
		for _ in $(seq 40); do curl -fsS "$GATEWAY/healthz" >/dev/null 2>&1 && break; sleep 0.25; done
		node probe.mjs "$GATEWAY" "$GOOD" "$BROKE" || PROBE_RC=$?
		echo
		echo "--- gateway-side meter (/healthz) ---"
		curl -fsS "$GATEWAY/healthz"; echo
		;;
	litellm)
		GATEWAY=http://127.0.0.1:4000
		docker compose -f litellm/compose.yaml up -d
		trap 'docker compose -f litellm/compose.yaml down -v' EXIT
		echo "waiting for litellm (first boot pulls the image and migrates postgres — can take minutes)..."
		for _ in $(seq 180); do curl -fsS "$GATEWAY/health/liveliness" >/dev/null 2>&1 && break; sleep 1; done
		mint() { curl -fsS -X POST "$GATEWAY/key/generate" \
			-H "Authorization: Bearer ${LITELLM_MASTER_KEY:-sk-spike-master}" \
			-H "content-type: application/json" -d "{\"max_budget\": $1}" | json_field ".key"; }
		GOOD=$(mint 0.20)
		BROKE=$(mint 0.00005)
		echo "minted virtual keys: good=${GOOD:0:12}… broke=${BROKE:0:12}…"
		node probe.mjs "$GATEWAY" "$GOOD" "$BROKE" || PROBE_RC=$?
		echo
		echo "--- gateway-side meter (/key/info) ---"
		curl -fsS "$GATEWAY/key/info?key=$GOOD" -H "Authorization: Bearer ${LITELLM_MASTER_KEY:-sk-spike-master}"; echo
		;;
	*)
		echo "usage: ./run.sh [own|litellm]"; exit 2
		;;
esac

echo
echo "--- leg 5: pi speaks through the gateway, unmodified ---"
# Sandboxed HOME keeps the maintainer's real auth.json out of the frame: the
# ONLY credential in play is the virtual key in env, the only route the
# override extension in pi-project/.pi/extensions/gateway.ts. Project
# extensions load only for TRUSTED dirs and -p never prompts — so pre-answer
# trust exactly the way the image's entrypoint.sh does for the game dir.
TMPHOME=$(mktemp -d)
mkdir -p "$TMPHOME/.pi/agent"
printf '{\n  "%s": true\n}\n' "$PWD/pi-project" >"$TMPHOME/.pi/agent/trust.json"
( cd pi-project && HOME="$TMPHOME" WC_GATEWAY_URL="$GATEWAY" ANTHROPIC_API_KEY="$GOOD" \
	pi --provider anthropic --model claude-haiku-4-5 --no-session -p "Reply with exactly: the lane holds" )
rm -rf "$TMPHOME"

exit "${PROBE_RC:-0}"
