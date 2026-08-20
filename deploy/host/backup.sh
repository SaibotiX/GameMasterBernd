#!/usr/bin/env bash
# 02 item 13 (R18): the nightly borg lane — every named volume staged
# read-only as a plain tar, plus the session store and the box-local
# gitignored state, into ONE encrypted archive on the Hetzner Storage Box
# (cross-provider by ruling). Run by gamemaster-bernd-backup.timer as root,
# after the store sweep has compacted the night's sessions.
#
# What rides along, and why:
#   volumes        every gamemaster-bernd_* named volume (data-*,
#                  sessions-*) — tar'd from a :ro mount, never live paths
#   the store      /srv/gamemaster-bernd/store — the research record (R13)
#   box-local state under deploy/host/, in no repo by design:
#                  consents.md (Art. 7(1) proof) · .env (org key, address —
#                  disaster recovery needs it) · gateway-state/ (R12 billing
#                  truth) · caddy/friends/ · compose.override.yaml ·
#                  first-use/ (R16 evidence)
#   auth.json      NOT here, by construction: it lives on the tmpfs agent
#                  dir (R11), never inside any volume — a volume backup
#                  cannot contain it.
#
# The promise that binds the shape (runbook §deletion, the privacy note's
# month): prune --keep-within 28d — an erased player ages out of EVERY
# archive inside the month; nothing is ever hand-edited out of a backup.
# Storage-Box snapshots stay OFF for the same reason (06 §2026-08-09).
#
# Volumes are tar'd LIVE (friends keep playing): a file appended mid-read
# can surface as a borg "file changed" warning (rc 1) — tolerated and
# printed; the next night takes the settled truth. rc >= 2 fails loudly.
#
#   backup.sh [--repo URL] [--staging DIR] [--hostdir DIR] [--store DIR]
#             [--volumes "v1 v2"]
#     --repo URL      borg repo (default: the Storage Box lane)
#     --staging DIR   where volume tars land (default /srv/gamemaster-bernd/backup-staging)
#     --hostdir DIR   the deploy/host dir carrying the box-local state
#     --store DIR     the session store root
#     --volumes LIST  space-separated volume names (default: every gamemaster-bernd_*)
set -euo pipefail
umask 077

# The borg repo KEEPS its historical name (…/borg/worldconsole): renaming a
# live archive set buys nothing, and the hub's own lane was deliberately
# named `hub` to read unambiguously beside it (WC runbook §Backups). The
# image tag stays world-console:latest too — it is engine/test surface,
# held with the WC_/wc- prefixes and the on-disk session types (R36's
# named leftovers; the runbook's H1a step-2 state note carries the list).
REPO="ssh://u648152@u648152.your-storagebox.de:23/./borg/worldconsole"
STAGING=/srv/gamemaster-bernd/backup-staging
HOSTDIR=/home/deploy/gamemaster-bernd/deploy/host
STORE=/srv/gamemaster-bernd/store
VOLUMES=""
IMAGE=world-console:latest
while [ $# -gt 0 ]; do
	case "$1" in
	--repo) REPO="$2"; shift 2 ;;
	--staging) STAGING="$2"; shift 2 ;;
	--hostdir) HOSTDIR="$2"; shift 2 ;;
	--store) STORE="$2"; shift 2 ;;
	--volumes) VOLUMES="$2"; shift 2 ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

# Key + passphrase custody (overridable so localcheck can run keyless
# against a throwaway file repo): the identity is the box's dedicated
# backup key — its pubkey went to the Storage Box at order; host keys are
# pinned in known_hosts, verified against Hetzner's published fingerprints.
# The passphrase file is root-600; its recovery copy lives OFF-box in the
# password manager (the runbook §Backups carries the read-it command).
: "${BORG_RSH:=ssh -i /root/.ssh/storagebox_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=yes}"
: "${BORG_PASSCOMMAND:=cat /root/worldconsole-borg.pass}"
export BORG_RSH BORG_PASSCOMMAND
export BORG_REPO="$REPO"

# --- the state manifest: all six present or the night fails loudly --------
for P in consents.md .env gateway-state caddy/friends compose.override.yaml first-use; do
	[ -e "$HOSTDIR/$P" ] || { echo "ERROR: box-local state missing: $HOSTDIR/$P" >&2; exit 1; }
done
[ -d "$STORE" ] || { echo "ERROR: no store at $STORE" >&2; exit 1; }

# --- stage every volume as a plain tar (borg compresses; plain tars let
# --- unchanged blocks dedup across nights) --------------------------------
if [ -z "$VOLUMES" ]; then
	VOLUMES="$(docker volume ls --format '{{.Name}}' | grep '^gamemaster-bernd_' | sort | tr '\n' ' ')"
fi
[ -n "${VOLUMES// /}" ] || { echo "ERROR: no volumes to back up" >&2; exit 1; }
rm -rf "$STAGING"
mkdir -p "$STAGING"
for VOL in $VOLUMES; do
	echo "stage: $VOL"
	docker run --rm --user 0 --network none -v "$VOL:/v:ro" -v "$STAGING:/out" \
		--entrypoint tar "$IMAGE" cf "/out/$VOL.tar" -C /v .
done

# --- one archive a night; prune is the month promise ----------------------
NAME="nightly-$(date -u +%FT%H-%M-%SZ)"
set +e
borg create --stats --compression zstd "::$NAME" \
	"$STAGING" "$STORE" \
	"$HOSTDIR/consents.md" "$HOSTDIR/.env" "$HOSTDIR/gateway-state" \
	"$HOSTDIR/caddy/friends" "$HOSTDIR/compose.override.yaml" "$HOSTDIR/first-use"
RC=$?
set -e
if [ "$RC" -ge 2 ]; then
	echo "ERROR: borg create failed (rc $RC)" >&2
	exit "$RC"
elif [ "$RC" -eq 1 ]; then
	echo "backup: borg warned (rc 1, likely a live file changing mid-read) — next night self-heals"
fi

borg prune --keep-within 28d
borg compact

# Staged tars served their night; the repo holds them now.
rm -rf "$STAGING"

echo "backup: $NAME landed"
borg list --last 1
