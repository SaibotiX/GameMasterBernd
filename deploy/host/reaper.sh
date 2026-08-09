#!/usr/bin/env bash
# The reaper — 02 item 12's host half (ruled 2026-08-09 onto the shipper
# round): stop-on-idle, where a stop is BOTH the clean pi hangup (the app
# server's grace) and R13's seal (store-sweep --friend right after); the
# per-volume disk watch — ALARM-ONLY this round, enforcement awaits the
# maintainer's ruling; and the docker stats line 02 asks to keep an eye on.
# worldconsole-reaper.timer runs it every 5 minutes. A friend with a live
# WebSocket client is never touched; start-on-connect is the waker's half.
#
#   reaper.sh [service...]   # default: every wc-* service except template/test
# Env: IDLE_LIMIT (s, default 1800 — 02's ~30 min without a WebSocket)
#      WARN_GB / ALARM_GB (per volume, defaults 2 / 5)
#      STORE (default /srv/worldconsole/store)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IDLE_LIMIT="${IDLE_LIMIT:-1800}"
WARN_GB="${WARN_GB:-2}"
ALARM_GB="${ALARM_GB:-5}"
STORE="${STORE:-/srv/worldconsole/store}"

compose() { docker compose --project-directory "$HERE" "$@"; }

if [ $# -gt 0 ]; then
	SERVICES="$*"
else
	SERVICES="$(compose config --services 2>/dev/null | grep '^wc-' | grep -vE '^wc-(template|test)$' || true)"
fi
RUNNING="$(compose ps --services --status running 2>/dev/null || true)"

# --- stop-on-idle ----------------------------------------------------------
for SVC in $SERVICES; do
	grep -qx "$SVC" <<<"$RUNNING" || continue
	# healthz through the container's own node — no published ports, no
	# assumptions about bridge reachability from the host.
	H="$(compose exec -T "$SVC" node -e \
		'fetch("http://127.0.0.1:7681/healthz").then(r=>r.text()).then(t=>{console.log(t)}).catch(()=>process.exit(1))' \
		2>/dev/null || true)"
	if [ -z "$H" ]; then
		echo "WARN: $SVC answered no healthz — leaving it be" >&2
		continue
	fi
	grep -q '"client":true' <<<"$H" && continue # someone is at the console
	IDLE="$(grep -o '"idleSeconds":[0-9]*' <<<"$H" | head -1 | cut -d: -f2 || true)"
	[ -n "$IDLE" ] || continue
	if [ "$IDLE" -ge "$IDLE_LIMIT" ]; then
		echo "stop: $SVC idle ${IDLE}s >= ${IDLE_LIMIT}s (stop grace carries the seal)"
		compose stop "$SVC"
		"$HERE/store-sweep.sh" --store "$STORE" --friend "${SVC#wc-}" \
			|| echo "WARN: post-stop sweep for $SVC erred — the daily sweep will retry" >&2
	fi
done

# --- the disk watch (02 item 12; alarm-only, enforcement unruled) ----------
for SVC in $SERVICES; do
	NAME="${SVC#wc-}"
	for V in "data-$NAME" "sessions-$NAME"; do
		MP="$(docker volume inspect --format '{{.Mountpoint}}' "world-console_$V" 2>/dev/null || true)"
		# Docker Desktop keeps mountpoints inside its VM — the watch is a
		# box thing; elsewhere it skips quietly.
		{ [ -n "$MP" ] && [ -d "$MP" ]; } || continue
		B="$(du -sb "$MP" 2>/dev/null | cut -f1 || echo 0)"
		GB=$((B / 1024 / 1024 / 1024))
		if [ "$GB" -ge "$ALARM_GB" ]; then
			echo "ALARM: volume $V at ${GB}GiB (>=${ALARM_GB}GiB) — downloads grow; runbook §the reaper" >&2
		elif [ "$GB" -ge "$WARN_GB" ]; then
			echo "WARN: volume $V at ${GB}GiB (>=${WARN_GB}GiB)"
		fi
	done
done

# --- one stats line per running container (02 item 12's stats watch) -------
IDS="$(compose ps -q 2>/dev/null || true)"
if [ -n "$IDS" ]; then
	# shellcheck disable=SC2086
	docker stats --no-stream --format 'stats: {{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} pids={{.PIDs}}' $IDS || true
fi
