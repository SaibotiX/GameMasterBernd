#!/usr/bin/env bash
# Mints one friend's doorway and writes it where it lives: a caddy snippet
# in caddy/friends/<name>.caddy and a service+volumes entry in
# compose.override.yaml — both box-local and gitignored, so the tracked
# tree never carries a friend and `git pull` never trips over one
# (runbook §per-friend onboarding). Prints the door and the pair once —
# the password is never stored anywhere on our side (02 item 1: the
# doorway is a secret path + basic auth; credentials for MODELS are the
# player's own and never touch this script).
#
#   deploy/host/new-friend.sh <name>          # e.g. new-friend.sh alice
set -euo pipefail

NAME="${1:?usage: new-friend.sh <name> (lowercase letters, digits, dashes)}"
[[ "$NAME" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || {
	echo "name must be lowercase letters/digits/dashes, starting with a letter" >&2
	exit 1
}

HERE="$(cd "$(dirname "$0")" && pwd)"
SNIPPET="$HERE/caddy/friends/$NAME.caddy"
OVERRIDE="$HERE/compose.override.yaml"

[ -e "$SNIPPET" ] && { echo "$SNIPPET already exists — one door per name" >&2; exit 1; }
grep -q "^  wc-$NAME:" "$OVERRIDE" 2>/dev/null && { echo "wc-$NAME already in $OVERRIDE" >&2; exit 1; }

# One home for the caddy pin: read it out of compose.yaml.
CADDY_IMG="$(grep -oE 'image: caddy:[0-9.]+' "$HERE/compose.yaml" | head -1 | cut -d' ' -f2)"

# Bounded input, not an endless stream: `tr </dev/urandom | head` dies of
# SIGPIPE under pipefail (exit 141) once head closes the pipe. 1 KiB of
# entropy filters down to far more than the chars we keep.
TOKEN="$(head -c 1024 /dev/urandom | tr -dc 'a-z0-9' | head -c 30)"
PASS="$(head -c 1024 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 20)"
HASH="$(docker run --rm "$CADDY_IMG" caddy hash-password --plaintext "$PASS")"

# The door: its own snippet, picked up by the play site block's import.
cat > "$SNIPPET" <<EOF
redir /f/$TOKEN /f/$TOKEN/ 308
handle_path /f/$TOKEN/* {
	basic_auth {
		$NAME $HASH
	}
	reverse_proxy wc-$NAME:7681
}
EOF

# The service: seeded once, then one friend inserted per marker. Each
# friend extends wc-template (compose.yaml) — the hardened shape keeps
# its single home there.
[ -e "$OVERRIDE" ] || cat > "$OVERRIDE" <<'EOF'
# Box-local friends, written by new-friend.sh — gitignored on purpose:
# the tracked tree never carries a friend and git pull never trips.
services:
  # -- friends: ---------------------------------------------------------------

volumes:
  # -- per-friend volumes: ----------------------------------------------------
EOF

SVC="$(mktemp)"; VOL="$(mktemp)"
trap 'rm -f "$SVC" "$VOL"' EXIT
cat > "$SVC" <<EOF
  wc-$NAME:
    extends:
      file: compose.yaml
      service: wc-template
    scale: 1
    volumes:
      - data-$NAME:/home/player/game/data
      - sessions-$NAME:/home/player/.pi/agent/sessions
    # environment:
    #   WORLD_CONSOLE_WORLD: star-frontier

EOF
cat > "$VOL" <<EOF
  data-$NAME:
  sessions-$NAME:
EOF
sed -i -e "/-- friends: --/r $SVC" -e "/-- per-friend volumes: --/r $VOL" "$OVERRIDE"

# The whole merged model must still parse before this mint counts.
docker compose -f "$HERE/compose.yaml" -f "$OVERRIDE" config -q

cat <<EOF
minted: caddy/friends/$NAME.caddy + wc-$NAME in compose.override.yaml
── then ────────────────────────────────────────────────────────────────────
  docker compose up -d wc-$NAME
  docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

── send to $NAME out of band, once (never in the repo, never in a log): ────
  https://play.worldconsole.eu/f/$TOKEN/
  user:     $NAME
  password: $PASS
EOF
