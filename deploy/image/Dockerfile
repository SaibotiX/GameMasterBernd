# syntax=docker/dockerfile:1
# The stage-1 image (02 §image): pi + the game folder + ttyd.
#
# Build through build.sh, never `docker build` on the working tree: the game
# folder enters from a git-archive WHITELIST (README.md LICENSE .pi extension
# config), so research/, aitester/, data/ and anything untracked — auth.json
# above all — structurally cannot leak into a layer. No credential ever
# appears in a layer, build arg, or env; should the build one day need one,
# it is a BuildKit secret mount, nothing else.
FROM node:24-trixie-slim

# util-linux carries script(1) for the in-container tty-probe.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates util-linux \
 && rm -rf /var/lib/apt/lists/*

# ttyd is the terminal-to-web bridge (the fallback rung serves its stock
# xterm.js page; the app server replaces the page, not the transport).
# Debian does not package it; the release binary is pinned by version AND
# checksum. x86_64 only — this dev box and the netcup box both are (R18).
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:7681/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["wc-entrypoint"]
# One friend, one container, one client: a second tab would spawn a second
# pi over the same session store — refuse it at the bridge.
CMD ["ttyd", "--writable", "--max-clients", "1", "--port", "7681", \
     "-t", "titleFixed=World Console", "-t", "disableLeaveAlert=true", \
     "pi"]
