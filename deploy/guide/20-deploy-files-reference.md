# 20 — The deploy/ folder, file by file

*Reference. Each entry: what it is · why it exists · how you work with it. The files' own header comments are the deepest truth — most are written as documentation; read them. Synced: `276ff32` (2026-08-20).*

## deploy/ (root)

**`README.md`** — **the runbook**: the ordered, proven procedures (local loop, first deploy, onboarding, updates, store, reaper, backups, pager, deletion) plus dated *state notes* — the project's memory of what happened on the box and why. The single owning home for live ops truth. Work with it: follow it verbatim on the box; when a round changes production, the round updates it (status table + a state note). This guide never overrides it.

**`friend-intro.md`** — the invitation's exact words: part one (what the game is, the honest recording disclosure, the two consent questions — R13/R20), part two (the door + pair message). Work with it: send part one by any channel that keeps the reply; blanks in `<angle-brackets>`; the LICENSE line rides it (R3).

## deploy/image/ — building the game image

**`Dockerfile`** — the image recipe: multi-stage node-pty build, pinned ttyd (checksum), pinned pi (`PI_VERSION=0.84.1` — changing it = the upgrade rite), the `player` uid-1001 user, player-mode env (R30), game folder from the whitelist context, root-owned app server, tmpfs-shaped agent dir, healthcheck on `/`, entrypoint + app-server CMD with the ttyd fallback line in a comment. Annotated tour: [03](03-docker.md). Work with it: edit on the dev machine, `build.sh` + `verify.sh`, never `docker build` directly.

**`entrypoint.sh`** — 29 lines that make a fresh container boot like a prepared one: seeds directory trust (pi would otherwise ask a human), a settings file (`quietStartup`, changelog version — no splash mid-invitation), and the data dir tree; then `exec "$@"`. Work with it: rarely; anything seeded here is a "what a fresh boot would ask" answer.

**`build.sh`** — the only sanctioned build path: `git archive` whitelist (`README.md LICENSE .pi extension config`) of a committed ref into a temp context + the named app-server files; tags `world-console:<rev>` + `latest`; stamps `GIT_REV`. Structural guarantee: nothing untracked, no `research/`, no credential can enter a layer. Work with it: `deploy/image/build.sh [ref]`; `PI_VERSION=x.y.z` env only through the rite.

**`verify.sh`** — the image's five-leg gate, all in the hardened production shape: ① unit tests + live lenses in-container ② the TUI pseudo-TTY probe (player leg) ③ app-server probe (page, healthz, pane APIs, a typed `/ws/term` stream, watcher push) ④ the ttyd fallback rung ⑤ the shipper's laws. On the box it lends the image's own node (no host node by design). Work with it: run after every build; a red leg blocks everything.

**`appserver-probe.mjs`** / **`ws-probe.mjs`** / **`shipper-probe.mjs`** — the probes verify.sh drives: the page-and-stream walker (also used *through the real door* by localcheck, and `--fs-event` mode times the watcher hop), the ttyd-protocol prober, and the in-container shipper law-checker (torn tail truncation, re-ship no-op, growth reopens seal, auth.json canary provably unshippable). Work with them: read their headers when a leg goes red; extend the relevant probe when you add a behavior worth holding.

### deploy/image/appserver/ — the in-container web app

**`server.js`** — the per-seat app server ([04](04-architecture-of-this-deployment.md) §inside a seat): PTY spawn/attach/takeover over `/ws/term`, pane file APIs with the realpath jail, `/ws/events` watcher channel, `/healthz`, `/api/grant` (rounds only), pinned-asset static map, CSP/nosniff/sandbox headers, `x-ai-generated` on chronicle prose, origin-checked upgrades, SIGTERM = seal. The header comment specifies the WS protocol. Work with it: dev machine → verify leg 3 → localcheck → deploy; its logs are JSON events.

**`shipper.js`** — R13's recording machinery, one implementation, two runners (in-server ticks; `node shipper.js sweep` one-shot for the host). Allowlist by construction; staging contract (`session.jsonl`, `story/**`, `manifest.json`, `sealed`) in the header. Work with it: almost never alone — its laws are held by probe leg 5 + store-sweep.

**`client/index.html` · `client/app.js` · `client/style.css`** — the one-page client, no framework (R14/08): xterm.js + fit + webgl, reconnect-with-backoff, takeover/exit overlays, tabs (localStorage, namespaced per door), markdown via marked + DOMPurify, media auto-open for the glass's catches, the rounds strip on a 90 s clock, the once-per-browser first-run notice, `pages` toggle under 1000 px. All URLs relative (the door's prefix strip). Work with it: 08's interaction laws are the spec; the eyeball sitting is the acceptance (R9 seen-before-done).

**`package.json` / `package-lock.json`** — the app server's eight pinned dependencies (xterm trio, chokidar, dompurify, marked, node-pty, ws). The lockfile is load-bearing: the image stage runs `npm ci`. Local `node_modules/` here is dev-machine convenience; the build never copies it.

## deploy/host/ — running the box

**`compose.yaml`** — the stack: the `x-friend` hardened anchor, caddy, waker, gateway, `wc-template` (scale 0), and the `local`-profile test rig; networks `web`/`wake`; the override-file pattern documented in comments (each friend `extends wc-template`). Annotated tour: [03](03-docker.md) §compose. Work with it: edits are architecture changes — verify with `docker compose config -q` + localcheck before the box sees them.

**`caddy/Caddyfile`** — production routing: global ACME email; `play.` importing `friends/*.caddy` with the by-invitation 404 fallback; `vault.` reserved (R11); the apex landing site with the hardening header block and `templates` rendering the Impressum address from env (R19). Work with it: config-only changes → `caddy reload` ([10](10-operate-the-box.md)); remember the directory-mount inode lesson.

**`Caddyfile.local`** — localcheck's mirror of the production shape: self-signed certs, one fixed test door (deliberately public fixtures), the same waker two-upstream proxy block with the `dial_timeout` scar, and the landing site on `site.localhost`. Never serves anywhere real.

**`caddy/site/`** — the landing ground (words round, R13/R16/R19): `index.html` (the loud disclosure + Art. 50(1) sentence + both names), `datenschutz.html` (the Art. 13 privacy note against R29's re-verified facts), `impressum.html` (address rendered from env — built so the private address never entered the repo; since the 2026-08-20 swap the env holds the rented c/o block (R19 revised) and the value is public anyway — the mechanism stays for any future value), `site.css`. Work with them: words are law-adjacent — localcheck greps the load-bearing sentences; keep them true.

**`caddy/friends/.keep.caddy`** — tracked placeholder so the `import friends/*.caddy` glob never matches nothing (an empty glob is a Caddy parse error). The real snippets beside it are box-local.

**`new-friend.sh`** — the mint ([04](04-architecture-of-this-deployment.md) §friend lifecycle): consent-gate (refuses without the row), token + pair + bcrypt hash, door snippet with the waker as second upstream, staging slice chowned before first mount, virtual key at the $10 grant, override entry extending `wc-template`, `compose config -q` gate, prints door + pair once. Work with it: runbook §per-friend onboarding is the surrounding order.

**`firewall.sh`** — rebuilds the DOCKER-USER chain: allow replies + docker↔docker, drop container→private-ranges, return the rest. Idempotent; box-only; persisted by `worldconsole-firewall.service`. Teaching tour: [02](02-linux-server.md) §firewall.

**`reaper.sh`** — every 5 min: stop seats with no WebSocket client for ≥30 min (then `store-sweep.sh --friend` so the stop's seal is certain), du-based disk watch (alarm-only by ruling), one `docker stats` line. Journal-only by design.

**`store-sweep.sh`** — the store's daily half: one-shot sweep of *stopped* seats (the image's shipper over read-only mounts, no network), then hash-verify + compact every sealed staging dir to `sessions/<player>/<sid>.tar.zst` (tmp+rename), pruning staged data but keeping `manifest.json` + `sealed` (the "shipped already" answer). Tampered manifests refused loudly, left for eyes.

**`reconcile.sh`** — the nightly two-meter comparison (gateway ledger vs pi's own cost stamps), per player, tolerance max(5%, $0.001); side-tagged rows subtracted; pre-epoch days (before 2026-08-10) structurally green; keyless ghost rows = §deletion's benign residue, keyed ghosts page. The header comment owns the semantics.

**`backup.sh`** — the borg lane ([11](11-data-in-and-out.md)): state-manifest check (all six box-local paths present or fail loudly), volumes staged as tars via `--network none` containers, one `nightly-*` archive to the Storage Box, rc-1 tolerated (live files move), `prune --keep-within 28d` + `compact`. Custody defaults overridable so localcheck runs it keyless.

**`pull-backup.sh`** — dev-machine mirror of the encrypted repo over ProxyJump through the box (the dev DNS quirk), `--delete` load-bearing (the prune reaches the mirror — §deletion's hand-step). By day, monthly-ish, before anything sweeping.

**`localcheck.sh`** — the crown jewel of the checks: the entire production door on the dev machine — TLS, secret path, auth, prefix strip, the page through the door, the lane's turns/caching/refusals/tripwires, stop-is-a-seal, sweep idempotency, reaper + waker + resume, the AI marking, reconcile's four verdicts on fixtures, tamper refusal, and (borg installed) the full backup/restore cycle against a throwaway repo. Keyless by construction (the stub plays Anthropic). Work with it: run before any push that touches `deploy/`; read a failing leg's echo — each names its law.

**`gateway/gateway.js`** — the house lane's proxy/ledger ([04](04-architecture-of-this-deployment.md) §the money lane). Header comment = spec. Single-file bind into its container: after edits, force-recreate, not reload.

**`gateway/stub-upstream.mjs`** — the pretend Anthropic for keyless checks: answers both response shapes with plausible usage, plays the caching game honestly enough to prove passthrough, only asserts *an* org key arrived (custody proof).

**`waker/waker.js`** — start-on-connect: validates `X-Friend` against the mint's own name alphabet, starts `world-console-wc-<name>-1` via the docker socket (its entire vocabulary), serves the auto-refreshing waking page or the "closed" page for removed friends. Lives on `wake` with caddy alone.

**`systemd/`** — the nine units: four timers + services (reaper 5-min · sweep 04:17 · reconcile 04:47 · backup 05:11, `Persistent` on the nightly three, `RandomizedDelaySec` spreading load) and the pager templates (`alert@`, `heartbeat@`). Masters here; installed by cp + daemon-reload ([10](10-operate-the-box.md) §timers). Each carries its install line as a comment.

## deploy/gateway-spike/ — the proving ground (historical, kept)

The one-day spike that decided the gateway's shape (own ~200-line proxy adopted; LiteLLM declined — Postgres + admin surface for nothing the lane needs; iced with revival conditions). Kept for any future head-to-head: `run.sh` (both candidates through five legs against the real API, ~1¢), `probe.mjs`, the LiteLLM compose/config, the 3-line `pi-project/.pi/extensions/gateway.ts` that became the game's own override. Work with it: read `README.md` there; don't grow it — the production gateway lives in `host/gateway/`.

## The box-local ghosts (exist only on the box, gitignored, all in backups)

| Path | Holds | Written by |
|---|---|---|
| `host/.env` | `ACME_EMAIL`, `WC_IMPRESSUM_ADDRESS`, `ANTHROPIC_ORG_KEY`, `NTFY_TOPIC` (+ optional cap overrides) | you, once per secret |
| `host/consents.md` | one row per friend: name · date · channel · yes · yes · note version (Art. 7(1) proof) | you, at each yes |
| `host/gateway-state/` | `keys.json` (grants) + `usage.jsonl` (the ledger) | mint + gateway |
| `host/caddy/friends/<name>.caddy` | each friend's door | mint |
| `host/compose.override.yaml` | each friend's service + volumes | mint |
| `host/first-use/` | R16's dated first-use evidence set (rendered pages, checksums) | words round |

If you are ever surprised a file "isn't in the repo" — check this table first; box-local is a *category* here, not an accident. The nightly archive carries them all; that is their only copy beyond the box.
