#!/usr/bin/env bash
# R18's second leg, run on the MAINTAINER'S machine (like localcheck.sh —
# never a box script): mirror the encrypted borg repo off the Storage Box,
# so neither a Hetzner nor a netcup lockout ever costs the research record.
# The dev machine cannot resolve the Storage Box itself (its external-DNS
# quirk) — the box is the jump, and the jump host does the resolving.
#
# Cadence: by hand, monthly-ish and before anything sweeping — by DAY (the
# nightly borg run owns 05:11–05:20; a pull mid-create would copy a torn
# transaction). --delete is LOAD-BEARING: the repo's 28-day prune must reach
# this mirror too (runbook §deletion), so a pull inside the month after any
# erasure is part of the promise.
#
# The mirror is encrypted bytes end to end; reading it needs the passphrase
# (+ key export) from the password manager. Its integrity proof is rsync's
# clean exit against the repo the box verifies nightly.
#
#   pull-backup.sh [DEST]        # default ~/worldconsole-backups
set -euo pipefail

DEST="${1:-$HOME/worldconsole-backups}"
mkdir -p "$DEST"
rsync -az --delete \
	-e "ssh -p 23 -i $HOME/.ssh/worldconsole -o ProxyJump=root@152.53.51.13 -o BatchMode=yes -o StrictHostKeyChecking=yes" \
	u648152@u648152.your-storagebox.de:borg/ "$DEST/borg/"
echo "pulled: $(du -sh "$DEST/borg" | cut -f1) in $DEST/borg at $(date -u +%FT%TZ)"
