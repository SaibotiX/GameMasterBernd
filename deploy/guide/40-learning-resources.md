# 40 — Learning resources and the house best practices

*Resources. Curated, not exhaustive — each entry says what it's *for*, so you reach for the right one. URLs are stable projects/organizations; if one moves, search its name. Synced: `0cbaf72` (2026-08-21).*

## Foundations (the 0x pages' deeper versions)

- **MDN Web Docs** (developer.mozilla.org) — the reference for everything browser-and-HTTP: "How the Web works", the HTTP guide (methods, status codes, headers, caching), CSP. When a header in this repo puzzles you, MDN's page on it is the answer. Free, canonical, maintained.
- **Julia Evans — wizardzines.com + jvns.ca** — short illustrated zines ("How DNS Works", "Networking! ACK!", "How Containers Work", "The Pocket Guide to Debugging") that build exactly the mental models the 0x pages sketch. The single best money you can spend on this material; much of the blog is free.
- **howdns.works** — a free comic that makes DNS resolution stick in twenty minutes.
- **The Linux command line generally:** *The Linux Command Line* (W. Shotts) — free PDF, from zero; and `man <command>` locally — the habit of reading manpages beats any tutorial diet.

## Servers & ops

- **DigitalOcean Community Tutorials** — the gold standard for step-by-step server recipes ("Initial Server Setup with Debian", "How To Set Up SSH Keys", systemd/journalctl/iptables intros). Provider-agnostic despite the host; cross-check versions, they age.
- **systemd documentation** (freedesktop.org/wiki/Software/systemd + `man systemd.timer`, `man systemd.service`, `man journalctl`) — dry but authoritative; the timer/template semantics in [02](02-linux-server.md) come from here.
- **Debian Administrator's Handbook** (debian-handbook.info, free) — the OS the box runs, cover to cover; dip in per topic.

## The stack's own manuals (read the one you're touching)

- **Caddy** — caddyserver.com/docs: the Caddyfile concepts page and `reverse_proxy`/`handle_path`/`basic_auth` directives; short and well-written.
- **Docker** — docs.docker.com: "Get started" (the nouns), Dockerfile reference, and *especially* Compose file reference (profiles, extends, merge rules — the exact features `compose.yaml` leans on).
- **BorgBackup** — borgbackup.readthedocs.io: the Quickstart, then "borg prune" (retention windows) and the FAQ's encryption-modes section (what repokey means for custody).
- **ntfy** — docs.ntfy.sh: publish options (priority, tags, actions), the phone apps, self-hosting.
- **xterm.js** (xtermjs.org) and **node-pty** — the two libraries that make the browser terminal; their READMEs explain the PTY model the app server wires together.
- **Let's Encrypt** — letsencrypt.org "How It Works" — the ACME story in plain words.
- **pi** — the engine's own docs ship with it; and this repo's root `README.md` is the game-side architecture.

## Security (calibrated to this project's scale)

- **OWASP Cheat Sheet Series** (cheatsheetseries.owasp.org) — one-page, actionable: *Secrets Management*, *Docker Security*, *HTTP Security Response Headers*, *Cross-Site WebSocket Hijacking*. The headers sheet reads like an annotation of this project's Caddyfile.
- **Mozilla's web security guidelines** (infosec.mozilla.org) — a ranked checklist for site headers/TLS; good for grading your own front door.
- **`docker run --security-opt` docs + the compose hardening keys** — the flags table in [03](03-docker.md) is the applied version; the docs say what each actually does in the kernel.

## Documentation & process (how this guide and repo are shaped)

- **Diátaxis** (diataxis.fr) — the explanation/how-to/reference/tutorial split this guide follows, and *why* mixing them produces docs nobody can use.
- **The Twelve-Factor App** (12factor.net) — short classic; factor III (config in the environment) and IX (disposability) are this deployment's spine, readable in an hour.
- **Architecture Decision Records** (adr.github.io) — the general form of this repo's R-registry habit: decisions written down, dated, immutable, superseded not edited.

## The house best practices (what this project would tell a younger self)

Distilled from the scars and rulings across `deploy/` — the transferable law:

1. **Make bad states unrepresentable.** Whitelist builds, tmpfs credentials, allowlist shippers, retention-as-deletion: the strongest guarantee is the one that needs no vigilance.
2. **Secrets live in exactly one place** (server `.env` / password manager), never in git, images, logs, or transcripts — and the *name* of a topic or path can be a secret too.
3. **Every reliance gets a loud check.** If you rely on it, probe it; when a bug ships, its probe joins the rig. Green must mean something.
4. **Verify from the honest vantage.** The door from *outside*; the firewall from *inside* a container; the backup by *restoring*. Internal checks flatter.
5. **Pin and upgrade deliberately.** Versions move on your schedule, with a rite, or not at all.
6. **One door to defend.** A single proxy publishes; everything else is internal. One admin door (SSH, keys-only). Count your doors; keep the number small.
7. **Stops are seams.** Design shutdown as a first-class path (seal, flush, grace) — then idle-stopping, updates, and reboots become boring.
8. **Alarm design is choosing silence.** Page what needs a human now; heartbeat the happy chain once; journal the rest; know what silence means.
9. **Two witnesses for money.** Any meter you bill (or budget) by gets reconciled against an independent record, on a timer, loudly.
10. **Idempotent operations.** Scripts you can re-run without fear (markers, tmp+rename, config-diff `up -d`) turn incidents into chores.
11. **The runbook is part of the system.** Procedures written as proven, state notes dated; the box should be rebuildable from repo + password manager + runbook alone.
12. **Cross-provider blast radii.** Backups at a different company than the box; a runner-up provider named before you need it.
13. **⚠-mark fast-moving facts** (prices, provider policies, legal thresholds) with their re-verify trigger — a fact without a freshness contract is a future bug.
14. **Boring tools, few of them.** Caddy, compose, borg, systemd, ntfy, stdlib Node: everything here is explainable to a newcomer in a page — which is precisely why it can be operated by one person.
