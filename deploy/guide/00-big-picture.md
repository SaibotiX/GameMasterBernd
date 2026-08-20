# 00 — The big picture: the journey of one visit

*Teaching layer — live ops truth: [`deploy/README.md`](../README.md). Synced: `d700c6e` (2026-08-20).*

Before any detail, hold the whole thing once. This page walks a single real event — a friend opening their door and playing one turn — and names every machine and program that touches it. Each step points at the page that explains it properly.

## The cast

Six machines, three of them yours:

| Machine | What it is | Who pays |
|---|---|---|
| **The friend's browser** | any laptop with Firefox/Chrome — nothing installed | them |
| **The DNS system** | the phone book that turns `play.worldconsole.eu` into an IP address; records live at INWX (the registrar, per R17) | ~€9/yr domain |
| **The box** | a rented always-on Linux computer (netcup VPS, Vienna — R18): Debian, Docker, and everything below runs here | ~€6/mo |
| **Anthropic's API** | the model answering as the keeper; reached only by the gateway | per token (the lane) |
| **The Storage Box** | a rented disk at Hetzner (a *different* company than the box, on purpose) holding encrypted backups | ~€4/mo |
| **The dev machine** | your computer: the repo, builds, checks; and your phone, ringing when something breaks (ntfy) | — |

## The journey, step by step

A friend clicks their private link:

```
https://play.worldconsole.eu/f/<their-30-char-secret>/
```

**1. Name → address (DNS).** The browser asks the DNS system "what is `play.worldconsole.eu`?" and gets back the box's IP address (`152.53.51.13`, plus an IPv6 twin). You created those A/AAAA records once at INWX; nothing on the box is involved yet. *(→ [01](01-web-fundamentals.md) §DNS)*

**2. Connection + encryption (TCP, then TLS).** The browser opens a connection to that IP on **port 443** — the agreed number for encrypted web traffic — and performs a TLS handshake. The box proves it really is `play.worldconsole.eu` with a **certificate** from Let's Encrypt, and everything after this line is encrypted. Nobody set this certificate up by hand: Caddy obtained and renews it automatically. *(→ [01](01-web-fundamentals.md) §TLS)*

**3. The front door (Caddy, the reverse proxy).** The first program to see the request is **Caddy**, running as a Docker container and holding ports 80/443 for the whole box. It looks at the requested hostname and path:
- `worldconsole.eu` → serve the static landing/legal pages from a folder.
- `play.worldconsole.eu/f/<secret>/…` → this friend's block (a per-friend snippet file): demand the **username/password pair** (HTTP basic auth), strip the secret prefix, and forward the request inward. A wrong path or no auth gets a bare 404/401 — there is no directory of doors to browse. *(→ [01](01-web-fundamentals.md) §Reverse proxies, [04](04-architecture-of-this-deployment.md))*

**4. The seat (the friend's own container).** The request lands on port 7681 of `wc-<name>` — one hardened Docker container per friend, all built from the same image, each with its own private disk volumes. If the container is **asleep** (stopped for idleness), the dial fails and Caddy falls through to the **waker**, which serves a "the console is waking" page and starts the container by name; the next refresh finds it running. *(→ [03](03-docker.md), [04](04-architecture-of-this-deployment.md) §the seats)*

**5. The page and the stream (the app server).** Inside the container a small Node program — the **app server** — answers: it serves the one-page client (terminal + chronicle viewer + file tree), then the page opens a **WebSocket** back to it: a two-way pipe that stays open. On the first attach the app server spawns **pi** (the game engine) inside a pseudo-terminal and pipes its live screen bytes to the browser, where **xterm.js** draws a real terminal. Keystrokes flow the other way. The game is *not* rewritten for the web — the actual TUI is streamed, dice overlay and all (decision R14). *(→ [01](01-web-fundamentals.md) §WebSockets, [04](04-architecture-of-this-deployment.md) §inside a seat)*

**6. The turn (the house lane).** The friend types an action. pi needs the model, but the container holds no real API key — only a **virtual key**. A three-line extension points pi at the **gateway**, another small container on the box: it checks the virtual key's monthly grant, forwards the request upstream with the **org key** (which only it holds), streams the answer back, and appends what the turn cost to its ledger file. If the friend's grant is spent, or the global monthly kill-switch has tripped, the keeper politely rests instead. *(→ [04](04-architecture-of-this-deployment.md) §the money lane)*

**7. The record (chronicle + session).** As play happens, pi writes the story into markdown files (the chronicle, on the friend's data volume) and the full transcript into a session file. The page's side panes show the chronicle live — a file watcher pushes every change over a second WebSocket. *(→ [11](11-data-in-and-out.md))*

**8. After the friend leaves (the night shift).** No human does anything; four scheduled jobs (systemd timers) run:
- **the reaper** (every 5 min): a seat 30 minutes without a connected browser is stopped — the stop itself triggers a clean shutdown in which the session is *sealed* and shipped to the store;
- **store-sweep** (04:17): catches anything unsealed, verifies file hashes, compacts sessions into the private store;
- **reconcile** (04:47): re-derives yesterday's spend from pi's own cost stamps and compares it to the gateway's ledger — disagreement turns the unit red;
- **backup** (05:11): stages every volume plus the store plus the box-local state into one **encrypted borg archive** on the Hetzner Storage Box, then prunes archives older than 28 days (which is how "deleted within a month" is *structurally* true).

Any of the nightly three failing **rings your phone** via ntfy; the backup succeeding sends the one green **heartbeat** (~05:14) that vouches for the whole chain. A silent morning means: look. *(→ [02](02-linux-server.md) §systemd, [11](11-data-in-and-out.md) §backups, [12](12-ntfy-push-notifications.md))*

## The whole system in one diagram

```
                friend's browser                     your phone
                 │  HTTPS + WebSocket                    ▲ ntfy pings
                 ▼                                       │
        ┌─ DNS: play.worldconsole.eu → 152.53.51.13 ─┐   │
        │                                            │   │
════════╪═ THE BOX (netcup VPS, Debian + Docker) ════╪═══╪══════════════════
        ▼                                            │   │
   ┌──────────┐  :80/:443 (the only published ports) │   │
   │  caddy   │── worldconsole.eu → static site      │   │
   │ (proxy,  │── vault.…  → reserved 404            │   │
   │  TLS)    │── play.…/f/<secret>/ + basic auth ─┐ │   │
   └───┬──────┘                                    │ │   │
       │ docker network "wake"     docker network "web"  │
   ┌───▼──────┐                    ┌───────────────▼─────┴───┐
   │  waker   │ starts sleeping →  │  wc-<friend>  (one per   │
   │ (docker  │    containers      │  friend): app server ↔   │
   │  socket) │                    │  pi + game; volumes:     │
   └──────────┘                    │  data-<f>, sessions-<f>; │
                                   │  auth dir = tmpfs (R11)  │
   systemd timers (the night):     └───────────┬─────────────┘
     reaper */5 ── stop idle, seal             │ virtual key
     sweep 04:17 ─ verify+compact ─┐   ┌───────▼────────┐
     reconcile 04:47 ─ two meters  │   │    gateway     │── org key ──▶ Anthropic
     backup 05:11 ── borg ──┐      │   │ (ledger, caps) │               API
                            │      ▼   └────────────────┘
                            │   /srv/worldconsole/store  (root-only sessions)
════════════════════════════╪═══════════════════════════════════════════════
                            ▼
              Hetzner Storage Box (encrypted borg repo,
              28-day window)  ←── monthly-ish pull ── dev machine mirror
```

## Three planes to think in

Every serious deployment separates into three planes; naming them makes troubleshooting calmer:

- **Serving plane** — what answers users right now: Caddy, the seats, the gateway, the waker. Symptom of trouble: a friend says "it's down". Tools: `docker compose ps`, container logs, `curl` from outside.
- **Control plane** — what operates the system: systemd timers, the shell scripts they run, `new-friend.sh`, the update path. Symptom: a red ntfy ping, a silent heartbeat. Tools: `systemctl`, `journalctl`.
- **Data plane** — what must never be lost: volumes (chronicles), the store (research record), the box-local state (consents, keys, ledger), the backups. Symptom you must never have: discovering a backup doesn't restore. That is why the restore drill exists and gates invites.

## Where everything lives

| Place | Holds | In git? |
|---|---|---|
| repo `deploy/image/` | how to build the game image (Dockerfile, app server, checks) | yes |
| repo `deploy/host/` | how the box runs (compose, Caddyfile, scripts, systemd units) | yes |
| box `/home/deploy/world-console` | the clone of this repo the box runs from | yes (a checkout) |
| box `deploy/host/` **gitignored extras** | `.env` (secrets) · `consents.md` · `gateway-state/` · `caddy/friends/*.caddy` · `compose.override.yaml` · `first-use/` | **no — box-local, only in backups** |
| box Docker volumes | `data-<friend>` (worlds/chronicles) · `sessions-<friend>` · caddy's certs | no — volumes, in backups |
| box `/srv/worldconsole/store` | the compacted session archive (root-only) | no — in backups |
| Storage Box `borg/worldconsole` | the encrypted nightly archive of all of the above | no |
| dev machine `~/worldconsole-backups` | your pulled mirror of that archive | no |

The deep version of this table, with every path: [11-data-in-and-out.md](11-data-in-and-out.md).
