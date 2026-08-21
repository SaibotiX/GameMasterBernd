# 11 — Data in and out: volumes, the store, borg backups

*How-to. The data map lives in [04 §the data model](04-architecture-of-this-deployment.md); erasure is owned by the runbook §deletion; backup law by the runbook §Backups. This page is the working knowledge around them. Synced: `0cbaf72` (2026-08-21).*

## Reading and copying data out

**A file from a friend's volume** (e.g. a chronicle page) — volumes aren't directly browsable as normal folders (they live under `/var/lib/docker/volumes/...`, root-only); the clean way is a throwaway container that mounts the volume read-only:

```bash
# on: box (as deploy) — list a chronicle's files
docker run --rm --network none -v gamemaster-bernd_data-tobias:/v:ro world-console:latest ls -R /v/world
```

```bash
# on: box (as deploy) — read one file
docker run --rm --network none -v gamemaster-bernd_data-tobias:/v:ro world-console:latest cat "/v/world/dragon-realm/<session-id>/ledger.md"
```

```bash
# on: dev machine — copy a whole volume down as a tarball
ssh -i ~/.ssh/worldconsole deploy@152.53.51.13 \
  "docker run --rm --network none -v gamemaster-bernd_data-tobias:/v:ro world-console:latest tar cz -C /v ." \
  > tobias-data.tar.gz
```

That last pattern — *stream a tar over ssh* — is the universal escape hatch for any server data.

**Play sessions for analysis** (the intended path — never hand-carry): the analysis kit's puller mirrors the store's compacted `sessions/` into the kit's layout, deletions propagating (`rsync --delete`):

```bash
# on: dev machine
research/analysis/tools/pull-sessions.sh
```

**The backup mirror** (R18's second leg — run monthly-ish and before anything sweeping, by day, never inside the 05:11–05:20 borg window):

```bash
# on: dev machine
deploy/host/pull-backup.sh          # → ~/worldconsole-backups/borg (encrypted bytes)
```

## Putting data in

Rarely needed (the game writes its own data), but the reverse of the patterns above works — e.g. restoring one file into a volume:

```bash
# on: box (as root) — drop a file into a friend's data volume
docker run --rm --network none -v gamemaster-bernd_data-tobias:/v -v /tmp/fix:/in:ro \
  --user 0 world-console:latest sh -c 'cp /in/quests.md "/v/world/dragon-realm/<sid>/quests.md" && chown 1001:1001 "/v/world/dragon-realm/<sid>/quests.md"'
```

Mind ownership: game files belong to uid 1001. Docker auto-creates missing volumes/host-dirs **root-owned** — the reason `new-friend.sh` chowns each staging slice before first mount.

## Removing data

- **One friend, entirely:** the runbook **§deletion** — eight steps (door → volumes → store → lane key + anonymized ledger → analysis mirror → consent row → backups-by-prune → the reports edge). Follow it verbatim; it was dry-run green on production. The month promise is kept *structurally*: the 28-day borg prune ages erased players out of every archive; your one hand-step is a `pull-backup.sh` within that month so the mirror prunes too.
- **A single file** (a broken download, say): delete it inside the volume with a throwaway container (pattern above, `rm` instead of `cat`). The panes update live; the shipper's next tick mirrors the new truth.
- **Disk pressure:** the reaper's watch warns at 2 GiB/volume, alarms at 5 — **alarm-only by ruling**; nothing auto-deletes. `data/downloads/` (the glass's media catches) is the growable part and is *player-visible* — pruning it is a judgment call taken with eyes open, never by cron.

## The store (the research record) — how to inspect it

```bash
# on: box (as root)
ls -l /srv/gamemaster-bernd/store/sessions/            # per-player compacted sessions
ls -l /srv/gamemaster-bernd/store/staging/tobias/      # live staging: manifests + sealed markers
tar --zstd -tf "/srv/gamemaster-bernd/store/sessions/tobias/<sid>.tar.zst"   # look inside one
```

Integrity is machine-checked, not assumed: `store-sweep.sh` recomputes every manifest hash before compacting and refuses tampered dirs loudly (left in place for eyes). Run it any time — it is idempotent:

```bash
# on: box (as root)
systemctl start gamemaster-bernd-store-sweep.service && journalctl -u gamemaster-bernd-store-sweep.service -n 20
```

## Borg, from zero

**borg** is a deduplicating, encrypted archiver. Mental model: a **repository** (here: on the Storage Box) holds many **archives** (here: one per night, `nightly-<timestamp>`); identical data chunks are stored once across all archives (why nightly full-looking backups stay small — 3.84 MB encrypted for the first night); everything is encrypted with a key+passphrase (**repokey** mode: the key lives *in* the repo, locked by the passphrase — so Storage Box + passphrase = restorable anywhere; both passphrase and an exported key copy live in the password manager, per runbook §Backups).

The nightly shape (`backup.sh`): every `gamemaster-bernd_*` volume staged as a plain tar (plain tars dedup well night-over-night) by `--network none` containers, then **one** archive of: staged tars + the store + the six box-local state paths. `auth.json` cannot be in it — it lives on tmpfs, no volume ever contains it. Then `borg prune --keep-within 28d` + `borg compact`: the moving 28-day window that *is* the deletion promise (and why Storage-Box snapshots stay OFF — no layer may outlive the prune).

**Reading the repo** (all as root on the box; borg env comes from the script's own defaults):

```bash
# on: box (as root)
export BORG_RSH='ssh -i /root/.ssh/storagebox_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=yes'
export BORG_PASSCOMMAND='cat /root/worldconsole-borg.pass'
export BORG_REPO='ssh://u648152@u648152.your-storagebox.de:23/./borg/worldconsole'
borg list                                   # every archive, newest last
borg info ::$(borg list --short | tail -1)  # size/dedup stats of the newest
borg list ::$(borg list --short | tail -1) | head -40   # files inside it
```

## The restore drill — practice it, don't trust it

A backup that has never restored is a hope, not a backup. The proven sequence (the runbook's exit gate, run against the real repo; re-proven per stage gates). Restore one friend's data volume to a scratch volume and prove a chronicle reads:

```bash
# on: box (as root) — 1. extract the wanted tar from the newest archive
export BORG_RSH='ssh -i /root/.ssh/storagebox_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=yes'
export BORG_PASSCOMMAND='cat /root/worldconsole-borg.pass'
export BORG_REPO='ssh://u648152@u648152.your-storagebox.de:23/./borg/worldconsole'
cd /tmp && mkdir -p restore && cd restore
borg extract ::$(borg list --short | tail -1) srv/gamemaster-bernd/backup-staging/gamemaster-bernd_data-tobias.tar
```

```bash
# on: box (as root) — 2. rebuild into a scratch volume and read through a container
docker volume create restore-check
docker run --rm --user 0 --network none -v restore-check:/v \
  -v /tmp/restore/srv/gamemaster-bernd/backup-staging:/in:ro \
  --entrypoint tar world-console:latest xf /in/gamemaster-bernd_data-tobias.tar -C /v
docker run --rm --user 0 --network none -v restore-check:/v:ro \
  --entrypoint cat world-console:latest "/v/world/dragon-realm/<sid>/ledger.md" | head
docker volume rm restore-check
```

(`--user 0` on both: the staging dir is root-700 and some staged files are root-owned — the player uid can't read them; a scar the first real drill left as its own commit.)

**Full-disaster shape** (box gone entirely): new box → the HUB first (its repo's runbook: front door, firewall, its own lanes — certs re-issue on first hit there, deliberately not restored) → clone this repo per the hub contract §B → restore the box-local state paths from the archive (they include `.env` and `gateway-state/` *on purpose* — recovery needs them) → recreate volumes from tars as above → `build.sh`, `up -d`, fragment cp + validate + reload at the hub, re-point DNS. The pieces are all above; the runbook's historical first-deploy list still teaches the solo-box shape.

**Keyless practice:** `localcheck.sh`'s backup leg runs the entire cycle — stage → create → prune eating a planted stale archive → restored chronicle reading — against a throwaway local repo wherever borg is installed. Free rehearsal; run it before touching the real repo for the first time.

## Verifying data health (the standing checks)

| Question | Answer with |
|---|---|
| did last night's whole chain run? | the ~05:12 heartbeat ping arrived (its absence = look; the hub's own lane rings ~03:52 separately) |
| are the two spend meters agreeing? | `journalctl -u gamemaster-bernd-reconcile.service -n 20` |
| is every staged session intact? | `systemctl start gamemaster-bernd-store-sweep.service` (recomputes hashes) |
| did the newest archive land, how big? | `borg list` / `borg info` (above) |
| does the backup actually restore? | the drill above — per stage gates, and before anything sweeping |
