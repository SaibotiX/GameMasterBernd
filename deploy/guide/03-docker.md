# 03 — Docker: images, containers, volumes, compose

*Teaching layer — live ops truth: [`deploy/README.md`](../README.md). Synced: `276ff32` (2026-08-20).*

Docker is how this project turns "a program and everything it needs" into a sealed, repeatable, disposable unit. This page teaches Docker's four nouns and two workflows using the project's real files — `deploy/image/Dockerfile` and `deploy/host/compose.yaml` are the textbook.

## Why containers at all

Three separate wins, all load-bearing here:

1. **Reproducibility.** The image is built once from pinned inputs; the box runs *exactly* what the dev machine verified — same Node, same pi version, same files. "Works on my machine" stops being a sentence.
2. **Isolation as security.** pi has no permission system of its own — whatever the AI-driven process can reach, it can touch. The container **is** the security boundary (roadmap 02): a friend's game sees its own files and the open internet, and *nothing else of the box*.
3. **Disposability.** Containers are cattle: stop, delete, recreate from the image at will. Anything that must survive lives in **volumes** — which forces you to decide, explicitly, what state matters. That decision is half of operations.

A container is *not* a virtual machine: it is ordinary processes on the host kernel, walled off by namespaces (own filesystem view, own network, own process list) and cgroups (resource limits). Lighter than a VM, boots in milliseconds, and the walls are exactly as strong as you configure them.

## The four nouns

| Noun | Is | Here |
|---|---|---|
| **Image** | a read-only filesystem snapshot + metadata (what to run, as whom) | `world-console:latest` / `world-console:<gitrev>` |
| **Container** | one running (or stopped) instance of an image + a thin writable layer | `wc-tobias`, `caddy`, `gateway`… |
| **Volume** | named storage managed by Docker, mounted into containers, **survives recreation** | `data-<friend>`, `sessions-<friend>`, `caddy-data` |
| **Network** | a private virtual switch; containers on it reach each other **by service name** | `web` (caddy ↔ seats ↔ gateway), `wake` (caddy ↔ waker only) |

The name-resolution point deserves emphasis: on a shared network, `http://gateway:4100` just works — Docker's internal DNS resolves service names. That is why compose files read like architecture diagrams.

## Anatomy of the project's Dockerfile

A **Dockerfile** is the recipe an image is built from — a list of instructions, each producing a cached **layer**. Annotated tour of `deploy/image/Dockerfile` (read it side by side):

```dockerfile
FROM node:24-trixie-slim AS appserver-deps    # start from an official base image
RUN apt-get install … python3 make g++        # compilers, ONLY in this stage
COPY appserver/package*.json ./
RUN npm ci --omit=dev                          # exact versions from the lockfile
```

This is a **multi-stage build**: a first stage with compilers builds `node-pty` (a native module), and later only the *built result* is copied out — the final image ships no toolchain. Smaller and safer.

```dockerfile
FROM node:24-trixie-slim                       # the real image starts fresh
RUN apt-get install … util-linux fd-find ripgrep
```

Every apt line ends `rm -rf /var/lib/apt/lists/*` — package indexes don't belong in a layer. The odd-looking `fd-find ripgrep`: pi's tool manager looks for system `fdfind`/`rg` before downloading its own — without them, *every* container start re-downloaded tools through a third party (a boot stall verify leg 2 caught). Moral: probes find what reasoning misses.

```dockerfile
ADD --chmod=755 --checksum=sha256:8a21… https://github.com/tsl0922/ttyd/… /usr/local/bin/ttyd
```

A binary fetched at build time is pinned by **version and checksum** — the build fails if upstream's file ever differs. (ttyd is the fallback terminal bridge — R14 keeps a plainer rung aboard in case the app server misbehaves.)

```dockerfile
ARG PI_VERSION=0.84.1
RUN npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}"
```

The engine pin, **exact**. Changing it is never a casual edit — it triggers the full upgrade rite (`research/design/pi-upgrades.md`). Build args (`ARG`) exist at build time; `ENV` persists into the running container.

```dockerfile
RUN useradd --create-home --uid 1001 --shell /bin/bash player
…
USER player
```

The image runs as an unprivileged user, uid 1001 — root-in-container is a bug budget you don't need to grant. Files the player must never rewrite (the app server) are COPY'd root-owned earlier.

```dockerfile
COPY --chown=player:player game/ /home/player/game/
```

Note what this copies: `game/` from the **build context** — which `build.sh` populated from a whitelist archive, not from your working tree (next section).

```dockerfile
HEALTHCHECK … CMD node -e "fetch('http://127.0.0.1:7681/')…"
ENTRYPOINT ["wc-entrypoint"]
CMD ["node", "/opt/appserver/server.js"]
```

`ENTRYPOINT` + `CMD` compose into the start command: the entrypoint script (`deploy/image/entrypoint.sh`) seeds the ephemeral agent dir (pre-answers pi's trust prompt, quiets the changelog — the things a fresh boot would otherwise ask a human) and then `exec "$@"` hands off to the CMD. Overriding `command:` in compose swaps the CMD but keeps the entrypoint — exactly how the ttyd fallback rung works. The `HEALTHCHECK` gives `docker ps` a live healthy/unhealthy verdict — checked on `/` so the fallback stays "healthy" under the same probe.

## Building — and the whitelist principle

Never `docker build` against the live working tree. `deploy/image/build.sh` builds from a **git-archive whitelist of a committed ref**:

```bash
git archive HEAD README.md LICENSE .pi extension config | tar -x -C "$CTX/game"
```

Only those five paths can *ever* enter the image. `research/`, `aitester/`, `data/`, and any credential are excluded **by construction** — not by hoping `.dockerignore` is right. Uncommitted changes can't leak because the archive reads the ref, not the tree. The short git rev becomes the image tag and an env var (`GIT_REV`) so every play session's manifest records the exact code that served it.

```bash
# on: dev machine or box (as deploy)
deploy/image/build.sh            # → world-console:<rev> + world-console:latest
```

The transferable rule: **an image build is a function of committed state**. If a secret is ever needed at build time, it enters as a BuildKit secret mount (never an ARG/ENV — those persist in layers for anyone to read with `docker history`).

## Running — the flags as a hardening checklist

`docker run` flags are per-container policy. The project's baseline (the `x-friend` anchor in compose, and the same flags on ad-hoc `docker run` lines) doubles as a checklist for any future service:

| Flag | Effect | Why here |
|---|---|---|
| `--read-only` / `read_only: true` | root filesystem immutable | code can't be modified at runtime; all writes go to declared places |
| `tmpfs: /tmp`, `…/.pi/agent` | RAM-only scratch | credentials die with the container (R11) |
| `cap_drop: [ALL]` | drop all Linux capabilities | no raw sockets, no chown sprees — none are needed |
| `security_opt: no-new-privileges` | setuid binaries can't escalate | closes a whole family of escapes |
| `mem_limit: 768m`, `cpus: 1.0`, `pids_limit: 256` | resource ceilings | one runaway seat can't starve the box (pids stops fork bombs) |
| `--user 1001` / `user: "1001:1001"` | run unprivileged | even the gateway, which owns its state dir |
| `--network none` | no network at all | backup staging and store verification containers — they only read/write mounts |
| `init: true` | a real PID-1 reaper | zombie processes get collected |
| `expose` not `ports` | reachable only on the docker network | nothing but caddy is public ([01](01-web-fundamentals.md) §ports) |
| `restart: unless-stopped` | auto-restart on crash/reboot | the box recovers alone (the reaper's deliberate stops stay stopped) |
| `stop_grace_period: 30s` | time between SIGTERM and SIGKILL | a stop is a *seal* — the app server ships sessions in that window |

That last one teaches the general lifecycle: `docker stop` sends **SIGTERM**, waits the grace period, then **SIGKILL**. Programs that care (the app server's `shutdown()`) catch SIGTERM and finish their bookkeeping. Design your services to treat stop as a seam, not an accident.

**One-off containers as tools** is the other running pattern here — short-lived `docker run --rm` invocations that mount just what they need: tarring a volume for backup (`--network none -v vol:/v:ro`), editing `keys.json` as uid 0, verifying store hashes. Grep `docker run --rm` across `deploy/host/*.sh` and you'll find a dozen small examples of least-privilege tooling.

## Compose — the whole stack as one file

`docker compose` reads a YAML file describing services, networks, and volumes, and makes reality match it. The core verbs:

```bash
# on: box (as deploy), in deploy/host/
docker compose up -d              # create/start everything; RECREATES what changed
docker compose up -d wc-alice     # just one service
docker compose ps                 # state + health of the stack
docker compose logs -f gateway    # follow one service's output
docker compose stop wc-alice      # stop (container + volumes remain)
docker compose down               # stop and REMOVE containers (volumes remain!)
docker compose exec wc-alice sh   # a shell inside a RUNNING container
docker compose config -q          # parse/validate the merged model (a cheap gate)
```

`up -d` is **declarative**: it diffs desired against actual and recreates only services whose config or image changed. That is the entire deploy mechanism here — build a new image, `up -d`, and exactly the touched seats roll.

Ideas from `deploy/host/compose.yaml` worth owning:

- **YAML anchor as the single hardened shape.** `x-friend: &friend` defines the friend-container shape once; `<<: *friend` reuses it. One home for the security posture.
- **The override file is the friend registry.** Compose auto-merges `compose.override.yaml` over `compose.yaml`. All per-friend services/volumes live in the override — written by `new-friend.sh`, gitignored, box-local. The tracked file never carries a friend, so `git pull` never conflicts with production state. Each friend `extends` the tracked `wc-template` (anchors can't cross files; `extends` can).
- **`scale: 0` as parking.** `wc-template` is a real service that `up` never instantiates — the pattern that lets the override merely say `scale: 1` per friend.
- **Profiles gate the test rig.** `profiles: [local]` marks services (self-signed caddy, the pretend-Anthropic stub, `wc-test`) that exist only when a profile is requested — the production `up -d` never touches them; `localcheck.sh` runs `--profile local`. Test scaffolding lives *in* the production file without ever running in production.
- **Networks as boundaries.** The waker holds the docker socket (root-equivalent power), so it lives on `wake`, shared with caddy alone — a friend container on `web` cannot even route to it. Segmentation by network membership, free at design time.
- **Env plumbing.** `${VAR:-default}` in compose reads the shell env and `.env` beside the file. Secrets reach containers this way (org key, ntfy topic) — never written into the YAML. One sharp edge recorded in `gateway.js`: compose forwards *unset* as **empty string**, and `Number("")` is `0` — guard with `||`, not `??`.

## What survives what — the lifecycle table

The most important table in this page. "Recreate" = `up -d` after an image/config change.

| State | stop/start | recreate | `down` | `down -v` / `volume rm` |
|---|---|---|---|---|
| container filesystem writes (non-volume) | survives | **lost** | **lost** | lost |
| tmpfs contents (`auth.json`!) | **lost** (by design, R11) | lost | lost | lost |
| named volumes (`data-*`, `sessions-*`, `caddy-data`) | survive | **survive** | **survive** | **LOST — deliberate step only** |
| bind mounts (`./gateway-state`, `/srv/…/staging/<f>`) | survive | survive | survive | survive (they're host dirs) |
| the image | untouched | is the new basis | untouched | untouched |

Consequences the project builds on: chronicles survive every update *by construction*; a login-ish thing that lived on tmpfs needs re-provisioning after any stop (the house lane's env-borne virtual key is the cure); and a container **pins its image at creation** — a rebuilt `latest` moves nothing until each seat is recreated (this is why `wc-testuser` once lagged an image rollout: no recreate, no roll).

One more scar worth its line: a **single-file bind mount pins the inode**. Editors that write-and-rename (sed -i, most editors) replace the file; the container keeps reading the *old* one. Mount the *directory* instead — caddy mounts `./caddy`, not `./caddy/Caddyfile`, because a phantom-404 night taught it.

## Housekeeping

```bash
# on: box (as deploy)
docker ps --format 'table {{.Names}}\t{{.Status}}'   # what's running, health at a glance
docker images                                         # local images and tags
docker volume ls | grep world-console                 # every named volume
docker volume inspect world-console_data-tobias       # …including its real path on disk
docker stats --no-stream                              # live cpu/mem per container
docker system df                                      # disk used by images/volumes/build cache
docker image prune -f                                 # drop dangling (untagged old) images
```

Old image revisions accumulate with every build — `image prune` is the safe cleanup (it never touches tagged/latest or volumes). Anything named `prune` deserves a breath before Enter; `volume prune` in particular would eat unattached-but-precious volumes.

---

**Pointers:** the image recipe → `deploy/image/Dockerfile` + `build.sh` · the stack → `deploy/host/compose.yaml` · the friend shape and mint → `new-friend.sh` + runbook §per-friend onboarding · the security rationale → roadmap `02-friends-web-service.md` §architecture · what a stop must accomplish → `server.js` shutdown + runbook §the reaper.
