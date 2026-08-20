# 12 — Push notifications with ntfy: the pager

*How-to + explanation. The pager's law lives in the runbook §the pager; this page teaches the mechanism and how to wire it anywhere. Synced: `d700c6e` (2026-08-20).*

## What ntfy is

[ntfy](https://ntfy.sh) (pronounce: notify) is publish/subscribe over plain HTTP. A **topic** is just a name; anyone who knows the name can POST a message to it and anyone subscribed to it (phone app, browser, `curl`) receives it instantly. No accounts, no tokens, no SDK — sending is one HTTP request, which is why a shell script or a systemd unit can page a phone:

```bash
# on: anywhere
curl -d "the message body" https://ntfy.sh/<topic>
```

The security model follows directly: **on the public ntfy.sh server, the topic name IS the secret** — a capability, like the friends' door paths ([01](01-web-fundamentals.md) §auth model). Treat it accordingly: long and random, never in git, never in logs. This project keeps it as `NTFY_TOPIC` in the box's root-600 `.env`, and the standing content rule is **ops only** — unit names and spend numbers, never play content, never personal data (public-server pragmatics and data-minimization at once).

```bash
# on: box (as root) — read the topic (then subscribe to it in the ntfy app)
grep NTFY_TOPIC /home/deploy/world-console/deploy/host/.env
```

Useful extras, all plain headers: `-H "title: …"`, `-H "priority: high"` (or `max`/`low`), `-H "tags: rotating_light"` (emoji). Full list: ntfy's docs ([40](40-learning-resources.md)).

## How this project wires it (three senders, one philosophy)

**1. The systemd chain — red rings, green vouches** (runbook §the pager). Every nightly unit declares `OnFailure=worldconsole-alert@%n.service`; the template instance curls the topic with the failed unit's name at high priority. `OnSuccess=worldconsole-heartbeat@%n.service` rides **only the backup** — the night's *last* unit — so one ~05:14 green ping means *the whole chain ran*: sweep, reconcile, backup. Read your breakfast accordingly:

| Morning signal | Means |
|---|---|
| one green heartbeat | all is well — the expected morning |
| a red alert ping | that unit failed — `journalctl -u <unit>` when you can |
| **silence** | the box (or its network) is down — nothing could ring; go look |

Silence-as-signal is the deliberate answer to "who watches the watcher": no watcher lives off the box (a named, accepted residue — coverage register's hardening row). An external uptime pinger is the future shape if that residue ever stings.

**2. The gateway's tripwires** (`gateway.js`): daily spend alarm, monthly kill-switch, a friend's grant running dry — each pings **once per condition** (an in-memory latch keyed like `kill:2026-08`, so a true state doesn't re-ring every request; a restart may repeat a still-true warning — a feature). Checked at record time *and* at boot.

**3. `reconcile.sh`'s mismatch ping** — the script speaks its own detailed message; its `OnFailure=` alert is only the backstop for the script *crashing* before it can.

And one deliberate **non**-sender: the reaper stays journal-only. A 5-minute cadence would turn one wedged morning into a hundred pings, and a dead reaper costs little. **Deciding what may stay silent is most of alert design** — page on what needs a human, vouch once for the happy path, journal the rest.

## Recipes

**Test the pipe end to end** (does a ping reach your phone?):

```bash
# on: box (as root)
. /home/deploy/world-console/deploy/host/.env
curl -H "title: test" -d "ping from the box $(date -u +%FT%TZ)" "https://ntfy.sh/$NTFY_TOPIC"
```

**Put any systemd unit on the pager** — add to its `[Unit]` section (then re-copy + `systemctl daemon-reload`):

```ini
OnFailure=worldconsole-alert@%n.service
```

The template is generic on purpose: any unit name rides `%i` into the message. For a new *project*, copy `worldconsole-alert@.service` + `worldconsole-heartbeat@.service` wholesale and change the `.env` path.

**Ping from any script** (the reconcile pattern — never let a failed ping fail the job):

```bash
curl -fsS -m 10 -X POST -H "title: <what>" -d "<details>" "https://ntfy.sh/$NTFY_TOPIC" || echo "ping failed to send"
```

**If the topic ever leaks** (a stray screenshot, a pasted log): rotate it — new random name in `.env`, recreate the gateway (`docker compose up -d --force-recreate gateway` — its env is baked at start), re-subscribe on the phone. Nothing else references it.

## The transferable minimal setup (any future project)

1. Invent a long random topic; store it in the project's server-side `.env` (600, gitignored).
2. Subscribe in the ntfy app.
3. Wire `OnFailure=` on every scheduled unit; `OnSuccess=` heartbeat on the **last** job of the chain only.
4. In-app tripwires (spend, quota, disk) ping through a latch so conditions ring once.
5. Write the one-line reading key ("green = all ran; red = that unit; silence = host down") into the project's runbook — the signal is only as good as your trust in what it means.

**Self-hosting note:** ntfy's server is open source; running your own (a small container behind Caddy) upgrades topic-secrecy into real auth and keeps messages off the public instance. Worth it the day pings must carry anything sensitive; overkill for ops-only content like this project's.
