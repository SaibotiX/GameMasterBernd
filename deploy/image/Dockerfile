# syntax=docker/dockerfile:1
# The stage-1 image (02 §image): pi + the game folder + the app server
# (02 item 5, R14) — ttyd stays aboard as the day-one fallback bridge.
#
# Build through build.sh, never `docker build` on the working tree: the game
# folder enters from a git-archive WHITELIST (README.md LICENSE .pi extension
# config), so research/, aitester/, data/ and anything untracked — auth.json
# above all — structurally cannot leak into a layer. No credential ever
# appears in a layer, build arg, or env; should the build one day need one,
# it is a BuildKit secret mount, nothing else.

# --- the app server's dependencies, compiled where the compilers live ------
# node-pty is a native module; it builds here and only the built tree crosses
# into the runtime stage — same base image, same node ABI, no toolchain ships.
FROM node:24-trixie-slim AS appserver-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/appserver
COPY appserver/package.json appserver/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- the image itself -------------------------------------------------------
FROM node:24-trixie-slim

# util-linux carries script(1) for the in-container tty-probe. fd-find and
# ripgrep pre-empt pi's first-boot helper downloads: its tools-manager tries
# the system names (fdfind, rg) before reaching for GitHub, and the agent
# dir is a tmpfs — without these, EVERY container start re-downloads through
# a third party (a boot stall found by verify leg 2, 2026-08-09).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates util-linux fd-find ripgrep \
 && rm -rf /var/lib/apt/lists/*

# ttyd, the fallback terminal-to-web bridge (R14 keeps it: the game stays
# playable in a bare terminal page if the app server ever stalls — compose
# `command:` override, see the CMD note below). Debian does not package it;
# the release binary is pinned by version AND checksum. x86_64 only — this
# dev box and the netcup box both are (R18).
ADD --chmod=755 \
    --checksum=sha256:8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55 \
    https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
    /usr/local/bin/ttyd

# The engine's one dependency beyond node: pi, pinned EXACTLY (02 item 2).
# Changing this pin is a pi upgrade and triggers the full rite —
# research/design/pi-upgrades.md — before the new image serves anyone.
ARG PI_VERSION=0.84.1
RUN npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}" \
 && npm cache clean --force
ENV PI_VERSION=${PI_VERSION}

RUN useradd --create-home --uid 1001 --shell /bin/bash player
ENV HOME=/home/player \
    GAME_DIR=/home/player/game \
    LANG=C.UTF-8 \
    TERM=xterm-256color

# The game folder, from the whitelist archive build.sh laid into the context.
COPY --chown=player:player game/ /home/player/game/

# The app server: root-owned and world-readable — the player user runs it
# but must never be able to rewrite it.
COPY --from=appserver-deps /opt/appserver/node_modules /opt/appserver/node_modules
COPY appserver/package.json appserver/server.js appserver/shipper.js /opt/appserver/
COPY appserver/client/ /opt/appserver/client/

# The game-tree rev build.sh archived, as env: R13's manifests stamp the
# code version that played each session (the OCI label can't be read from
# inside the container).
ARG GIT_REV=unknown
ENV GIT_REV=${GIT_REV}

# data/ (worlds, downloads) and ~/.pi/agent/sessions are the two persistent
# volumes; ~/.pi/agent itself is a runtime tmpfs so auth.json lives and dies
# with the container (R11's structural wipe). Create the mount points owned
# by player so named volumes inherit ownership on first use.
RUN mkdir -p /home/player/game/data /home/player/.pi/agent/sessions \
 && chown -R player:player /home/player/game/data /home/player/.pi

COPY --chmod=755 entrypoint.sh /usr/local/bin/wc-entrypoint

USER player
WORKDIR /home/player/game
EXPOSE 7681
# Health on / (not /healthz): both the app server and the ttyd fallback
# answer there, so a fallback override stays healthy under the same check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:7681/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["wc-entrypoint"]
# The app server owns the port: PTY ↔ pi, the page, the pane APIs. One
# friend, one container, ONE seat — a second tab takes the seat over inside
# the server, never a second pi over the same session store. Fallback rung
# (bare ttyd page, no panes), as a compose `command:` override:
#   ["ttyd", "--writable", "--max-clients", "1", "--port", "7681",
#    "-t", "titleFixed=World Console", "-t", "disableLeaveAlert=true", "pi"]
CMD ["node", "/opt/appserver/server.js"]
