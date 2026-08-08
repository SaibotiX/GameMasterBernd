#!/usr/bin/env bash
# Mints one friend's doorway: the long-random secret path, the basic-auth
# pair, and the exact blocks to paste into Caddyfile and compose.yaml
# (runbook §per-friend onboarding). Prints everything once — the password
# is shown here and never stored anywhere on our side (02 item 1: the
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
# One home for the caddy pin: read it out of compose.yaml.
CADDY_IMG="$(grep -oE 'image: caddy:[0-9.]+' "$HERE/compose.yaml" | head -1 | cut -d' ' -f2)"

# Bounded input, not an endless stream: `tr </dev/urandom | head` dies of
# SIGPIPE under pipefail (exit 141) once head closes the pipe. 1 KiB of
# entropy filters down to far more than the chars we keep.
TOKEN="$(head -c 1024 /dev/urandom | tr -dc 'a-z0-9' | head -c 30)"
PASS="$(head -c 1024 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 20)"
HASH="$(docker run --rm "$CADDY_IMG" caddy hash-password --plaintext "$PASS")"

cat <<EOF
── Caddyfile → under "friends" in play.worldconsole.eu ─────────────────────
	redir /f/$TOKEN /f/$TOKEN/ 308
	handle_path /f/$TOKEN/* {
		basic_auth {
			$NAME $HASH
		}
		reverse_proxy wc-$NAME:7681
	}

── compose.yaml → under "friends" in services: ─────────────────────────────
  wc-$NAME:
    <<: *friend
    volumes:
      - data-$NAME:/home/player/game/data
      - sessions-$NAME:/home/player/.pi/agent/sessions

── compose.yaml → under volumes: ───────────────────────────────────────────
  data-$NAME:
  sessions-$NAME:

── then ────────────────────────────────────────────────────────────────────
  docker compose up -d wc-$NAME
  docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

── send to $NAME out of band, once (never in the repo, never in a log): ────
  https://play.worldconsole.eu/f/$TOKEN/
  user:     $NAME
  password: $PASS
EOF
