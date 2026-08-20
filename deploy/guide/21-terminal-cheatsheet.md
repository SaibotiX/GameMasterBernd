# 21 — Terminal cheatsheet

*Reference. Every command used across this guide, grouped for lookup. Column "on" says where it runs; ⚠ marks commands that change state. Paste from the fenced blocks in [10](10-operate-the-box.md)/[11](11-data-in-and-out.md) when you need the full form with context. Synced: `d700c6e` (2026-08-20).*

## SSH & files across machines

| Command | on | Tells/does |
|---|---|---|
| `ssh -i ~/.ssh/worldconsole deploy@152.53.51.13` | dev | the box, as the ops user |
| `ssh -i ~/.ssh/worldconsole root@152.53.51.13` | dev | the box, as root (store/backups/units) |
| `ssh-keygen -t ed25519 -f ~/.ssh/<name>` | dev | ⚠ mint a new key pair |
| `scp <file> deploy@152.53.51.13:<path>` | dev | ⚠ copy one file up |
| `rsync -az --delete <src>/ <dst>/` | dev | ⚠ mirror a tree (deletions propagate) |
| `ssh … "command"` | dev | run one remote command, output locally |
| `ssh -o ProxyJump=root@152.53.51.13 <target>` | dev | reach a target *through* the box (DNS quirk workaround) |

## Looking at the box (safe)

| Command | on | Tells |
|---|---|---|
| `df -h /` | box | disk headroom |
| `free -h` | box | RAM in use |
| `swapon --show` | box | must print nothing (hardening) |
| `uptime` | box | load + how long since boot |
| `who` | box | who else is logged in |
| `ss -tlnp` | box (root) | every listening port and its process |
| `dig +short <name>` | box | what DNS says (trust the box's vantage, not the dev machine's) |

## systemd & journal

| Command | on | Tells/does |
|---|---|---|
| `systemctl list-timers 'worldconsole-*'` | box (root) | last + next run of every job |
| `systemctl status <unit>` | box (root) | state, last result, recent lines |
| `systemctl --failed` | box (root) | anything red |
| `systemctl start <service>` | box (root) | ⚠ run a scheduled job now |
| `systemctl enable --now <timer>` | box (root) | ⚠ arm a timer (boot + now) |
| `systemctl daemon-reload` | box (root) | ⚠ re-read unit files after any cp/edit |
| `journalctl -u <unit> --since today` | box (root) | one unit's log today |
| `journalctl -u <unit> -n 100` | box (root) | last 100 lines |
| `journalctl -f -u <unit>` | box (root) | follow live |
| `journalctl -p err --since -2d` | box (root) | all error-level, last 2 days |

## Docker & compose (from `deploy/host/`)

| Command | on | Tells/does |
|---|---|---|
| `docker compose ps` | box (deploy) | the cast: states + health |
| `docker compose logs -f --tail 100 <svc>` | box (deploy) | follow one service |
| `docker compose up -d` | box (deploy) | ⚠ make reality match config (recreates changed) |
| `docker compose up -d <svc>` | box (deploy) | ⚠ just one service |
| `docker compose up -d --force-recreate gateway` | box (deploy) | ⚠ after editing gateway.js (single-file bind) |
| `docker compose stop wc-<name>` | box (deploy) | ⚠ stop a seat (volumes stay; stop = seal) |
| `docker compose exec <svc> sh` | box (deploy) | shell inside a running container |
| `docker compose exec -T <svc> node -e '<js>'` | box (deploy) | run JS inside (healthz asks, admin edits) |
| `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` | box (deploy) | ⚠ apply caddy config without downtime |
| `docker compose config -q` | box/dev | validate the merged compose model |
| `docker ps --format 'table {{.Names}}\t{{.Status}}'` | anywhere | running containers + health |
| `docker stats --no-stream` | box (deploy) | cpu/mem/pids per container |
| `docker volume ls | grep world-console` | box (deploy) | every named volume |
| `docker volume inspect <vol>` | box (deploy) | metadata incl. on-disk mountpoint |
| `docker run --rm --network none -v <vol>:/v:ro world-console:latest ls -R /v` | box (deploy) | browse a volume safely |
| `docker image prune -f` | box (deploy) | ⚠ drop dangling old image layers (safe) |
| `docker system df` | box (deploy) | disk by images/volumes/cache |
| `docker start world-console-wc-<name>-1` | box (deploy) | ⚠ wake a seat by hand (the waker's move) |

Never casually: `docker compose down -v` · `docker volume rm` · `docker volume prune` — volume-destroying; §deletion only.

## The project's own scripts

| Command | on | Does |
|---|---|---|
| `deploy/image/build.sh [ref]` | dev/box (deploy) | ⚠ build the image from a committed ref |
| `deploy/image/verify.sh` | dev/box (deploy) | the image's 5-leg gate |
| `deploy/host/localcheck.sh` | dev | the whole door, production-shaped, keyless |
| `deploy/host/new-friend.sh <name>` | box (deploy) | ⚠ mint a door (consent-gated) |
| `deploy/host/firewall.sh` | box (root) | ⚠ rebuild the DOCKER-USER chain |
| `deploy/host/reaper.sh` | box (root) | one reaper pass by hand |
| `deploy/host/store-sweep.sh` | box (root) | sweep + verify + compact the store |
| `deploy/host/reconcile.sh [--day YYYY-MM-DD]` | box (root) | compare the two spend meters |
| `deploy/host/backup.sh` | box (root) | ⚠ run the borg night now |
| `deploy/host/pull-backup.sh` | dev | mirror the encrypted repo down |
| `research/analysis/tools/pull-sessions.sh` | dev | pull compacted sessions for analysis |
| `node extension/test/unit.ts` | dev | the engine's unit gate (pre-commit when `extension/` changed) |

## borg (as root on the box; export the three BORG_* vars first — [11](11-data-in-and-out.md))

| Command | Tells/does |
|---|---|
| `borg list` | every archive, newest last |
| `borg list --short | tail -1` | just the newest archive's name |
| `borg info ::<archive>` | sizes, dedup ratio |
| `borg list ::<archive>` | files inside an archive |
| `borg extract ::<archive> <path>` | ⚠ restore a path into the current dir |
| `borg prune --keep-within 28d` + `borg compact` | ⚠ the month window (the nightly runs these; rarely by hand) |

## Web-side checks

| Command | on | Tells |
|---|---|---|
| `curl -sI https://worldconsole.eu` | anywhere | landing answers, which CA issued |
| `curl -sI https://play.worldconsole.eu` | anywhere | strangers get the 404 |
| `curl -ks -o /dev/null -w '%{http_code}\n' -u <user>:<pass> <door-url>/` | dev | a door's status code |
| `echo | openssl s_client -connect play.worldconsole.eu:443 2>/dev/null | openssl x509 -noout -dates` | anywhere | certificate validity window |
| `curl -H "title: test" -d "hello" https://ntfy.sh/<topic>` | anywhere | ⚠ ring the pager |

## Permissions & ownership (when a bind/volume misbehaves)

| Command | on | Does |
|---|---|---|
| `ls -la <path>` | anywhere | owner, group, mode of everything |
| `chmod 700 <dir>` / `chmod 600 <file>` | box (root) | ⚠ owner-only dir / secrets file |
| `chmod +x <script>` | anywhere | ⚠ make runnable (the timer's 644 lesson) |
| `chown 1001:1001 <path>` | box (root) | ⚠ hand to the player/gateway uid |
| `install -d -m 700 -o root -g root <dir>` | box (root) | ⚠ mkdir with mode+owner in one move |
