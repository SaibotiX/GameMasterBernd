# 04 — The architecture of this deployment, piece by piece

*Teaching layer — live ops truth: [`deploy/README.md`](../README.md) (the runbook). Synced: `0cbaf72` (2026-08-21).*

[00](00-big-picture.md) walked the journey; [01](01-web-fundamentals.md)–[03](03-docker.md) taught the materials. This page assembles them: every running piece, what it does, how it talks to the others, and which ruling shaped it. After this page, `deploy/` should read like prose.

## The tenancy (the shape since the H1a cutover, 2026-08-21)

The box belongs to the **World Console hub**: ONE ingress Caddy — the hub repo's own compose project — owns 80/443 and every hostname, serves the apex pages (the game's public words moved home with the split), and routes each tenant by a *fragment*. This project is tenant #1: its blocks live here as `caddy/box-site.caddy`, the hub box serves a derived copy (`sites/gamemaster-bernd.caddy`), and its containers meet the hub caddy on the shared external `ingress` network. Landlord surfaces — front door, firewall singleton, box-level backup + pager — are the hub repo's; everything below is the game's own half.

## The service cast (what `docker compose ps` shows)

| Service | Image | Network(s) | Public? | Job |
|---|---|---|---|---|
| *(the hub's caddy — its own compose project)* | caddy 2.10.2 | ingress | **80/443** | TLS, apex + fragments, per-friend doors, prefix strip, basic auth |
| `waker` | node 24 slim | wake, ingress | no | start sleeping seats over the docker socket; waking/closed pages |
| `gateway` | node 24 slim | web | no | hold the org key; virtual keys; spend ledger; caps; ntfy pings |
| `wc-<name>` (one per friend) | world-console:latest | web, ingress | no | one friend's whole game: app server + pi + their volumes |
| `wc-template` | world-console:latest | web, ingress | no | the parked hardened shape friends `extends` (scale 0 — never runs) |
| *local profile:* `caddy-local`, `stub`, `wc-test` | — | — | 127.0.0.1:8443 | `localcheck.sh`'s production-shaped test rig; never on the box |

Supporting non-services: the systemd timers (§the night shift), the hub's DOCKER-USER firewall rules (its singleton; this repo's `firewall.sh` is solo-deployment spare), and the box-local state files (§the data model).

## Inside a seat

One friend = one container from the game image. Three programs matter inside:

**1. The app server** (`deploy/image/appserver/server.js`) — the container's single listener (port 7681, docker-internal). Its four jobs:

- **PTY bridge:** spawns pi inside a pseudo-terminal *on first attach* (an idle seat runs no game process), streams bytes ↔ browser over `/ws/term` ([01](01-web-fundamentals.md) §WebSockets). Spawns with `--continue` whenever a prior session exists — the reaper's stop and the waker's start are invisible to the story (a returning friend finds their sitting, not a blank console). `WC_MODEL` from the env pins the keeper's model.
- **Pane APIs:** `/api/tree` (the file listing), `/files/config/…` + `/files/data/…` (read-only file serving with a realpath jail — symlinks and `..` in any encoding answer 404), `/ws/events` (live file-change pushes from a chokidar watcher). The panes serve the *game folder only*; sessions and credentials aren't filtered out — they were never in scope (the boundary is scope, not filtering — 08's law).
- **Status:** `/healthz` reports `{pi, client, idleSeconds, shipper}` — the reaper's decision input and the rollout guard ("is someone at this console right now?"). `/api/grant` asks the gateway with the seat's own key and hands the browser *rounds only* — money and keys never reach the page.
- **Lifecycle seams:** on SIGTERM (any stop): hang up pi cleanly, then run the shipper's final tick inside the 30-second stop grace — **a stop is a seal**.

**2. The shipper** (`appserver/shipper.js`) — R13's recording half. At boot, every 10 minutes, at pi's exit, and at stop, it mirrors each play session (the JSONL + the chronicle folder it stamped) into the seat's own staging slice of the store (`/ship`, a bind mount of `staging/<name>` — the only store path the container can even see). Sealing writes a manifest (player, git rev, pi version, per-file sha256) and a `sealed` marker; sealed sessions are skipped until they *grow* (a resumed sitting re-earns its seal). Everything is an allowlist: `auth.json` is a sibling directory no glob here can reach.

**3. pi + the game** — the engine this whole repo is about (root `README.md`), with `.pi/extensions/gateway.ts` rerouting its model calls to the gateway whenever `WC_GATEWAY_URL` is set, and player mode (R30: `WC_PLAYER_UI=1` baked into the image) dressing the console for friends — banner, game footer only, the sixteen-command surface, submit-gate on everything else.

The browser side (`appserver/client/`) is one page, no framework: xterm.js draws the terminal; tabs/viewer/tree render the chronicle; a first-run notice (once per browser) carries the recording disclosure; everything uses relative URLs so it works identically behind the door's stripped prefix.

## The money lane

The problem: friends must play without any AI account, spending must be capped per friend and globally, and the maintainer's real key must never live where a friend's process could read it.

```
seat (virtual key wc-…, env) ──▶ gateway ──(org key, .env)──▶ Anthropic
                                   │
                     keys.json (grants)  usage.jsonl (append-only ledger)
```

- **Virtual keys** are made-up strings minted per friend into `gateway-state/keys.json` with a monthly budget (micro-USD; $10 placeholder) and a per-minute rate ceiling. The gateway re-reads the file *per request* — edits bind live, no restarts.
- The **gateway** (`deploy/host/gateway/gateway.js`, ~350 lines, no framework) accepts only `POST /v1/messages` (+ the `/side/` prefix for the game's side voices — tagged in the ledger so nightly reconciliation can subtract them), swaps the virtual key for the org key, streams the answer through untouched while a shadow parser reads the token usage, prices it from its own table (integers, micro-USD), appends the ledger row, and enforces in order: known key → global monthly **kill-switch** ($55≈€50 — the lane rests) → per-friend grant ($10/month — the keeper rests for them) → rate limit. Refusals are in-voice and friendly.
- **Tripwires ping ntfy** (daily $5.50≈€5 alarm; the kill-switch; a friend's grant running dry) — latched so a true condition pings once, and checked at boot too (a gateway waking into a breached line says so).
- **Reconciliation** (`reconcile.sh`, nightly): re-derives yesterday per player from *pi's own* cost stamps in the session files and compares meters within max(5%, $0.001). Two witnesses that must agree — the design answer to "is my own billing code lying to me?"

Custody chain, explicit: the **org key** exists in the box's root-600 `.env` and the password manager, nowhere else — never the repo, never an image, never a friend container, never the browser.

## The night shift (the control plane)

All ops are four small shell scripts on systemd timers, root-run, journal-logged, ntfy-wired ([02](02-linux-server.md) §systemd; [12](12-ntfy-push-notifications.md)):

| Time (UTC) | Unit | Script | Does |
|---|---|---|---|
| every 5 min | `gamemaster-bernd-reaper` | `reaper.sh` | stop seats idle ≥30 min (the stop seals; then a targeted sweep makes it certain); per-volume disk watch (2 GiB warn / 5 GiB alarm, *alarm-only by ruling*); one `docker stats` line |
| 04:17 | `gamemaster-bernd-store-sweep` | `store-sweep.sh` | sweep *stopped* seats' leftovers; verify every staged manifest hash; compact to `sessions/<player>/<sid>.tar.zst`; prune staged data (markers stay) |
| 04:47 | `gamemaster-bernd-reconcile` | `reconcile.sh` | the two-meter comparison above; red + ping on structural drift |
| 05:11 | `gamemaster-bernd-backup` | `backup.sh` | stage every volume as a tar; one encrypted borg archive (volumes + store + box-local state) to the Storage Box; `prune --keep-within 28d` + compact |
| ~05:12 | `gamemaster-bernd-heartbeat@` | — | **OnSuccess of the backup only**: the one green ping that vouches for the whole night |
| on any red | `gamemaster-bernd-alert@` | — | OnFailure of sweep/reconcile/backup: high-priority ntfy naming the failed unit |

(The hub's landlord lane runs earlier and separately: its backup 03:47, its ~03:52 heartbeat on its own topic — its runbook owns that ladder.)

Order is meaning: sweep before reconcile (settled sessions) before backup (the night's truth in one archive). `Persistent=true` on the nightly three means a rebooting box catches up its missed night.

## The data model (what exists, where, who may touch it)

| Data | Lives | Owner/mode | In backups? |
|---|---|---|---|
| worlds + chronicles | volume `data-<friend>` | player uid | ✔ (as tars) |
| play transcripts | volume `sessions-<friend>` | player uid | ✔ |
| TLS certs + ACME account | the HUB's `caddy-data`/`caddy-config` volumes | hub caddy | **✘ — the hub re-issues by design (its runbook §Backups)** |
| session archive (research record) | `/srv/gamemaster-bernd/store` | **root, 700** | ✔ |
| staging slices | `store/staging/<friend>` (bind → `/ship`) | player uid, 700 | ✔ (via store) |
| secrets: org key, ntfy topic, ACME email, address | `deploy/host/.env` | root, 600 | ✔ (recovery needs it) |
| grants + ledger | `deploy/host/gateway-state/` | uid 1001, 700 | ✔ |
| consent register | `deploy/host/consents.md` | box-local | ✔ |
| doors + friend services | `caddy/friends/*.caddy`, `compose.override.yaml` | box-local | ✔ |
| `auth.json` (pi credentials) | tmpfs inside each seat | — | **✘ by construction (R11)** |
| the encrypted archive | Storage Box `borg/worldconsole` | borg, repokey | is the backup |
| your mirror of it | dev `~/worldconsole-backups/` | you | — |

Full retrieval/removal recipes: [11-data-in-and-out.md](11-data-in-and-out.md).

## The friend lifecycle (pointers, not restatement — runbook owns each step)

1. **Invite** — `deploy/friend-intro.md` part one; a plain yes to both questions (recording consent + 18+, R13/R20).
2. **Record the yes** — one row in box-local `consents.md`. The mint *refuses* without it (the gate is code, not discipline).
3. **Mint** — `new-friend.sh <name>`: door snippet + override entry + staging slice + virtual key; prints the door and pair **once** — then `up -d` here, and the door goes live via the hub: cp the snippet to its `sites/friends/`, in-container validate, reload (the mint prints the exact steps; runbook §per-friend onboarding).
4. **Play** — everything above this line.
5. **Sleep/wake** — reaper stops idle seats; the waker answers the next knock; `--continue` resumes the sitting.
6. **Update** — `git pull → build.sh → up -d` (runbook §updates); volumes untouched, chronicles survive by construction; check `healthz` for a live player before rolling a seat mid-sitting.
7. **Pause/remove** — stop the seat, delete snippet + override lines; volumes stay.
8. **Erase** — runbook §deletion, the 8-step path (door, volumes, store, lane key + anonymized ledger, analysis mirror, consent row, backups-by-prune, reports edge). Dry-run green on production before the first friend.

## What runs where

| Machine | Runs |
|---|---|
| dev machine | the repo; `build.sh` + `verify.sh` + `localcheck.sh` (the pre-push gates); `pull-sessions.sh` (analysis) + `pull-backup.sh` (mirror); never caddy-with-real-certs, never friends |
| the box | everything in the service cast (the front door from the hub's clone, the rest from this repo's); the timers; the store; the box-local state |
| Storage Box | one borg repo — dumb encrypted storage, no compute |
| friend's browser | xterm.js + the panes — no game logic, no secrets beyond their own door |

## The rulings that shaped it (one line each — the registry entry is the truth)

| Ruling | One line |
|---|---|
| R1/R14 | the game is the streamed TUI; the web page frames it (three panes), never re-implements it; ttyd stays the fallback rung |
| R11 | credentials die with the container (tmpfs); the BYO-key doors + browser vault are on ice — house lane only |
| R12/R29 | operator-funded play through the gateway on the Anthropic org key (direct, prepaid), ledgered from turn one |
| R13 | sessions are research data: loud disclosure, consent-gated mint, allowlist shipper, EU store, month-bounded deletion |
| R17/R18 | worldconsole.eu at INWX; netcup Vienna box; Hetzner runner-up; backups cross-provider |
| R19/R16/R20 | Impressum address from box env only; names/first-use archived; 18+ asserted at invite |
| R30 | player mode: the console wears the world (banner, sixteen commands), the workshop stays hidden not deleted |

---

**Going deeper:** the exact per-request behavior → read `gateway.js` and `server.js` top comments (they are written as documentation) · every file's entry → [20-deploy-files-reference.md](20-deploy-files-reference.md) · verification of all of it → `verify.sh` (image, 5 legs) + `localcheck.sh` (the whole door, ~20 legs) — [10](10-operate-the-box.md) §gates.
