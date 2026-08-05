# Stage 1 — the friends web service

The existing game, unchanged, streamed into a browser tab. A friend clicks a secret link, sees the real terminal UI (dice overlay, four-slot board, footer and all), brings their own key or provider sign-in once (decision R11) — or picks the house lane and plays on us, metered (decision R12). No installs, no git, no Node, no Python on their machine — and the source never leaves the server.

**Goal:** zero-setup play for invited friends; real human playtesting; the update path that cannot destroy a chronicle.
**Non-goals (deferred to stage 2):** accounts database, payments, serving strangers. (Our org key underneath *friends* is now in scope — the ledgered house lane, decision R12; strangers on any lane stay stage 2+.)

## Architecture

```
friend's browser ── the three-pane page: terminal + viewer + files (R14, [08]) ──┐
                                              │ WebSocket + HTTPS (TLS, secret path, basic auth)
                       reverse proxy (Caddy) ─┤
                                              │ one route per friend
                    per-friend container ─────┘
                      └─ app server: node-pty ↔ pi · xterm WS · file API · watcher · R11/R13 hooks
                          └─ pi + game folder (copy)      ← the whole game, as on this machine
                              ├─ /data volume             ← worlds, chronicles  (persists)
                              ├─ /home/player/.pi volume  ← sessions (persist); auth.json = tmpfs, per-session (R11)
                              └─ outbound: model-provider APIs, MediaWiki hosts, YouTube
```

- **Terminal streaming:** xterm.js in the page, fed over a WebSocket by the per-container **app server** (node-pty spawning pi) — promoted from 02's original "DIY alternative" because the panes, the auth injection (R11) and the shipper hooks (R13) need a server inside the container anyway ([08-stage1-web-ui.md](08-stage1-web-ui.md), decision R14). ttyd (xterm.js + libwebsockets) stays the day-one fallback: the game is playable in a bare terminal page before any pane exists. R1 is untouched either way — same streamed TUI, no rewrite.
- **The page around the stream:** three panes — terminal · viewer (tabs, markdown, media) · file manager — serving `config/` + `data/` read-only from inside the container. Nothing served is secret by design (invariant A5); the session files that *do* hold secrets (sealed fates, engine nonce) are never served. Spec, interaction laws and the login screen's face: [08-stage1-web-ui.md](08-stage1-web-ui.md).
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

## Auth: any provider's open door, keys in the player's custody (decisions R5 → R11)

The login screen ([08-stage1-web-ui.md](08-stage1-web-ui.md)) offers the player's-own-credential doors first:

1. **Own API key** — the universal, always-compliant door. Any of pi's 40+ API-key providers (Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, …): pasted once, into the browser vault, never into any store of ours. The friend intro pushes the one mitigation that beats all architecture: a scoped key with a provider-side spend limit.
2. **Own provider sign-in (OAuth)** — only the flows whose providers permit hosted third-party use. Per the 2026-08-05 door table ([06-research-log.md](06-research-log.md)): **OpenRouter qualifies today** (PKCE minting a user-owned key — and one OpenRouter account reaches many models); the **Anthropic / Google / ChatGPT subscription doors are closed for hosted apps** (Anthropic prohibits offering Claude.ai login in third-party services; Google shut its consumer lane 2026-06-18; ChatGPT's Aug-2026 sign-in carries identity, not compute). ⚠ xAI / Kimi / Copilot: verify their terms at build week. Doors reopen the day a provider's policy does — the door table is the standing record of which are open, re-checked the week this ships (R5's trigger).

**Custody (R11):** the durable copy of every credential lives in the player's **browser vault** — IndexedDB ciphertext under a non-extractable WebCrypto device key, wrapped by a passkey (WebAuthn PRF) or an Argon2id passphrase, served from an isolated vault origin under strict CSP + Trusted Types. At connect, the vault injects `auth.json` over TLS into **tmpfs** in the player's container (the provisioning endpoint logs method/status/timing — never bodies); pi's OAuth refreshes rewrite `auth.json`, so a file-watch syncs rotations **back** to the vault; at session end the container teardown wipes the plaintext structurally. The `.pi` volume keeps sessions; `auth.json` never persists in it, and backups exclude it by name either way. Host hardening that makes the wipe real: core dumps off, no (or encrypted) swap. First-time OAuth enrollment runs in the terminal itself (`/login` — pi 0.83's headless provider sign-in and credential-export commands exist for exactly this), with the fresh tokens shipped down into the vault at session end and the server-side copy dying with the container.

Their credentials, their spending, their `/limits` visibility (Anthropic-lane requests). Our cost: the VPS. Playing with no credentials at all is the house lane — next section.

## The house lane: play without any key (decision R12)

The third door: no account, no key — the friend plays, we pay, and the meter runs from the first turn.

- **Plumbing:** the container's pi is pointed at our **gateway** instead of a provider (per-player virtual key with its own budget and rate limit — the LiteLLM-style component [03-public-launch.md](03-public-launch.md) specified for stage 2, built now); the gateway holds the **org API key** (commercial terms — the compliant operator-funded vehicle; never the personal subscription, see the 2026-08-05 research-log entry) and its metering is the billing source of truth, reconciled nightly against pi's own per-turn cost lines (R6: the telemetry collects itself).
- **The ledger, live early:** per-player balance, append-only transactions, free test-phase **grants** with a hard per-player cap (placeholder until telemetry: ≈ €10/month ≈ 100–170 rounds at the 6–10 ¢ estimate), the global daily spend alarm, and the monthly kill-switch cap that never comes off. A dry grant stops the lane with a friendly message and pings the maintainer — nothing is purchasable in stage 1.
- **Model routing is ours on this lane** (cheap-routing target per 03); BYO players keep their own model choice. The status strip shows the remaining rounds plainly ([08-stage1-web-ui.md](08-stage1-web-ui.md)) — an invisible meter is the genre's #1 complaint, even free.
- **Why the lane exists:** it removes the last onboarding wall for exactly the friends whose playtest data the test phase wants (decision R13), and it exercises stage 2's riskiest component months before money touches it — purchased token packs are top-ups on these same rails.

- Policy state (re-checked 2026-08-05 — **corrects 2026-08-04**): Anthropic's June-15 Agent SDK credit pool **never took effect** — paused June 15–16, 2026 ("nothing changes for now"); subscription usage draws ordinary limits again, for first-party/local surfaces only, and hosted third-party apps may not offer Claude.ai login at all. Consequence here: an Anthropic-subscribed friend plays this hosted copy with an API key (or the house lane); their subscription still serves any local copy they run. Timeline, door table and sources: [06-research-log.md](06-research-log.md).

## Play sessions are research data (decision R13)

The shipper is a small allowlist job inside each container; the store is ours and private. What ships, when, and what the player is told:

- **Unit = the session.** pi's session JSONL (`~/.pi/agent/sessions/<cwd-key>/<stamp>_<uuidv7>.jsonl`) plus the chronicle folder that session stamped (`data/world/<world>/<uuidv7>/`) — the uuid joins them. Strict allowlist, never a blocklist: `auth.json` is a *sibling* of the sessions dir and must be unshippable by construction. `data/downloads/` stays home (big, re-fetchable, and every scrying is already in the ledger).
- **Three triggers, all idempotent** (session id keys the destination; shipping twice is a no-op): (1) debounced incremental mirror during play, ~10-minute checkpoints, rclone-semantics size+modtime skip — pi's session writes are debounced, so the mirror tolerates a lagging tail; (2) **seal at session end**: write `manifest.json` (session id, player, `git log -1` stamp, start/end, per-file SHA-256), final sync, verify hashes store-side, write the `sealed` marker **last**, then compact centrally to `sessions/<player>/<session-id>.tar.zst`; (3) **sweep on connect + daily cron**: any unsealed session gets trigger-2 treatment — the crash path ships whatever hit disk, truncated at the last complete JSONL line.
- **Where:** one private, EU-located store (server volume now; S3-compatible bucket with lifecycle rules if it outgrows the box), encrypted at rest, maintainer-only. The analysis machine pulls a mirror — the kit (`/analyze-sessions`, session-map) runs locally as today, and playtest reports stay immutable. Same privacy tier as `research/` (R4): never public, never in any player copy. Retention: beta life + 12 months at most; per-player deletion is one prefix + one volume (tractable by construction).
- **Told before playing, plainly** (landing page + first-run notice; draft wording in [06-research-log.md](06-research-log.md)): recorded in full; **the developer personally reads sessions** (never soften this); don't type real personal details — the game doesn't need them and the record keeps everything (a minimization ask, not a legal shield); consent at invite-acceptance; withdraw/delete within a month; host and model provider named as recipients.
- **Scope:** hosted sessions only — offline copies ([05](05-offline-distribution.md)) never phone home.

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
