#!/usr/bin/env bash
# pull-sessions.sh — R13's last leg: the analysis machine pulls the store's
# compacted sessions and lands them in the kit's own sessions-in layout, so
# hosted sittings reach /analyze-sessions the same way hand-carried ones
# always did — jsonl + story folder per tester, plus a meta.md the manifest
# writes for the audit's environment line. Testers hand in only notes.md;
# drop those beside the landed dirs when they arrive.
#
#   tools/pull-sessions.sh <batch> [player...]              # from the box
#   tools/pull-sessions.sh --store DIR <batch> [player...]  # a local store
#
# Env: WC_STORE_SSH  (default: ssh -i ~/.ssh/worldconsole)
#      WC_STORE_HOST (default: root@152.53.51.13 — deploy/README §access)
#
# Box mode keeps a full mirror in research/analysis/store-mirror/
# (gitignored — private play), rsync --delete so a store-side deletion
# (R13's withdraw path) propagates here. Landed tester dirs are NEVER
# overwritten or deleted by this tool: landing twice skips, and a landed
# batch stays exactly what the audit read.
set -euo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)" # research/analysis
STORE=""
if [ "${1:-}" = "--store" ]; then
	STORE="${2:?--store needs a directory}"
	shift 2
fi
BATCH="${1:?usage: pull-sessions.sh [--store DIR] <batch> [player...]}"
shift
PLAYERS=("$@")

if [ -n "$STORE" ]; then
	# A local store is read in place — never through the real mirror, so a
	# test store can't shadow or clobber the box's pulled record.
	MIRROR="$STORE/sessions"
	[ -d "$MIRROR" ] || { echo "no sessions/ under $STORE" >&2; exit 2; }
else
	MIRROR="$BASE/store-mirror"
	WC_STORE_SSH="${WC_STORE_SSH:-ssh -i $HOME/.ssh/worldconsole}"
	WC_STORE_HOST="${WC_STORE_HOST:-root@152.53.51.13}"
	mkdir -p "$MIRROR"
	rsync -a --delete -e "$WC_STORE_SSH" \
		"$WC_STORE_HOST:/srv/worldconsole/store/sessions/" "$MIRROR/"
fi

shopt -s nullglob
LANDED=0
SKIPPED=0
for PDIR in "$MIRROR"/*/; do
	PLAYER="$(basename "$PDIR")"
	if [ "${#PLAYERS[@]}" -gt 0 ]; then
		WANT=0
		for P in "${PLAYERS[@]}"; do [ "$P" = "$PLAYER" ] && WANT=1; done
		[ "$WANT" = 1 ] || continue
	fi
	for TARBALL in "$PDIR"*.tar.zst; do
		SID="$(basename "$TARBALL" .tar.zst)"
		DEST="$BASE/sessions-in/$BATCH/$PLAYER/$SID"
		if [ -e "$DEST" ]; then
			SKIPPED=$((SKIPPED + 1))
			continue
		fi
		mkdir -p "$DEST"
		tar --zstd -xf "$TARBALL" -C "$DEST"
		# Landing verification + meta.md from the manifest — a transport
		# fault surfaces here, not in an audit three weeks later.
		if ! node -e '
			const fs=require("fs"),path=require("path"),crypto=require("crypto");
			const dest=process.argv[1];
			const m=JSON.parse(fs.readFileSync(path.join(dest,"manifest.json"),"utf8"));
			const h=crypto.createHash("sha256").update(fs.readFileSync(path.join(dest,"session.jsonl"))).digest("hex");
			if(h!==m.files["session.jsonl"].sha256){console.error("session.jsonl hash mismatch after landing");process.exit(1);}
			let sealedAt="unknown";
			try{sealedAt=JSON.parse(fs.readFileSync(path.join(dest,"sealed"),"utf8")).sealedAt??"unknown";}catch{}
			fs.writeFileSync(path.join(dest,"meta.md"),
`# meta — ${m.player}/${m.sessionId}

- player: ${m.player} · world: ${m.world ?? "(none)"}
- span: ${m.startedAt} → ${m.endedAt}
- environment: game ${m.gitRev ?? "?"} · pi ${m.piVersion ?? "?"}
- sealed: ${sealedAt} — hashes verified store-side and on landing
- arrived via the shipper (R13), pulled ${new Date().toISOString()}
`);
		' "$DEST"; then
			rm -rf "$DEST"
			echo "ERROR: $PLAYER/$SID failed landing verification — not landed" >&2
			exit 1
		fi
		LANDED=$((LANDED + 1))
	done
done

echo "landed $LANDED session(s), $SKIPPED already present: $BASE/sessions-in/$BATCH/"
echo "notes.md per tester still arrives by hand — drop it beside their session dirs"
echo "audit: /analyze-sessions research/analysis/sessions-in/$BATCH/"
