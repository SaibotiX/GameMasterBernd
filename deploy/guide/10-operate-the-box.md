# 10 — Operating the box: connect, look, change, fix

*How-to. Step recipes for onboarding/deletion/backups stay owned by [`deploy/README.md`](../README.md) — this page teaches the surrounding craft and points there. Synced: `0cbaf72` (2026-08-21).*

## Connect

```bash
# on: dev machine
ssh -i ~/.ssh/worldconsole deploy@152.53.51.13    # day-to-day: pull, build, compose
ssh -i ~/.ssh/worldconsole root@152.53.51.13      # store, backups, timers, .env
```

Who does what (learned split, runbook first-deploy note): **deploy** for everything git/compose (as root, git's safe.directory guard trips); **root** for `/srv/gamemaster-bernd`, systemd units, and reading `.env`. TWO clones live side by side since the cutover — this repo at `/home/deploy/gamemaster-bernd` (the game) and the hub's at `/home/deploy/world-console` (the front door). The game's compose commands run from this repo's `deploy/host/`:

```bash
# on: box (as deploy)
cd ~/gamemaster-bernd/deploy/host
```

## First orientation — the ten-minute tour

Run these to *see* the system; none of them change anything:

```bash
# on: box (as deploy)
docker compose ps                                  # the game's cast, states, health
docker compose -f ~/world-console/deploy/host/compose.yaml ps   # the hub's (caddy Up?)
docker stats --no-stream                           # live cpu/mem per container
docker volume ls | grep gamemaster-bernd           # every friend's data at a glance
df -h /                                            # disk headroom (holiday watch saw 4%)
```

```bash
# on: box (as root)
systemctl list-timers 'gamemaster-bernd-*'         # the night shift: last + next runs
systemctl --failed                                 # anything red right now?
iptables -S DOCKER-USER                            # the egress block, standing?
swapon --show                                      # must print nothing (hardening)
```

## Reading state and logs

**Service logs** (serving plane) live with Docker; **job logs** (control plane) live in the journal:

```bash
# on: box (as deploy) — services (this repo's deploy/host/)
docker compose logs -f --tail 100 gateway          # turns, refusals, pings
docker compose logs --tail 50 wc-tobias            # one seat's app server (JSON lines)
# the front door's logs live with the HUB:
cd ~/world-console/deploy/host && docker compose logs -f --tail 100 caddy
```

```bash
# on: box (as root) — timered jobs
journalctl -u gamemaster-bernd-reaper.service --since today
journalctl -u gamemaster-bernd-store-sweep.service -n 50
journalctl -u gamemaster-bernd-reconcile.service -n 50
journalctl -u gamemaster-bernd-backup.service -n 50
```

**A seat's health, from inside** (no published ports — ask through the container's own node):

```bash
# on: box (as deploy)
docker compose exec -T wc-tobias node -e 'fetch("http://127.0.0.1:7681/healthz").then(r=>r.text()).then(console.log)'
# → {"ok":true,"pi":false,"client":false,"idleSeconds":812,"shipper":{…}}
```

`client:true` means someone is at that console **right now** — the datum that gates restarts and rollouts.

**The lane's whole table** (every grant, spend, the caps):

```bash
# on: box (as deploy)
docker compose exec -T gateway node -e 'fetch("http://127.0.0.1:4100/healthz").then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))'
```

**The door from outside** — the only vantage that proves what a friend sees:

```bash
# on: dev machine (or box)
curl -sI https://worldconsole.eu            # 200, Let's Encrypt issuer
curl -sI https://play.worldconsole.eu       # 404 "by invitation" — correct for strangers
```

## Changing things — the one true update path

Everything player-visible changes the same way: **commit on the dev machine → verify → push → pull on the box → rebuild → roll.** Never edit tracked files on the box (the tree there stays clean so pulls never conflict; box-local state has its own gitignored homes).

```bash
# on: dev machine — the gates before anything ships
deploy/image/build.sh && deploy/image/verify.sh    # image + its five probe legs
deploy/host/localcheck.sh                          # the whole production-shaped door locally
git push
```

```bash
# on: box (as deploy)
cd ~/gamemaster-bernd && git pull
deploy/image/build.sh                              # image from the pulled HEAD
docker compose up -d                               # recreates exactly what changed
```

Care around live players: recreating a seat drops its connection (play resumes via `--continue`, but it's rude mid-sitting). The practiced pattern from the `/worlds` rollout: check each seat's `healthz` first and roll only client-less seats; a held seat rolls at its next natural stop.

**Door change** (`box-site.caddy`, a friend snippet): no rebuild — the door serves from the HUB's caddy, so the derived copy is re-landed there and validated **before** any reload, never after:

```bash
# on: box (as deploy) — e.g. after a box-site.caddy change arrived by pull
cp ~/gamemaster-bernd/deploy/host/caddy/box-site.caddy ~/world-console/deploy/host/caddy/sites/gamemaster-bernd.caddy
cd ~/world-console/deploy/host
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile   # NEVER skip
docker compose exec caddy caddy reload   --config /etc/caddy/Caddyfile
```

(A bad fragment past validate would take every tenant's doors down with the reload — the validate-first law is the hub's §Tenants rule, and localcheck's fragment leg is its dev twin.) Two standing scars: caddy mounts the `caddy/` *directory* (a single-file bind pins the inode — edits invisibly stop arriving), and the gateway's `gateway.js` *is* a single-file bind by choice — after editing it, `docker compose up -d --force-recreate gateway`, not a reload.

**systemd unit change:** units run from `/etc/systemd/system/`, masters live in git —

```bash
# on: box (as root)
cp /home/deploy/gamemaster-bernd/deploy/host/systemd/gamemaster-bernd-<name>.{service,timer} /etc/systemd/system/
systemctl daemon-reload
```

**Engine pin change (`PI_VERSION`)**: never casual — the full upgrade rite first (`research/design/pi-upgrades.md`).

## Managing friends and the lane

Mint / pause / remove / erase: **runbook** §per-friend onboarding and §deletion own the steps. Around them:

```bash
# on: box (as deploy) — a friend's remaining grant, as the strip shows it
docker compose exec -T wc-jakob node -e 'fetch("http://gateway:4100/grant",{headers:{"x-api-key":process.env.ANTHROPIC_API_KEY}}).then(r=>r.json()).then(console.log)'
```

**Top up / change a grant:** edit the budget in `gateway-state/keys.json` (root; keep the file's shape) — the gateway re-reads per request, no restart:

```bash
# on: box (as root) — example: raise jakob to $15/month (micro-USD)
docker run --rm --user 0 -v /home/deploy/gamemaster-bernd/deploy/host/gateway-state:/d world-console:latest node -e '
  const fs=require("fs"); const k=JSON.parse(fs.readFileSync("/d/keys.json","utf8"));
  for (const v of Object.values(k)) if (v.player==="jakob") v.budgetMicro=15000000;
  fs.writeFileSync("/d/keys.json", JSON.stringify(k,null,"\t")+"\n");'
```

**Flip a seat's world before first sitting:** uncomment `WORLD_CONSOLE_WORLD` in that friend's override block, `docker compose up -d wc-<name>` (runbook §next-round notes; after the first tale, `/worlds` in-game owns the choice).

## Timers: run one now, read its verdict

```bash
# on: box (as root) — manual run (identical to the timer firing)
systemctl start gamemaster-bernd-store-sweep.service
journalctl -u gamemaster-bernd-store-sweep.service -n 30    # its verdict
```

A unit is **red** when its script exited non-zero — which is exactly when `gamemaster-bernd-alert@` rings ntfy. After fixing the cause, `systemctl start` it again and watch it go green; the pager's heartbeat resumes on its own.

## Certificates and DNS

Nothing to renew by hand — Caddy re-issues around 30 days before expiry. The standing check:

```bash
# on: dev machine (or box)
echo | openssl s_client -connect play.worldconsole.eu:443 2>/dev/null | openssl x509 -noout -dates
```

If expiry is ever near without renewal: caddy's logs tell why (`docker compose logs caddy | grep -i acme` — in the HUB's `deploy/host/`, which owns certs and ACME since H1a) — port 80 blocked and DNS changes are the classic causes. DNS records themselves: INWX web console (A/AAAA for apex, `play.`, `vault.` → the box, per R17 — plain, unproxied).

## Firewall

The chain is the HUB's singleton since H1a — its script, its unit (tenants ship no firewall unit; this repo's `firewall.sh` is the solo-deployment spare):

```bash
# on: box (as root) — inspect, and re-apply after any docker network surgery
iptables -S DOCKER-USER
/home/deploy/world-console/deploy/host/firewall.sh
```

Persistence is the hub's `world-console-firewall.service` (oneshot, after docker) — check it's enabled: `systemctl is-enabled world-console-firewall.service`. The honest verification (a container timing out against the private net) is in [02](02-linux-server.md) §firewall.

## Troubleshooting ladder — "it's down"

Walk down; stop at the first floor that fails.

1. **Is the box alive?** `ssh` in. No SSH + no heartbeat this morning → provider status page / netcup console (reboot from there if truly wedged). *A dead box is silent — the missing heartbeats ARE the signal (both lanes: the hub's ~03:52 and the game's ~05:12; the pager's named residue: no watcher lives off the box).*
2. **Is caddy up and answering locally?** The front door is the hub's:
   ```bash
   # on: box (as deploy)
   cd ~/world-console/deploy/host
   docker compose ps caddy && curl -skI https://127.0.0.1 -H 'Host: worldconsole.eu'
   ```
   Down/crash-looping → `docker compose logs --tail 50 caddy` there (an empty `ACME_EMAIL` in the hub's `.env` is the recorded quiet-crash-loop cause).
3. **Is it just one door?** The friend's seat (this repo's `deploy/host/`): `docker compose ps wc-<name>`, then its healthz (above). A *stopped* seat is normal (the reaper) — the waker should serve "waking" and start it; if the waking page never resolves: `docker compose logs waker` (is it running? does the socket answer?), and `docker start gamemaster-bernd-wc-<name>-1` as the manual override.
4. **Seat runs but the page is broken?** App-server logs (JSON events: `pi-spawn`, `client-connect`, `http-error`). The nuclear-but-safe rung: the **ttyd fallback** — override the seat's `command:` per the Dockerfile's CMD note, `up -d` that seat; the game stays playable in a bare terminal while you debug the app server (R14 keeps this rung tested — verify leg 4).
5. **Turns fail but pages load?** The lane: gateway logs (upstream 502s? refusals?), the gateway healthz table (kill-switch tripped? grant spent?), then Anthropic's status page. A resting lane is by design — it reopens at month's turn or by a raised cap in `keys.json`/`.env`.
6. **Weird DNS/network results from the dev machine?** Trust the box's vantage first: the dev machine's own external DNS is refused and v6 egress is broken (standing quirk) — run the same check from the box before concluding anything about production.

## The safety rails (what NOT to do)

- Don't edit tracked files on the box; don't commit from the box. The box pulls; the dev machine pushes.
- Don't `docker compose down -v`, `docker volume rm`, or `docker volume prune` outside the runbook's §deletion path — volumes are chronicles.
- Don't put secrets anywhere but the box `.env` / `gateway-state/` (both root-guarded, both backed up, both gitignored).
- Don't restart a seat with `client:true` unless the friend knows.
- Don't hand-edit borg archives — retention *is* the deletion mechanism (28-day window, snapshots off).
- Before anything sweeping: run `pull-backup.sh` on the dev machine (by day, never during the 05:11–05:20 borg window).
