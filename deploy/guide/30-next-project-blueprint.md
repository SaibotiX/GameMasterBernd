# 30 — The blueprint: your next project, from blank to running

*Transfer. The distilled, ordered recipe this deployment proved — provider-agnostic where possible, with the World Console file to crib at every step. A minimal living template built from this blueprint lives at `~/Desktop/CurrPC/Programming/Example_Web_Server_Project` — built and verified 2026-08-17 (its own repo, nothing of it in this one; localcheck green end to end: door auth, hardening headers, healthz through the stripped prefix, a note surviving a clean-SIGTERM stop, borg cycle with stale-prune and the restore drill reading the note back; since the same day it also carries the portable WORKING law — CLAUDE.md, the triage/salvage/audit commands, seeded records — adapted per R32, its own `/law-sync` pulling this repo's law changes on demand; and per R33 the evidence shelf + the remaining record patterns — distilled reusable research (launch surfaces, licensing & trademark, founding & tax, the privacy/AI papers, hosting & names, the AI-service laws) plus the design-registry/build-log/design-audit patterns, a stamped snapshot refreshed only as `/law-sync research`). Synced: `4ba34eb` (2026-08-17).*

## Phase 0 — decide the shape (an evening, on paper)

Answer in writing before renting anything; every later step branches on these:

1. **What serves?** Static pages only → phases 1–4 suffice (no app container). An app → all phases.
2. **What must survive?** Name the irreplaceable data *now* — it dictates volumes (phase 6) and what "backup" must mean.
3. **Who may reach it?** Public / capability links + basic auth (this project's shape — zero account infrastructure) / real accounts (a major step — don't take it casually).
4. **What may it spend?** If anything meters (an API, a paid service), decide the caps *before* the first request — this project's gateway/ledger exists because "we'll watch it" is not a cap.
5. **What wakes you at night?** Choose the two or three failures that deserve a page; everything else journals ([12](12-ntfy-push-notifications.md)).

Write the answers into the new project's own `README` — it becomes the runbook's seed. (The habit that made *this* project navigable: one owning doc per fact, decisions recorded dated, procedures written down as they're proven — start that on day one, not later.)

## Phase 1 — name and DNS (~15 min + propagation; ~€9/yr)

Register the domain (INWX served well here — flat pricing, free anycast DNS; ruling R17). Create `A` (+ `AAAA` if the box has v6) records for the apex and each subdomain, pointed at the box's IP from phase 2, plain and unproxied. Subdomains are free — plan origins deliberately (one per trust level; [01](01-web-fundamentals.md) §DNS).

## Phase 2 — rent and harden the box (~1 h; ~€5–7/mo)

A 4 GB VPS carries a real project (R18's sizing held). netcup and Hetzner are the proven pair here — for any provider check: EU location if personal data is involved, an AVV/DPA you can actually conclude, and a backup story you *ignore* (yours is cross-provider).

First hour, in order — the full teaching is [02](02-linux-server.md):

```bash
# on: the new box (root, via the provider's console once)
adduser deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
# sshd_config: PasswordAuthentication no · PermitRootLogin prohibit-password
systemctl restart sshd
apt update && apt install -y docker.io docker-compose-v2 git
usermod -aG docker deploy
swapon --show                    # empty, or remove/encrypt swap
# core dumps off if secrets will live in RAM (crib: runbook step 3)
```

Then the firewall — if Docker is involved, remember `ufw` won't see container traffic; crib `deploy/host/firewall.sh` + its oneshot persistence unit wholesale, and keep the "verify from inside a container" habit.

## Phase 3 — the compose skeleton (an hour)

One `compose.yaml` from the start, even for two services — it is the architecture diagram that runs. Crib from `deploy/host/compose.yaml`:

- the hardened service anchor (`read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs, mem/cpu/pids limits) as your default, loosened only with a reason;
- `expose` for everything, `ports` only on the proxy;
- networks as boundaries (anything holding the docker socket or secrets gets its own);
- secrets via `.env` (600, gitignored) + `${VAR:-}` plumbing — never in the YAML;
- a `local` profile for the test rig from day one.

## Phase 4 — the front door: Caddy + TLS (an hour)

Caddy, two lines of global config, one site block per hostname — automatic HTTPS is the entire reason ([01](01-web-fundamentals.md) §TLS). Crib `deploy/host/caddy/Caddyfile`: the header hardening block for static sites verbatim; the `handle_path` + `basic_auth` + `reverse_proxy` snippet for anything private; mount the config *directory* (the inode lesson). Prove the door **from outside** with `curl -sI` before building behind it — an in-container check cannot see an inbound break (first-deploy lesson).

## Phase 5 — the app itself (the actual project)

Whatever it is, hold the transferable constraints:

- **Build from committed state** through a whitelist archive (crib `build.sh`) — secrets and strays structurally can't ship.
- **Pin everything**: base image, binaries by checksum, dependencies by lockfile. Upgrades are events, not drift.
- **Run unprivileged** (a uid like 1001), read-only root, writes only into declared volumes/tmpfs.
- **Answer a `/healthz`** with whatever "am I well?" means — every later automation (reaper-like jobs, rollout guards, uptime checks) hangs off it.
- **Treat SIGTERM as a seam**: flush, seal, then exit, inside a declared stop grace (crib `server.js`'s shutdown).
- **Relative URLs** if it will ever live behind a path prefix.

## Phase 6 — persistence and the backup lane (half a day, once; ~€4/mo)

Named volumes for everything phase 0 called irreplaceable. Then the lane, before real data exists (crib `backup.sh` + `pull-backup.sh` + [11](11-data-in-and-out.md)):

1. storage at a **different provider** than the box;
2. **borg**: encrypted (repokey — passphrase + key export into the password manager, off-box), deduplicating, one archive per night on a timer;
3. a **retention window** (`--keep-within`) chosen against your own promises — retention *is* deletion policy;
4. a **pull mirror** to your own machine, `--delete` so removals propagate;
5. **the restore drill, before the first real user** — extract, rebuild, read the data through the app's own eyes. Unrestored backups are hopes.

## Phase 7 — jobs and the pager (an hour)

Every recurring duty = a small idempotent script + a systemd timer (`Persistent=true` for nightlies, `RandomizedDelaySec`), masters in git, installed by cp + daemon-reload (crib `deploy/host/systemd/` wholesale — the alert@/heartbeat@ pair especially). Wire ntfy per [12](12-ntfy-push-notifications.md): OnFailure on every job, OnSuccess-heartbeat on the night's *last* job only, and write the reading key into the runbook.

## Phase 8 — the verification rig (grows forever)

The habit that carried this project: **every property you rely on gets a check that fails loudly**, runnable locally, keyless (stub external services — crib `stub-upstream.mjs`). Start `localcheck.sh`-shaped on day one: door answers, wrong auth refused, app serves through the proxy, backup cycles against a throwaway repo. Add a leg with every incident — a bug that got a probe can't return silently (this project's probe *types* into the terminal because an input-direction bug once shipped).

## Phase 9 — the runbook (living, from day one)

One `README` in the deploy folder: the ordered procedures as you prove them, a status table, dated state notes for what happened in production. Crib the *structure* of `deploy/README.md`. The test: could you rebuild the whole thing from the repo + the password manager + that file, with the box gone? (Phase 6's disaster shape should make the answer yes.)

## Default picks (decide-once answers this project banked)

| Question | Default | Because |
|---|---|---|
| proxy | Caddy | automatic TLS; one readable file (R17-era research) |
| orchestration | docker compose | one box doesn't need Kubernetes; compose is the diagram that runs |
| backup tool | borg | encryption + dedup + retention-as-deletion in one tool |
| alerts | ntfy.sh | a pager for one curl; no accounts |
| scheduled work | systemd timers | Persistent, journald, list-timers beat cron on every axis you'll use |
| runtime sprawl | none on the host | containers lend their tools; one runtime to update |
| accounts | avoid until forced | capability URLs + basic auth carried a real multi-user service |
| framework for small servers | none | ~350–600 lines of stdlib Node carried the gateway and app server; a framework is a dependency to patch |

## Cost of this whole stack (⚠ 2026-08 figures — re-verify at purchase; owning receipts: research log)

| Item | Order of cost |
|---|---|
| domain (.eu at INWX) | ~€9/yr |
| VPS 4 GB (netcup/Hetzner class) | ~€6/mo |
| Storage Box (backups) | ~€4/mo |
| ntfy, Caddy, borg, Docker, Debian | €0 |
| metered API usage (if any) | your caps decide — build the meter first (R12's lesson) |

Total fixed: **~€11/month** for a real, backed-up, monitored, TLS'd multi-user service. The expensive part was never the infrastructure — it is the operational care, and phases 6–9 are what make that care cheap.
