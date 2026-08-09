# deploy/ — the stage-1 machinery

The buildable half of [02-friends-web-service.md](../research/roadmap/02-friends-web-service.md)'s checklist: the per-friend image (`image/`) and the host stack (`host/`). Law lives in the roadmap — 02 for architecture and auth, [08](../research/roadmap/08-stage1-web-ui.md) for the page, the R registry for every ruling; this file is the runbook: what to type, in which order, and what each step proves. Nothing in `deploy/` ever enters the image's game folder (the whitelist in `image/build.sh` is the whole list).

## The local loop (this machine, no purchases needed)

```bash
deploy/image/build.sh          # image from a git-archive whitelist of HEAD
deploy/image/verify.sh         # in-container: unit gate + three lenses live,
                               # pseudo-TTY probe, ttyd WebSocket probe —
                               # all in the production read-only shape
deploy/host/localcheck.sh      # the whole door, production-shaped: TLS,
                               # secret path, basic auth, proxied WebSocket,
                               # hardened friend container
```

Both verify scripts fail loudly; green means what the headers say and nothing more. What no script can prove: how the TUI's dress *looks* in a real browser — that is the first-deploy eyeball sitting below.

## First deploy (after the errands)

Prerequisites, all maintainer errands (rulings R17/R18 name them): **worldconsole.eu** registered at INWX with A/AAAA records for `worldconsole.eu`, `play.` and `vault.` pointing at the box, DNS plain and unproxied; the **netcup VPS 500 G12 Vienna** on hourly billing, **click-AVV signed day 1**; the Hetzner runner-up account created and verified before it is ever needed.

*(State 2026-08-08, night: **the deploy stands** — steps 1–5 green on Debian 13 (docker 26.1.5, compose 2.26.1; `deploy` user, sshd keys-only, no core dumps, no swap, DOCKER-USER persisted via `worldconsole-firewall.service`); three hosts live under Let's Encrypt, AAAA rows live at INWX and propagated, deploy key pasted — **the box pulls on its own key**. Three landmines found and fixed en route, each its own commit: firewall drops learned container-origin scoping (`a0e6157`), the mint's urandom pipes got bounded input (`a398e69`), caddy mounts the `caddy/` directory instead of a pinned single-file inode (`e99885b`). The maintainer's own door is minted and green from outside (401 bare / 200 authed, ttyd page; `wc-tobias` healthy; pair handed out of band). Since 2026-08-09 friend state is box-local and gitignored — `caddy/friends/tobias.caddy` + `compose.override.yaml` — and the box's tracked tree is CLEAN: pulls need no stash dance. Access: `ssh -i ~/.ssh/worldconsole root@152.53.51.13` (root or `deploy@`); clone at `/home/deploy/world-console`. **Closed 2026-08-09:** the eyeball sitting ran green — Firefox and a Chromium-family browser, dress, space-to-cast, board urgency, bell, media announcements and the `/pick`/`/roll` paths all as expected. The external-vantage IPv6 check is **on ice** (maintainer's call, 2026-08-09): parked here, its owning note — revisit at the next natural v6 vantage (a new PC, a phone-on-mobile-data moment) or on the first report of an unreachable door; proven on-box, and browsers' happy-eyeballs fall back to v4 regardless. The first-deploy round is complete.)*

On the box (Debian stable assumed):

1. Base: `apt install docker.io docker-compose-v2 git` (or Docker's own repo), a non-root deploy user in the `docker` group, SSH keys only.
2. Clone the repo (read-only deploy key), `cd deploy/host`, write `.env` with `ACME_EMAIL=<a real mailbox>` (gitignored; the mail-on-domain ruling is still open — any working mailbox serves ACME).
3. Host hardening that makes R11's wipe real (02 item 2): core dumps off (`kernel.core_pattern=|/bin/false` + `* hard core 0`), **no swap** (netcup images ship none — verify with `swapon --show`; if any exists, `swapoff -a` and remove from fstab, or encrypt it).
4. `deploy/host/firewall.sh` — after docker is up; persist it (a oneshot systemd unit `After=docker.service`, or iptables-persistent). Verify from inside a container: `docker run --rm world-console:latest node -e "fetch('http://192.168.1.1',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"` (drop = timeout = pass; a reply = the block is not standing).
5. `deploy/image/build.sh` on the box, then `docker compose up -d caddy`. Prove the door from *outside*: `curl -sI https://worldconsole.eu` (and `play.`/`vault.`) — 200/404 under a Let's Encrypt issuer. The in-container egress probe cannot see an inbound break; the first deploy learned that the hard way.
6. **The eyeball sitting** (closes 02 items 3–4's browser half): mint a door for yourself, open it in Firefox and one Chromium-family browser, play a short real sitting. Check: dice overlay dress and space-to-cast, the four-slot board's red urgency, the bell, media announcements, `/pick` and `/roll` as the guaranteed paths where Alt+number is browser-bound (Firefox on Linux switches tabs — expected, not a bug).

## Per-friend onboarding

**Gate first (02 items 9–11):** before the *first* friend plays, the disclosure + consent + 18+ assertion (R13/R20), the shipper (R13), and the friend intro with the LICENSE line (R3) must be live — those are their own build rounds, and this runbook refuses to pretend otherwise.

```bash
deploy/host/new-friend.sh alice        # mints the pair AND writes the files
docker compose up -d wc-alice
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
# send the printed door + pair to alice out of band, once
```

Friend state is box-local and gitignored — `caddy/friends/<name>.caddy` (imported by the play site block) plus `compose.override.yaml` (auto-merged; each friend `extends` the tracked `wc-template`) — so the tracked tree never carries a friend and `git pull` never needs a stash dance. Removing a friend: `docker compose down wc-<name>`, delete the snippet and the override lines; the volumes stay until R11's wipe rules say otherwise.

## Updates (the path that cannot destroy a chronicle)

```bash
git pull
deploy/image/build.sh
docker compose up -d               # recreates changed friend containers
```

Named volumes (`data-*`, `sessions-*`) are untouched by recreation; chronicles survive by construction. A **pi version change is never an update** — it is an upgrade and takes the full rite ([pi-upgrades.md](../research/design/pi-upgrades.md)) before the new pin builds anyone's container.

## Backups (02 item 13; shape ruled in R18)

Nightly, to a *different provider* (Hetzner Storage Box as the borg target) plus the periodic pull to the maintainer's machine. `auth.json` is excluded **by construction**: it lives on the tmpfs agent dir, never inside any volume, so a volume backup cannot contain it.

```bash
# per named volume, e.g. data-alice, sessions-alice, caddy-data:
docker run --rm -v data-alice:/v:ro -v /backup/staging:/out world-console:latest \
  tar czf /out/data-alice.tar.gz -C /v .
# then borg create onto the Storage Box; restore test = tar back into a
# scratch volume and boot a scratch container against it (exit gate: proven
# once before the first friend, again per the stage-2 gates)
```

The central session store (R13's shipper, its own round) backs up separately — it is the research record, not a play volume.

## Status (kept honest, updated per round)

| Piece | State |
|---|---|
| Image + in-container verify | built & green on this machine (2026-08-08) |
| Host stack + local door check | built & green on this machine (2026-08-08) |
| Purchases (domain, box, AVV) | done (2026-08-08) — worldconsole.eu at INWX, netcup Vienna box, click-AVV concluded |
| First deploy + eyeball sitting | done (2026-08-09) — deploy 2026-08-08, eyeball green in both browser families; v6 vantage check on ice (§first-deploy state note) |
| App server & panes (02 item 5, R14) | next build round |
| Vault, house lane, shipper, disclosure, intro (items 6–11) | own rounds; R11/R12 rulings pending |
| Idle reaper, disk quotas (item 12) | with the app-server round (stop = wipe + seal) |
