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

On the box (Debian stable assumed):

1. Base: `apt install docker.io docker-compose-v2 git` (or Docker's own repo), a non-root deploy user in the `docker` group, SSH keys only.
2. Clone the repo (read-only deploy key), `cd deploy/host`, write `.env` with `ACME_EMAIL=<a real mailbox>` (gitignored; the mail-on-domain ruling is still open — any working mailbox serves ACME).
3. Host hardening that makes R11's wipe real (02 item 2): core dumps off (`kernel.core_pattern=|/bin/false` + `* hard core 0`), **no swap** (netcup images ship none — verify with `swapon --show`; if any exists, `swapoff -a` and remove from fstab, or encrypt it).
4. `deploy/host/firewall.sh` — after docker is up; persist it (a oneshot systemd unit `After=docker.service`, or iptables-persistent). Verify from inside a container: `docker run --rm world-console:latest node -e "fetch('http://192.168.1.1',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"` (drop = timeout = pass; a reply = the block is not standing).
5. `deploy/image/build.sh` on the box, then `docker compose up -d caddy`.
6. **The eyeball sitting** (closes 02 items 3–4's browser half): mint a door for yourself, open it in Firefox and one Chromium-family browser, play a short real sitting. Check: dice overlay dress and space-to-cast, the four-slot board's red urgency, the bell, media announcements, `/pick` and `/roll` as the guaranteed paths where Alt+number is browser-bound (Firefox on Linux switches tabs — expected, not a bug).

## Per-friend onboarding

**Gate first (02 items 9–11):** before the *first* friend plays, the disclosure + consent + 18+ assertion (R13/R20), the shipper (R13), and the friend intro with the LICENSE line (R3) must be live — those are their own build rounds, and this runbook refuses to pretend otherwise.

```bash
deploy/host/new-friend.sh alice        # mints token + basic-auth pair
# paste the three printed blocks into Caddyfile / compose.yaml, then:
docker compose up -d wc-alice
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
# send the printed door + pair to alice out of band, once
```

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
| Purchases (domain, box, AVV) | open — maintainer errand |
| First deploy + eyeball sitting | waits on purchases |
| App server & panes (02 item 5, R14) | next build round |
| Vault, house lane, shipper, disclosure, intro (items 6–11) | own rounds; R11/R12 rulings pending |
| Idle reaper, disk quotas (item 12) | with the app-server round (stop = wipe + seal) |
