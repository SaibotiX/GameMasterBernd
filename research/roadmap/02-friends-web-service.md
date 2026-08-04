# Stage 1 — the friends web service

The existing game, unchanged, streamed into a browser tab. A friend clicks a secret link, sees the real terminal UI (dice overlay, four-slot board, footer and all), logs into their own Anthropic account once, and plays. No installs, no git, no Node, no Python on their machine — and the source never leaves the server.

**Goal:** zero-setup play for invited friends; real human playtesting; the update path that cannot destroy a chronicle.
**Non-goals (deferred to stage 2):** accounts database, payments, serving strangers, our API key underneath players.

## Architecture

```
friend's browser ── xterm.js (rendered TUI) ──┐
                                              │ WebSocket (TLS, secret path, basic auth)
                       reverse proxy (Caddy) ─┤
                                              │ one route per friend
                    per-friend container ─────┘
                      └─ pi + game folder (copy)      ← the whole game, as on this machine
                          ├─ /data volume             ← worlds, chronicles  (persists)
                          ├─ /home/player/.pi volume  ← sessions, auth.json (persists)
                          └─ outbound: Anthropic API, MediaWiki hosts, YouTube
```

- **Terminal streaming:** ttyd (xterm.js + libwebsockets, one process per connection) is the off-the-shelf piece; a small node-pty + xterm.js server is the DIY alternative if we need custom routing/idle logic. Start with ttyd, one instance per friend behind the proxy.
- **One container per friend, always.** pi has **no built-in permission system** — it runs with the launching user's rights. Our game strips the coding tools, so the model itself can only reach the game tools, but the container is the actual security boundary: no shared volumes, no docker socket, read-only image, CPU/memory/disk limits, block RFC-1918 egress (the scrying glass needs open internet for its configured wiki hosts and YouTube, so a strict allowlist would fight `config/sites.json` — block the local network instead).
- **State that must survive:** the friend's `data/` (worlds — the irreplaceable part) and `~/.pi` (session files carrying the ledger, plus their `auth.json`). Both live in named volumes; nightly tar to off-box storage.
- **Updates:** `git pull` → rebuild image → recreate containers. Volumes untouched; chronicles survive by construction. This retires the scariest failure mode of the zip-distribution plan.

## The image

Base: debian/ubuntu slim. Contents:

| Piece | Note |
|---|---|
| pi | npm install of `@earendil-works/pi-coding-agent` (known-good extension loading), **or** the standalone Bun binary — verify once that the binary loads our `.ts` extensions identically, then prefer it (fewer moving parts) |
| game folder | `README.md`, `.pi/`, `extension/`, `config/`, `tools/yt-dlp` — never `research/` or `aitester/`, never any `auth.json` or `data/`; build the copy from a whitelist (`git archive`), not by copying the live working folder |
| python3 | required by `find_video` (`extension/mediasearch.ts` execs `python3 -m yt_dlp` against the vendored source) |
| ffmpeg | system package — enables the ~10 s clips without vendoring the 420 MB static build |
| ttyd | the terminal-to-web bridge |

## Auth: each friend, their own account (decision R5)

First run in the browser terminal: pi asks to trust the directory, then `/login` — the friend authenticates with **their** Anthropic account; `auth.json` lands in their private volume and never in the image. Their tokens, their spending, their `/limits` visibility. Our cost: the VPS.

- Policy state (re-checked 2026-08-04): since June 15, 2026 every paid Claude plan carries a monthly **Agent SDK credit pool** for third-party agents like pi — Pro ≈ $20/month (≈ 200–330 keeper turns at our cost estimate), Max tiers $100/$200; per-user, monthly reset, no rollover. Enough for casual friends; heavy players put an API key in their container env instead (always compliant). Re-verify once more the week the login flow ships. Timeline in [06-research-log.md](06-research-log.md).
- Interim alternative while the circle is tiny: our API key with a hard monthly cap. Acceptable only because every player is personally known; retired the moment anyone less than a friend gets a link.

## Sizing & cost

pi is a terminal app whose heavy lifting happens at the model provider; expect ~150–400 MB RAM per live container, spiking on yt-dlp runs. A 4 GB VPS (~$5–10/month) comfortably carries ~5 concurrent friends with an idle-reaper: stop a container after ~30 min without a WebSocket, start it again on connect (worlds persist; pi resumes the sitting).

## Known limitation — video scrying from a datacenter

`find_video` will degrade on a VPS: YouTube's bot-wall hits datacenter IPs hardest, and the escalation ladder documented in the main README loses its strongest rung here — there is no installed browser in a headless container to borrow cookies from. The identity-free PO-token plugin route has weakened too: upstream notes PO tokens alone no longer clear the bot check in most cases (re-checked 2026-08-04, [06-research-log.md](06-research-log.md)). What remains per friend: their own Netscape export at `config/youtube-cookies.txt` inside their volume, or accepting that `/web video` is a local-play luxury. Text and picture scrying (MediaWiki hosts) are unaffected. Set the expectation in the friend intro rather than debugging it live — and note the stage 3 compliance angle recorded in [03-public-launch.md](03-public-launch.md).

## What can still leak, accepted

- A friend can try to talk the keeper into reciting its prompt (the AI Dungeon precedent). Dampen, don't chase elimination — the full corpus and engine never leave the server either way.
- Worlds reveal themselves through play. That is called playing the game.

## Build checklist

1. [ ] Dockerfile as specified; build the game copy from a whitelist.
2. [ ] Verify in-container: TUI renders under ttyd; `/login` round-trip; a full sitting; `find_text` / `find_picture`; `find_video` (python3 + ffmpeg path — expect the YouTube bot-wall from a datacenter IP; see the limitation note above).
3. [ ] **Keybinding check in real browsers:** Alt+number is browser-sensitive (Firefox on Linux switches tabs with it) — confirm the `/pick` and `/roll` slash-command paths cover everything the Alt shortcuts do, and note the caveat in the friend-facing intro. Space-to-cast in the dice overlay must reach the terminal.
4. [ ] Caddy: TLS, one long-random secret path + basic-auth pair per friend, WebSocket pass-through.
5. [ ] Idle reaper + `docker stats` watch; disk quota per volume (downloads folder can grow — clips and pictures).
6. [ ] Nightly volume backup to off-box storage; test one restore.
7. [ ] Per-friend smoke sitting with each of the first 2–3 friends, watching latency and rendering (desktop browser first; phones work via xterm.js but the on-screen-keyboard experience is poor — say so upfront).
8. [ ] Write the two-paragraph friend intro: what it is, the trust prompt, `/login`, that play spends *their* tokens, `/limits` to check, and who to ping when the keeper misbehaves.

Effort estimate: a weekend to first playable link; one to two part-time weeks to the hardened version of everything above.

## Exit gates → stage 2

- ≥ 4 friends have completed multi-sitting stories without operator hand-holding; the ranked-findings loop (`/analyze-sessions`) has digested their sessions.
- Real per-turn cost telemetry extracted from session files (replaces every estimate in [03-public-launch.md](03-public-launch.md)).
- Backup/restore proven; update path exercised at least twice without a lost chronicle.
- The R5 policy check is current, and the stage 2 auth/billing design is written against what is true *then*.
