#!/usr/bin/env bash
# Nightly reconciliation (R12/R6, map item 3): the gateway's ledger is the
# billing source of truth — this script keeps it HONEST by re-deriving the
# same day from the other witness, pi's own per-turn cost stamps in the
# session files, and refusing to stay quiet when the two disagree.
#
#   deploy/host/reconcile.sh [--day YYYY-MM-DD] [--ledger PATH]
#
# Defaults: yesterday (UTC, the last complete day) against
# gateway-state/usage.jsonl. Per player: sum the ledger's costMicro vs the
# sum of usage.cost.total over assistant messages in their sessions volume
# (world-console_sessions-<player>), tolerance max(5%, $0.001) — pi prices
# with floats and charges the 1-hour cache-write bucket at its own rate,
# the gateway meters integers at the 5-minute rate; small drift is honest,
# structural drift is a bug. Any mismatch: exit 1 (a red systemd unit) and
# a ntfy ping when NTFY_TOPIC is set (box .env). The box has no host node
# by design — the image's node does all the JSON work.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# .env supplies defaults (NTFY_TOPIC on the box) but an EXPLICIT environment
# wins — localcheck runs the mismatch path with NTFY_TOPIC= so a dev
# machine's .env can never page anyone from a test.
PRE_NTFY="${NTFY_TOPIC-__unset__}"
[ -f "$HERE/.env" ] && { set -a; . "$HERE/.env"; set +a; }
[ "$PRE_NTFY" != "__unset__" ] && NTFY_TOPIC="$PRE_NTFY"

DAY="$(date -u -d yesterday +%F 2>/dev/null || date -u -v-1d +%F)"
LEDGER="$HERE/gateway-state/usage.jsonl"
while [ $# -gt 0 ]; do
	case "$1" in
		--day) DAY="$2"; shift 2 ;;
		--ledger) LEDGER="$2"; shift 2 ;;
		*) echo "usage: reconcile.sh [--day YYYY-MM-DD] [--ledger PATH]" >&2; exit 2 ;;
	esac
done

[ -f "$LEDGER" ] || { echo "reconcile: no ledger at $LEDGER — nothing to check"; exit 0; }

# Phase 1: the gateway's side — per-player micro-USD for the day. Side-tagged
# rows (gmchat's side calls through /side — the 2026-08-09 ruling) are summed
# separately and SUBTRACTED from the comparison: they meter real spend under
# the same caps, but pi's cost stamps never contain them, so counting them
# would page falsely on every chat-heavy sitting.
GW_SUMS="$(docker run --rm -v "$LEDGER:/ledger:ro" -e DAY="$DAY" world-console:latest node -e '
	const fs = require("fs");
	const per = {};
	for (const line of fs.readFileSync("/ledger", "utf8").split("\n")) {
		if (!line) continue;
		try {
			const r = JSON.parse(line);
			if (r.ts.slice(0, 10) === process.env.DAY) {
				const t = (per[r.player] ??= { turn: 0, side: 0 });
				t[r.side ? "side" : "turn"] += r.costMicro;
			}
		} catch {}
	}
	for (const [p, m] of Object.entries(per)) console.log(p, m.turn, m.side);')"

[ -n "$GW_SUMS" ] || { echo "reconcile: $DAY — the ledger holds no spend; nothing to check"; exit 0; }

MISMATCH=0
REPORT=""
while read -r PLAYER GW_MICRO SIDE_MICRO; do
	VOL="world-console_sessions-$PLAYER"
	if ! docker volume inspect "$VOL" >/dev/null 2>&1; then
		REPORT+="$DAY $PLAYER: MISMATCH — ledger says $((GW_MICRO + SIDE_MICRO)) micro but no sessions volume $VOL exists"$'\n'
		MISMATCH=1
		continue
	fi
	# Phase 2: pi's side — sum usage.cost.total over the day's assistant
	# messages, in micro-USD, from the player's own session files.
	PI_MICRO="$(docker run --rm -v "$VOL:/s:ro" -e DAY="$DAY" world-console:latest node -e '
		const fs = require("fs"), path = require("path");
		let total = 0;
		const walk = (d) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) walk(p);
				else if (e.name.endsWith(".jsonl"))
					for (const line of fs.readFileSync(p, "utf8").split("\n")) {
						if (!line) continue;
						try {
							const j = JSON.parse(line);
							if (j.type === "message" && j.message?.role === "assistant" &&
								j.timestamp?.slice(0, 10) === process.env.DAY && j.message.usage?.cost?.total)
								total += j.message.usage.cost.total;
						} catch {}
					}
			}
		};
		walk("/s");
		console.log(Math.round(total * 1e6));')"
	BIG=$(( GW_MICRO > PI_MICRO ? GW_MICRO : PI_MICRO ))
	TOL=$(( BIG / 20 )); [ "$TOL" -lt 1000 ] && TOL=1000
	DIFF=$(( GW_MICRO - PI_MICRO )); [ "$DIFF" -lt 0 ] && DIFF=$(( -DIFF ))
	SIDE_NOTE=""; [ "$SIDE_MICRO" -gt 0 ] && SIDE_NOTE=" (+${SIDE_MICRO} side, subtracted)"
	if [ "$DIFF" -le "$TOL" ]; then
		REPORT+="$DAY $PLAYER: match — gateway ${GW_MICRO}${SIDE_NOTE} vs pi ${PI_MICRO} micro (Δ${DIFF} ≤ ${TOL})"$'\n'
	else
		REPORT+="$DAY $PLAYER: MISMATCH — gateway ${GW_MICRO}${SIDE_NOTE} vs pi ${PI_MICRO} micro (Δ${DIFF} > ${TOL})"$'\n'
		MISMATCH=1
	fi
done <<<"$GW_SUMS"

printf '%s' "$REPORT"
if [ "$MISMATCH" = 1 ]; then
	if [ -n "${NTFY_TOPIC:-}" ]; then
		curl -fsS -X POST -H "title: world console — reconciliation" \
			-d "$(printf 'The two meters disagree:\n%s' "$REPORT")" \
			"https://ntfy.sh/$NTFY_TOPIC" >/dev/null || echo "reconcile: ping failed to send"
	fi
	exit 1
fi
echo "reconcile: $DAY — both meters tell the same story"
