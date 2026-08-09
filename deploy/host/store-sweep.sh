#!/usr/bin/env bash
# The store side of R13's shipper (02 item 10) — the daily half of trigger 3
# plus the compact step, run by worldconsole-store-sweep.timer as root:
#
#   1. every STOPPED friend gets the one-shot sweep: the image's own shipper
#      over read-only game volumes, no network — whatever a crash or a stop
#      race left unsealed gets trigger-2 treatment. Running friends are
#      skipped on purpose: their own app server ticks, and only IT knows
#      which session is live.
#   2. every sealed staging dir is VERIFIED (each manifest hash recomputed
#      over the staged bytes — in a container; the box has no host node by
#      design) and compacted to sessions/<player>/<sid>.tar.zst, tmp+rename.
#      The staged data files are then pruned; manifest.json + sealed stay,
#      so the container side still answers "shipped already". A hash
#      mismatch is refused LOUDLY and left in place for eyes — never pruned,
#      never compacted.
#
# Idempotent throughout: a compacted dir (sealed, no session.jsonl) is
# skipped; re-running changes nothing. Exit 1 if anything erred — the
# journal is the alarm.
#
#   store-sweep.sh [--store DIR] [--compact-only] [--friend NAME]
#     --store DIR      the store root (default /srv/worldconsole/store)
#     --compact-only   skip phase 1 (localcheck's mode: no box friends)
#     --friend NAME    phase 1 for this one friend only — the reaper's
#                      post-stop call, so a stop is a seal within the minute
set -euo pipefail
umask 077

STORE=/srv/worldconsole/store
COMPACT_ONLY=0
FRIEND=""
while [ $# -gt 0 ]; do
	case "$1" in
	--store) STORE="$2"; shift 2 ;;
	--compact-only) COMPACT_ONLY=1; shift ;;
	--friend) FRIEND="$2"; shift 2 ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done
HERE="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

[ -d "$STORE/staging" ] || { echo "no store at $STORE (runbook §the store creates it)" >&2; exit 2; }

# --- 1: stopped friends get the one-shot sweep -----------------------------
if [ "$COMPACT_ONLY" != 1 ]; then
	if [ -n "$FRIEND" ]; then
		ALL="wc-$FRIEND"
	else
		ALL="$(docker compose --project-directory "$HERE" config --services 2>/dev/null | grep '^wc-' | grep -vE '^wc-(template|test)$' || true)"
	fi
	RUNNING="$(docker compose --project-directory "$HERE" ps --services --status running 2>/dev/null || true)"
	for SVC in $ALL; do
		NAME="${SVC#wc-}"
		if grep -qx "$SVC" <<<"$RUNNING"; then continue; fi
		docker volume inspect "world-console_sessions-$NAME" >/dev/null 2>&1 || continue
		echo "sweep: $NAME (stopped)"
		if ! docker run --rm --user 1001 --network none --read-only \
			--tmpfs /tmp:rw,uid=1001,gid=1001 \
			-v "world-console_data-$NAME:/home/player/game/data:ro" \
			-v "world-console_sessions-$NAME:/home/player/.pi/agent/sessions:ro" \
			-v "$STORE/staging/$NAME:/ship" \
			-e "WC_PLAYER=$NAME" \
			--entrypoint node world-console:latest /opt/appserver/shipper.js sweep; then
			echo "ERROR: one-shot sweep failed for $NAME" >&2
			ERRORS=$((ERRORS + 1))
		fi
	done
fi

# --- 2: verify + compact every sealed, still-staged session ----------------
shopt -s nullglob
for SEALED in "$STORE"/staging/*/*/sealed; do
	DIR="$(dirname "$SEALED")"
	SID="$(basename "$DIR")"
	PLAYER="$(basename "$(dirname "$DIR")")"
	[ -f "$DIR/session.jsonl" ] || continue # already compacted
	if [ ! -f "$DIR/manifest.json" ]; then
		echo "ERROR: $PLAYER/$SID sealed without a manifest — left for eyes" >&2
		ERRORS=$((ERRORS + 1))
		continue
	fi
	# Store-side hash verification (R13): every manifest entry recomputed
	# over the staged bytes before anything is compacted or pruned.
	if ! docker run --rm --network none -v "$DIR:/staged:ro" \
		--entrypoint node world-console:latest -e '
			const fs=require("fs"),crypto=require("crypto");
			const m=JSON.parse(fs.readFileSync("/staged/manifest.json","utf8"));
			let bad=0;
			for(const [rel,info] of Object.entries(m.files)){
				try{
					const h=crypto.createHash("sha256").update(fs.readFileSync("/staged/"+rel)).digest("hex");
					if(h!==info.sha256){console.error("hash mismatch: "+rel);bad++;}
				}catch{console.error("unreadable: "+rel);bad++;}
			}
			process.exit(bad?1:0);'; then
		echo "ERROR: $PLAYER/$SID failed hash verification — left untouched for eyes" >&2
		ERRORS=$((ERRORS + 1))
		continue
	fi
	mkdir -p "$STORE/sessions/$PLAYER"
	TMP="$STORE/sessions/$PLAYER/.$SID.tar.zst.tmp"
	MEMBERS=(session.jsonl manifest.json sealed)
	if [ -d "$DIR/story" ]; then MEMBERS+=(story); fi
	(cd "$DIR" && tar --zstd -cf "$TMP" "${MEMBERS[@]}")
	# A reopen may have raced the tar (the container side unseals a grown
	# session by removing the marker first) — then this compact is stale:
	# discard it and let the next run take the resealed truth.
	if [ -f "$SEALED" ]; then
		mv "$TMP" "$STORE/sessions/$PLAYER/$SID.tar.zst"
		rm -f "$DIR/session.jsonl"
		rm -rf "$DIR/story"
		echo "compacted: $PLAYER/$SID"
	else
		rm -f "$TMP"
		echo "reopened mid-compact, skipped: $PLAYER/$SID"
	fi
done

if [ "$ERRORS" -gt 0 ]; then
	echo "store-sweep: $ERRORS error(s)" >&2
	exit 1
fi
echo "store-sweep: clean"
