# The deploy guide — how the web half of World Console works, from zero

*Teaching layer. Live ops truth stays in [`deploy/README.md`](../README.md) (the runbook) — if this guide and the runbook ever disagree, **the runbook wins** and the guide has drifted (see "Staying fresh" below). Synced: `4ba34eb` (2026-08-17).*

This folder teaches everything around the game: what a server actually is, how a browser reaches the box, what Docker does, how the friends' consoles run, where data lives, how backups and alerts work — and how to build the *next* project with the same bones. It assumes you can use a terminal and git, and **nothing else**. Every concept is explained from zero, using this project's real files as the worked example.

It exists because the machinery in `deploy/` was built across many sessions, and the knowledge of *why it is shaped this way* should not live only in session transcripts and commit messages. The runbook says *what to type*; this guide says *what it means*.

## How this guide is organized

The pages follow the [Diátaxis](https://diataxis.fr/) idea — the standard split for documentation that must serve both "teach me" and "let me look it up":

| Range | Kind | Read when |
|---|---|---|
| `0x` | **Explanations** — understanding-oriented | first read, or when something feels like magic |
| `1x` | **How-tos** — task-oriented | you need to *do* something on the box |
| `2x` | **Reference** — lookup-oriented | you need to know what a file or command is |
| `3x` | **Transfer** — the recipe for your next project | starting something new |
| `4x` | **Resources** — where to learn more | going deeper on any topic |

### The pages

| Page | One line |
|---|---|
| [00-big-picture.md](00-big-picture.md) | The whole system on one page: the journey of one visit, from URL to dice roll |
| [01-web-fundamentals.md](01-web-fundamentals.md) | IPs, DNS, ports, HTTP(S), TLS, WebSockets, reverse proxies — the vocabulary of the web |
| [02-linux-server.md](02-linux-server.md) | The rented computer: SSH, users, permissions, systemd, logs, firewalls, hardening |
| [03-docker.md](03-docker.md) | Images, containers, volumes, compose — with this project's files as the textbook |
| [04-architecture-of-this-deployment.md](04-architecture-of-this-deployment.md) | How 01–03 combine into World Console's actual production system |
| [10-operate-the-box.md](10-operate-the-box.md) | Connect, look around, read logs, deploy changes, manage friends, troubleshoot |
| [11-data-in-and-out.md](11-data-in-and-out.md) | Where every byte lives; retrieving, adding, removing data; borg backups and restores |
| [12-ntfy-push-notifications.md](12-ntfy-push-notifications.md) | The pager: how ntfy works, how this project uses it, how to wire alerts anywhere |
| [20-deploy-files-reference.md](20-deploy-files-reference.md) | Every file in `deploy/`, one entry each: what, why, how to work with it |
| [21-terminal-cheatsheet.md](21-terminal-cheatsheet.md) | The commands used across this guide, grouped, annotated, copy-pasteable |
| [30-next-project-blueprint.md](30-next-project-blueprint.md) | From blank VPS to running service: the ordered, reusable recipe |
| [40-learning-resources.md](40-learning-resources.md) | Curated further reading, and the best practices this project distilled |

**First full read:** 00 → 01 → 02 → 03 → 04, then skim 10–12 so you know what exists. **Returning with a task:** jump straight to the 1x page, or 21 for a command. **Starting a new project:** 30, which leans on everything else.

## House vocabulary (used across the runbook, commits, and this guide)

The project's records use a small in-house vocabulary. It is worth learning — the git history and the runbook are written in it.

| Term | Means |
|---|---|
| **the box** | the production server — the netcup VPS in Vienna that runs everything |
| **a seat / a friend container** | one friend's own game container, `wc-<name>` |
| **a door** | one friend's private URL (secret path + username/password) through Caddy |
| **minting** | creating a friend's door, container entry, and gateway key (`new-friend.sh`) |
| **the lane / the house lane** | the metered path a friend's AI requests take: container → gateway → Anthropic, paid by the maintainer |
| **the keeper** | the AI game master (in ops contexts: the model answering on the lane) |
| **the gateway** | the small proxy holding the org API key and the spend ledger |
| **the ledger** (ops sense) | the gateway's append-only spend record, `gateway-state/usage.jsonl` |
| **a grant** | a friend's monthly play budget on the lane ($10 placeholder) |
| **the store** | the private session archive on the box, `/srv/worldconsole/store` |
| **shipping / sealing / sweeping** | copying play sessions into the store; marking them complete; catching leftovers |
| **the reaper** | the 5-minute job that stops idle containers (and seals what they leave) |
| **the waker** | the service that starts a sleeping container when its door is knocked |
| **the pager** | the ntfy alert chain: failures ring your phone; the nightly green heartbeat vouches |
| **a chronicle** | a played story's files under `data/world/<world>/<session-id>/` |
| **an eyeball / seen-before-done** | the maintainer personally looking at a player-visible result before it counts as done (R9) |
| **the rite** | the full pi-upgrade verification procedure (`research/design/pi-upgrades.md`) |

## Staying fresh (the guide's contract)

A guide that silently rots is worse than none. The rules:

1. **One truth, one home.** Live operational facts — unit names, timer times, paths, current image ids, the exact box state — are owned by the runbook and the files themselves. This guide teaches the *shapes* and *reasons*, quotes concrete values for readability, and every page carries a `Synced:` commit hash: the state of `deploy/` it was checked against.
2. **When `deploy/` changes**, the guide is re-checked against it and the `Synced:` hashes move. This is the job of the `/guide-sync` workflow (lands as its own round with a registry entry; until then, the check is manual: `git diff <synced-hash>..HEAD -- deploy/ ':!deploy/guide'` and re-read the touched pages).
3. **Additions** get a new file in the right number range (gaps are left on purpose), one row in the index table above, and their own `Synced:` line. Never bolt a new topic onto an unrelated page.
4. **Corrections** are normal edits — this guide is a living document, not an immutable record (unlike `research/analysis/reports/`).

## Conventions

- Commands you can run stand in **fenced blocks**, one command per line, with a comment saying **where** they run — `# on: dev machine`, `# on: box (as deploy)`, `# on: box (as root)`. Paste them whole; don't retype.
- `<angle-brackets>` mark the parts you replace.
- Inline `code` marks names and paths — not something to paste alone.
- "The dev machine" is your own computer; "the box" is the server. Commands never assume a third machine.
