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
VKEY="wc-$(head -c 1024 /dev/urandom | tr -dc 'a-z0-9' | head -c 40)"

# The door: its own snippet, picked up by the play site block's import.
# Two upstreams under lb_policy first: the friend's container, then the
# waker — a sleeping (reaper-stopped) container fails the dial and the
# waker answers with the waking page while starting it (02 item 12).
# dial_timeout bounds dial INCLUDING the DNS lookup: a stopped container's
# name can hang in resolution instead of NXDOMAINing, and an unbounded
# lookup would eat the try window before the waker is ever consulted.
cat > "$SNIPPET" <<EOF
redir /f/$TOKEN /f/$TOKEN/ 308
handle_path /f/$TOKEN/* {
	basic_auth {
		$NAME $HASH
	}
	reverse_proxy wc-$NAME:7681 waker:9000 {
		lb_policy first
		lb_try_duration 4s
		lb_try_interval 250ms
		fail_duration 3s
		header_up X-Friend $NAME
		transport http {
			dial_timeout 1500ms
		}
	}
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

# The friend's staging prefix in the store (R13): created owned by the
# player uid BEFORE the bind mounts it — docker would otherwise auto-create
# it root-owned and the shipper inside could never write. The image's own
# node runs the errand; --user 0 because chown is root's.
STORE_STAGING="/srv/worldconsole/store/staging"
docker run --rm --user 0 -v "$STORE_STAGING:/s" world-console:latest \
	sh -c "mkdir -p /s/$NAME && chown 1001:1001 /s/$NAME && chmod 700 /s/$NAME"

# The friend's grant on the house lane (R12/R29): a virtual key in the
# gateway's box-local keys.json, budget in micro-USD. 10,000,000 micro = $10
# is R12's placeholder test-phase grant until the ledger round replaces the
# static budget with monthly grants. The box has no host node by design —
# the image's node runs this errand too, and the gateway re-reads keys.json
# per request, so the key binds with no reload.
GATEWAY_STATE="$HERE/gateway-state"
mkdir -p "$GATEWAY_STATE"
[ -f "$GATEWAY_STATE/keys.json" ] || echo '{}' >"$GATEWAY_STATE/keys.json"
docker run --rm --user 0 -v "$GATEWAY_STATE:/d" -e VKEY="$VKEY" -e PLAYER="$NAME" world-console:latest \
	node -e '
		const fs = require("fs");
		const keys = JSON.parse(fs.readFileSync("/d/keys.json", "utf8"));
		if (Object.values(keys).some(k => k.player === process.env.PLAYER))
			{ console.error(`a key for ${process.env.PLAYER} already exists`); process.exit(1); }
		keys[process.env.VKEY] = { player: process.env.PLAYER, budgetMicro: 10000000, rpm: 30 };
		fs.writeFileSync("/d/keys.json", JSON.stringify(keys, null, "\t") + "\n");'

SVC="$(mktemp)"; VOL="$(mktemp)"
trap 'rm -f "$SVC" "$VOL"' EXIT
cat > "$SVC" <<EOF
  wc-$NAME:
    extends:
      file: compose.yaml
      service: wc-template
    scale: 1
    environment:
      WC_PLAYER: $NAME
      WC_GATEWAY_URL: http://gateway:4100
      WC_MODEL: anthropic/claude-haiku-4-5
      ANTHROPIC_API_KEY: $VKEY
      # WORLD_CONSOLE_WORLD: star-frontier
    volumes:
      - data-$NAME:/home/player/game/data
      - sessions-$NAME:/home/player/.pi/agent/sessions
      - $STORE_STAGING/$NAME:/ship

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
        + a house-lane grant in gateway-state/keys.json (\$10, R12 placeholder)
── then ────────────────────────────────────────────────────────────────────
  docker compose up -d gateway wc-$NAME
  docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

── send to $NAME out of band, once (never in the repo, never in a log): ────
  https://play.worldconsole.eu/f/$TOKEN/
  user:     $NAME
  password: $PASS
EOF
