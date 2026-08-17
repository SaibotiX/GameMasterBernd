# 02 — A Linux server: the rented computer and how you hold it

*Teaching layer — live ops truth: [`deploy/README.md`](../README.md). Synced: `4ba34eb` (2026-08-17).*

The box is a plain Debian Linux machine you rent by the month and administer entirely over SSH. This page is the operating knowledge: how to get in, who you are once inside, where things live, how work is scheduled, where the truth is written down (logs), and what "hardening" concretely means.

## What a VPS is

A **VPS** (virtual private server) is a slice of a real machine in a datacenter, sold as if it were a whole computer: your own Linux install, root access, public IP, always on. The box is a **netcup VPS 500 G12** in Vienna — 2 vCPU, 4 GB RAM, 128 GB NVMe, ~€6/month (decision R18, with Hetzner as the named runner-up and the reasons for both in the research log). For scale: that comfortably runs Caddy + gateway + waker + a handful of friend containers at ~150–400 MB each (the 02 spec's sizing).

What the provider gives you is *only* the machine and the network. Backups, monitoring, security, DNS — yours. That is why this project's backup target is at a *different* provider (the Strasbourg-datacenter-fire lesson: same-provider backups burn with the originals), and why the pager exists.

## SSH — the admin door

**SSH** gives you an encrypted terminal on the remote machine. Everything you ever do on the box happens through it.

```bash
# on: dev machine — the two identities on the box
ssh -i ~/.ssh/worldconsole root@152.53.51.13      # root: owns store, backups, timers
ssh -i ~/.ssh/worldconsole deploy@152.53.51.13    # deploy: pulls, builds, composes
```

**Keys, not passwords.** An SSH key pair is two files: a private key (`~/.ssh/worldconsole` — stays on your machine, is never sent anywhere) and a public key (`.pub` — copied to the server into `~/.ssh/authorized_keys`). Login is a cryptographic proof of holding the private key; there is no password to guess, and the box's sshd accepts keys **only**. Make a new pair anytime with:

```bash
# on: dev machine
ssh-keygen -t ed25519 -f ~/.ssh/<name> -C "<what this key is for>"
```

`ed25519` is the modern default algorithm. One key per *purpose* (this project uses: `worldconsole` for the box, a dedicated read-only *deploy key* so the box can `git pull`, and the box's own `storagebox_ed25519` for backups) — so any single key can be revoked without collateral.

**Convenience and reach:**

- `~/.ssh/config` on your machine can alias hosts (name, user, key, port) so `ssh wc-box` works — optional; the runbook writes commands long-form so they're copy-paste-true anywhere.
- **ProxyJump** tunnels through one host to reach another: `ssh -o ProxyJump=root@152.53.51.13 …` connects to a target *via* the box, and the box does the DNS resolving. `pull-backup.sh` uses exactly this because the dev machine's own external DNS is broken — a live example of routing around a local quirk instead of fighting it.
- **Copying files:** `scp <local> <user>@<host>:<path>` for one-offs; `rsync -az --delete <src> <dst>` for trees you mirror repeatedly (used by the backup pull and the session pull — `--delete` makes the mirror forget what the source deleted, which here is a *privacy feature*: deletions propagate).

**Host keys — the other direction of trust.** The first time you connect somewhere, SSH shows the server's fingerprint and records it in `~/.ssh/known_hosts`; afterwards a *changed* fingerprint is loudly refused (someone may be impersonating the server). For the Storage Box the fingerprints were verified against Hetzner's published list rather than blind-accepted, and `StrictHostKeyChecking=yes` makes scripts refuse rather than prompt — the correct setting for anything unattended.

## Users, root, and permissions

Linux is multi-user to its bones, and this deployment uses that as an architectural tool.

- **root** is the all-powerful account. The box deliberately splits duties: **`deploy`** (a normal user in the `docker` group) does everything git- and compose-shaped; **root** owns what must be beyond the app's blast radius — the session store, the backup credentials, the systemd units. The split was *learned*, not decreed: running the git pull as root trips git's `safe.directory` guard against operating on another user's checkout (runbook, ops-split note).
- **uid/gid** are the numbers behind user names. Inside the game image there is one user, `player`, **uid 1001** — and that number, not the name, is what matters at every volume boundary: the gateway runs as `1001` so it can write its state bind; `new-friend.sh` chowns each staging slice to `1001` *before* the bind mounts it (Docker would otherwise auto-create it root-owned, and the shipper inside could never write — a real found-the-hard-way bug).
- **File modes** are three permission triads — owner / group / others, each read-write-execute. You'll mostly meet them as octal: `700` (only the owner may even look — the store, `gateway-state/`), `600` (owner read/write, a secrets file — the box `.env`, the borg passphrase), `755`/`644` (world-readable program/file). Two commands rule them: `chmod <mode> <path>`, `chown <user>:<group> <path>`.
- **The execute bit is real:** a script copied without `+x` cannot be run by a timer — a one-line commit in this repo's history (`227edb7`) exists because the backup script landed as `644`. `chmod +x` is the fix; the lesson is *the timer's first dry run is part of the deploy*.

## The filesystem — where things go and why

Linux has one tree rooted at `/`. The conventions this project actually uses:

| Path | Convention | Here |
|---|---|---|
| `/home/<user>` | each user's own files | `/home/deploy/world-console` — the repo clone the box runs from |
| `/srv` | data *served* by this machine | `/srv/worldconsole/store` (sessions), `…/backup-staging` |
| `/etc` | system configuration | `/etc/systemd/system/worldconsole-*` — the installed units |
| `/var/lib/docker` | Docker's own world | images, and every named volume's real files |
| `/root` | root's home | the borg passphrase + key export, the Storage Box SSH key |
| `/tmp` | scratch, wiped on reboot | (in containers: a tmpfs — see hardening) |

A **tmpfs** is a filesystem that lives in RAM only — nothing survives a stop. This project uses that *as a guarantee*: the game's credential directory (`~/.pi/agent`) is a tmpfs in every seat, so `auth.json` structurally cannot persist or be backed up (R11). Erasure by construction beats erasure by policy.

## systemd — services, timers, and the journal

**systemd** is the program that starts and supervises everything on a modern Linux box. You interact with it constantly; it repays understanding.

**Units** are its objects, defined in small INI files. The kinds used here:

- A **service** (`.service`) describes something to run — either long-running or, with `Type=oneshot`, a script that runs and exits (all of this project's are oneshots wrapped around `deploy/host/*.sh`).
- A **timer** (`.timer`) schedules a same-named service. Compared to classic cron, timers give you: `Persistent=true` (a missed run — box was rebooting at 05:11 — happens at the next boot instead of silently skipping), `RandomizedDelaySec` (spreads load), logs in the journal, and `systemctl list-timers` showing exactly when things last ran and will next run.
- A **template** (`name@.service`) is a parameterized unit: `worldconsole-alert@<failed-unit>.service` is instantiated by name at fire time. Templates need no `enable` — they're started by whoever names them.

**The lifecycle verbs:**

```bash
# on: box (as root)
systemctl daemon-reload                       # after ANY edit/copy of unit files
systemctl enable --now worldconsole-backup.timer   # register at boot + start now
systemctl list-timers 'worldconsole-*'        # when did/will each run
systemctl status worldconsole-backup.service  # last result, recent log lines
systemctl start worldconsole-store-sweep.service   # run a scheduled job NOW (manually)
```

Units are *installed* by copying into `/etc/systemd/system/` and daemon-reloading — this project keeps the masters in git (`deploy/host/systemd/`) and copies them over on change, so the repo stays the single source of truth ([10](10-operate-the-box.md) §timers).

**Failure hooks are the pager's spine:** a unit can declare `OnFailure=worldconsole-alert@%n.service` (ring ntfy, carrying the failed unit's own name via `%n`) and `OnSuccess=…heartbeat@%n.service`. The design choice worth copying: put OnFailure on every nightly unit, but OnSuccess **only on the last unit of the night** — one green ping vouches for the whole chain, instead of a pile of pings nobody reads ([12](12-ntfy-push-notifications.md)).

**The journal** is systemd's central log — every unit's output, timestamped, queryable:

```bash
# on: box (as root)
journalctl -u worldconsole-reaper.service --since today     # one unit, today
journalctl -u worldconsole-backup.service -n 100            # last 100 lines
journalctl -p err --since -2d                               # everything error-level, 2 days
journalctl -f -u worldconsole-reconcile.service             # follow live
```

The reaper is deliberately journal-only (no ntfy): a 5-minute job that pages would turn one wedged morning into a hundred pings, and a dead reaper costs little. **Alarm design is choosing what may stay silent.**

## Software on the box

Debian installs software from signed repositories via **apt**:

```bash
# on: box (as root)
apt update && apt install <package>       # refresh index, install
apt list --upgradable                     # what has pending updates
```

The box's inventory is deliberately tiny: `docker` + `compose`, `git`, `borgbackup`, `zstd`, and the base system. **No Node on the host, by design** — every bit of JavaScript (gateway, waker, probes, admin one-liners) runs *inside* a container, usually the game image lending its own Node (`docker run --rm world-console:latest node -e …`). One runtime, one place to update it, no version skew between box and image. This "the image lends its tools" pattern appears all over `deploy/host/` and is worth stealing.

**Updates policy:** `unattended-upgrades` (Debian's auto-patcher) is currently *absent by choice* — documented in the holiday-watch note: no surprise reboots during an away week; patch by hand after. That is a dated, revisable ruling, not a default to copy blindly — for a next project, auto security updates are usually the right start.

## The firewall — and the Docker complication

A firewall filters packets by rules. Linux's is **iptables** (rules in ordered **chains**; first match wins). The standard beginner tool `ufw` manages *host* traffic well — but there is a famous pitfall: **Docker programs its own iptables chains**, and published container ports bypass `ufw` entirely. Docker provides the `DOCKER-USER` chain as the sanctioned place for your own rules over container traffic.

`deploy/host/firewall.sh` is a complete, idempotent example (flush and rebuild only that chain):

1. allow established/related replies (inbound connections keep working),
2. allow container↔container within Docker's own `172.16.0.0/12` pools (caddy → seats),
3. **drop container-originated traffic to every private range** (RFC 1918, link-local — where cloud metadata lives, CGN),
4. return everything else to Docker's normal processing (open internet stays open — the model APIs and Wikimedia need it).

Every drop is scoped by *source* `172.16.0.0/12`: an inbound public connection arrives DNAT'd with a public source address, and an unscoped drop would kill it — found live when the first ACME validation broke. iptables rules vanish on reboot; persistence here is a oneshot systemd unit (`worldconsole-firewall.service`, `After=docker.service`) that re-runs the script.

Verify it from the *inside* vantage, the only honest one:

```bash
# on: box (as deploy) — a container trying the private net must TIME OUT
docker run --rm world-console:latest node -e "fetch('http://192.168.1.1',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))" && echo BLOCK-STANDING
```

## Hardening — what was actually done, and why

"Hardening" is closing capabilities you don't need before anyone asks whether they're open. The box's list (runbook, first-deploy state):

| Measure | Threat it removes |
|---|---|
| SSH keys only, no passwords | credential guessing at the one admin door |
| non-root `deploy` user for operations | routine work can't wreck the system by typo |
| **no swap** (verify: `swapon --show`) | secrets in RAM getting written to disk |
| **core dumps off** (`kernel.core_pattern=|/bin/false`) | a crashing process leaving its memory (keys!) in a file |
| Docker egress block (above) | containers probing the private network / metadata |
| only ports 22/80/443 public | everything else simply unreachable |
| tiny software inventory | fewer things to patch, fewer surprises |
| container hardening (→ [03](03-docker.md)) | the app itself is boxed in |

The mindset over the checklist: every "no" here makes a whole class of incident *structurally impossible*, which is cheaper than detecting it. The same mindset produced tmpfs-auth (R11), the build whitelist ([03](03-docker.md) §building), and the backup-by-construction `auth.json` exclusion.

---

**Pointers:** box access + ops split → runbook (first-deploy state note) · units themselves → `deploy/host/systemd/` · firewall → `deploy/host/firewall.sh` · provider ruling → R18 · hardening origin → roadmap `02-friends-web-service.md` item 2.
