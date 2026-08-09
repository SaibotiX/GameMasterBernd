#!/usr/bin/env bash
# Builds the stage-1 image from a WHITELIST archive of a committed ref —
# never from the live working tree (02 item 2: untracked files, data/ and
# any credential are excluded by construction, not by ignore-file luck).
#
#   deploy/image/build.sh [ref]     # default HEAD
#
# Tags world-console:<shortrev> and world-console:latest, stamps the rev
# into the OCI revision label. Override the engine pin only through the
# upgrade rite (research/design/pi-upgrades.md): PI_VERSION=x.y.z build.sh
set -euo pipefail

REF="${1:-HEAD}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

CTX="$(mktemp -d /tmp/wc-image-ctx.XXXXXX)"
trap 'rm -rf "$CTX"' EXIT

# The whitelist. Everything the game needs, nothing else: the engine, its
# loader shims, the live config, the README the trust prompt shows, and the
# LICENSE that must travel with any copy leaving our hands (R3).
mkdir "$CTX/game"
git -C "$REPO" archive "$REF" README.md LICENSE .pi extension config \
	| tar -x -C "$CTX/game"

cp "$HERE/Dockerfile" "$HERE/entrypoint.sh" "$CTX/"

# The app server, same whitelist spirit: named files only — the local
# node_modules (host-built native binaries) never enters the context; the
# builder stage compiles its own from the lockfile.
mkdir "$CTX/appserver"
cp "$HERE/appserver/package.json" "$HERE/appserver/package-lock.json" \
	"$HERE/appserver/server.js" "$CTX/appserver/"
cp -r "$HERE/appserver/client" "$CTX/appserver/client"

REV="$(git -C "$REPO" rev-parse --short "$REF")"
BUILD_ARGS=()
if [ -n "${PI_VERSION:-}" ]; then
	BUILD_ARGS+=(--build-arg "PI_VERSION=${PI_VERSION}")
fi

docker build \
	--label "org.opencontainers.image.title=world-console" \
	--label "org.opencontainers.image.revision=${REV}" \
	"${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}" \
	-t "world-console:${REV}" -t world-console:latest \
	"$CTX"

echo "built world-console:${REV} (game tree ${REV}, pi ${PI_VERSION:-pinned-in-Dockerfile})"
