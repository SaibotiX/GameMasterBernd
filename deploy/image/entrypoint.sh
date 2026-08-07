#!/bin/bash
# Seeds the ephemeral ~/.pi/agent and hands off to the container command.
#
# In the real deployment ~/.pi/agent is a tmpfs (auth.json must die with the
# container — R11) with the sessions/ volume nested inside, so every boot
# starts from an empty agent dir except sessions. The seeding below rebuilds
# what a fresh pi would ask a human for: directory trust (there is exactly one
# directory, ours), and a settings file so the changelog splash never greets a
# friend mid-invitation. Runs for verify commands too — same ground as play.
set -euo pipefail

AGENT="$HOME/.pi/agent"
mkdir -p "$AGENT/sessions"

if [ ! -f "$AGENT/trust.json" ]; then
	printf '{\n  "%s": true\n}\n' "$GAME_DIR" >"$AGENT/trust.json"
fi

if [ ! -f "$AGENT/settings.json" ]; then
	printf '{\n  "lastChangelogVersion": "%s",\n  "theme": "dark"\n}\n' "${PI_VERSION:-0}" >"$AGENT/settings.json"
fi

# The data volume mounts here; first boot on a fresh volume needs the dir tree
# to exist before pi writes a chronicle into it.
mkdir -p "$GAME_DIR/data"

exec "$@"
