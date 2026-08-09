# Stage 1 — the friends web service

The existing game, unchanged, streamed into a browser tab. A friend clicks a secret link, sees the real terminal UI (dice overlay, four-slot board, footer and all), and plays on the house lane, metered (decision R12) *(2026-08-08: the BYO doors — own key or provider sign-in, R11 — are on ice; revival conditions in `research/icebox.md`)*. No installs, no git, no Node, no Python on their machine — no AI account either — and the source never leaves the server.

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
                              └─ outbound: model-provider APIs, MediaWiki hosts
```

- **Terminal streaming:** xterm.js in the page, fed over a WebSocket by the per-container **app server** (node-pty spawning pi) — promoted from 02's original "DIY alternative" because the panes, the auth injection (R11) and the shipper hooks (R13) need a server inside the container anyway ([08-stage1-web-ui.md](08-stage1-web-ui.md), decision R14). ttyd (xterm.js + libwebsockets) stays the day-one fallback: the game is playable in a bare terminal page before any pane exists. R1 is untouched either way — same streamed TUI, no rewrite.
- **The page around the stream:** three panes — terminal · viewer (tabs, markdown, media) · file manager — serving `config/` + `data/` read-only from inside the container. Nothing served is secret by design (invariant A5); the session files that *do* hold secrets (sealed fates, engine nonce) are never served. Spec, interaction laws and the login screen's face: [08-stage1-web-ui.md](08-stage1-web-ui.md).
- **One container per friend, always.** pi has **no built-in permission system** — it runs with the launching user's rights. Our game strips the coding tools, so the model itself can only reach the game tools, but the container is the actual security boundary: no shared volumes, no docker socket, read-only image, CPU/memory/disk limits, block RFC-1918 egress (the scrying glass needs open internet for its configured wiki hosts, so a strict allowlist would fight `config/sites.json` — block the local network instead).
- **State that must survive:** the friend's `data/` (worlds — the irreplaceable part) and `~/.pi` (session files carrying the ledger, plus their `auth.json`). Both live in named volumes; nightly tar to off-box storage.
- **Updates:** `git pull` → rebuild image → recreate containers. Volumes untouched; chronicles survive by construction. This retires the scariest failure mode of the zip-distribution plan.

## The image

Base: debian/ubuntu slim. Contents:

| Piece | Note |
|---|---|
| pi | npm install of `@earendil-works/pi-coding-agent` (known-good extension loading), **or** the standalone Bun binary — verify once that the binary loads our `.ts` extensions identically, then prefer it (fewer moving parts) |
| game folder | `README.md`, `.pi/`, `extension/`, `config/` — never `research/` or `aitester/`, never any `auth.json` or `data/`; build the copy from a whitelist (`git archive`), not by copying the live working folder. (R24 removed the last system dependency beyond node/pi: all three scrying lenses are plain MediaWiki HTTP — no python3, no ffmpeg, no vendored tools) |
| ttyd | the terminal-to-web bridge |

## Auth: any provider's open door, keys in the player's custody (decisions R5 → R11)

*(2026-08-08, R11 revised: **on ice.** The private beta offers the house lane only — no BYO door ships for now. This section stays the prepared shape the icebox entry points at; it builds only if a revival condition fires — `research/icebox.md`.)*

The login screen ([08-stage1-web-ui.md](08-stage1-web-ui.md)) offers the player's-own-credential doors first:

1. **Own API key** — the universal, always-compliant door. Any of pi's 40+ API-key providers (Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, …): pasted once, into the browser vault, never into any store of ours. The friend intro pushes the one mitigation that beats all architecture: a scoped key with a provider-side spend limit.
2. **Own provider sign-in (OAuth)** — only the flows whose providers permit hosted third-party use. Per the 2026-08-05 door table ([06-research-log.md](06-research-log.md)): **OpenRouter qualifies today** (PKCE minting a user-owned key — and one OpenRouter account reaches many models); the **Anthropic / Google / ChatGPT subscription doors are closed for hosted apps** (Anthropic prohibits offering Claude.ai login in third-party services; Google shut its consumer lane 2026-06-18; ChatGPT's Aug-2026 sign-in carries identity, not compute). ⚠ xAI / Kimi / Copilot: verify their terms at build week. Doors reopen the day a provider's policy does — the door table is the standing record of which are open, re-checked the week this ships (R5's trigger).

**Custody (R11):** the durable copy of every credential lives in the player's **browser vault** — IndexedDB ciphertext under a non-extractable WebCrypto device key, wrapped by a passkey (WebAuthn PRF) or an Argon2id passphrase, served from an isolated vault origin under strict CSP + Trusted Types. At connect, the vault injects `auth.json` over TLS into **tmpfs** in the player's container (the provisioning endpoint logs method/status/timing — never bodies); pi's OAuth refreshes rewrite `auth.json`, so a file-watch syncs rotations **back** to the vault; at session end the container teardown wipes the plaintext structurally. The `.pi` volume keeps sessions; `auth.json` never persists in it, and backups exclude it by name either way. Host hardening that makes the wipe real: core dumps off, no (or encrypted) swap. First-time OAuth enrollment runs in the terminal itself (`/login` — pi 0.83's headless provider sign-in and credential-export commands exist for exactly this), with the fresh tokens shipped down into the vault at session end and the server-side copy dying with the container.

Their credentials, their spending, their `/limits` visibility (Anthropic-lane requests). Our cost: the VPS. Playing with no credentials at all is the house lane — next section.

## The house lane: play without any key (decision R12)

The third door: no account, no key — the friend plays, we pay, and the meter runs from the first turn.

- **Plumbing:** the container's pi is pointed at our **gateway** instead of a provider (per-player virtual key with its own budget and rate limit — the LiteLLM-style component [03-public-launch.md](03-public-launch.md) specified for stage 2, built now); the gateway holds the **org API key** (commercial terms — the compliant operator-funded vehicle; never the personal subscription, see the 2026-08-05 research-log entry) and its metering is the billing source of truth, reconciled nightly against pi's own per-turn cost lines (R6: the telemetry collects itself).
- **The ledger, live early:** per-player balance, append-only transactions, free test-phase **grants** with a hard per-player cap (placeholder until telemetry: ≈ €10/month ≈ 100–170 rounds at the 6–10 ¢ estimate), the global daily spend alarm, and the monthly kill-switch cap that never comes off. A dry grant stops the lane with a friendly message and pings the maintainer — nothing is purchasable in stage 1.
- **Model routing is ours on this lane** (cheap-routing target per 03); BYO players keep their own model choice *(asleep while R11's doors are iced — 2026-08-08)*. The status strip shows the remaining rounds plainly ([08-stage1-web-ui.md](08-stage1-web-ui.md)) — an invisible meter is the genre's #1 complaint, even free.
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

pi is a terminal app whose heavy lifting happens at the model provider; expect ~150–400 MB RAM per live container (media fetches are plain HTTP downloads, ≤ 30 MB each). A 4 GB VPS (~$5–10/month) comfortably carries ~5 concurrent friends with an idle-reaper: stop a container after ~30 min without a WebSocket, start it again on connect (worlds persist; pi resumes the sitting).

*(The former "video scrying from a datacenter" limitation is resolved by R24: the video lens speaks the MediaWiki API to Commons like the other two — no bot-walls, no cookies, works from a datacenter exactly as it does locally. Its honest limit is the catalogue, not the network — set THAT expectation in the friend intro.)*

## What can still leak, accepted

- A friend can try to talk the keeper into reciting its prompt (the AI Dungeon precedent). Dampen, don't chase elimination — the full corpus and engine never leave the server either way.
- Worlds reveal themselves through play. That is called playing the game.

## Build checklist (absorbs R11–R14, 2026-08-05)

Two rungs, deliberately. The **fallback rung** — bare ttyd page, own-API-key pasted in the terminal, no panes — proves the whole pipeline and could serve friend #1 in a weekend. But hosted access and recording begin there, so even the fallback needs items 1–2 and 9–11 (image, disclosure, LICENSE line) before anyone plays. The **full rung** is R11–R14.

1. [x] Domain + Caddy: TLS, one long-random secret path + basic-auth pair per friend, WebSocket pass-through; reserve the `vault.` subdomain (R11's isolated credential origin). (Securing the eventual name's domain is 04's standing cheap move — same errand. Ruled 2026-08-07: the domain is **worldconsole.eu** at INWX — R17 — on the **netcup Vienna** box, AVV day 1, Hetzner the prepared runner-up — R18.) *(2026-08-08: the config half is built and verified end-to-end on the dev machine — `deploy/host/`, TLS + secret path + basic auth + proxied WebSocket, `vault.` reserved. Later the same day **the errand landed**: worldconsole.eu registered at INWX, the netcup Vienna box ordered, the click-AVV concluded in the CCP — R17/R18 executed. 2026-08-09: DNS live and propagated, first deploy stood, the maintainer's door minted and verified from outside — the item closes; state lives in `deploy/README.md` §first-deploy.)*
2. [x] Dockerfile as specified; game copy from a whitelist; no credentials in layers/args ever (BuildKit secret mounts only); host hardening that makes R11's wipe real: core dumps off, no (or encrypted) swap, `auth.json` path on tmpfs. *(2026-08-08: `deploy/image/` — npm path, pi pinned 0.84.1, ttyd pinned by checksum, agent dir tmpfs-shaped; §image's Bun-binary check stays open. The box-side hardening steps — core dumps, swap — are runbook'd and execute at first deploy.)*
3. [x] In-container verify: the TUI's dress renders in a real browser terminal — dice overlay, four-slot board, red urgency, bell (the pseudo-TTY probe's checklist, now behind xterm.js); a full sitting; all three lenses `find_text` / `find_picture` / `find_video` (Commons serves datacenters like anyone — R24). *(2026-08-08: the automatable parts are green in-container — unit gate with all three lenses live from inside the image, PTY probe, WebSocket stream probe (`deploy/image/verify.sh`). 2026-08-09: the eyeball sitting ran on the deployed box — dress, overlay, board urgency, bell and media announcements all as expected in real browsers; the item closes.)*
4. [x] Keybinding check in real browsers: Alt+number is browser-sensitive (Firefox on Linux switches tabs) — `/pick` and `/roll` cover everything; space-to-cast must reach the terminal *through the page* (R14's focus laws). *(2026-08-08: folded into the runbook's first-deploy eyeball sitting — no browser on the build machine. 2026-08-09: green in Firefox and a Chromium-family browser — space-to-cast reached the terminal, `/pick`/`/roll` carried; the item closes. The pane-page focus laws (08 law 5) re-verify in the app-server round's own eyeball — that half is item 5's acceptance, not this item's.)*
5. [x] App server + panes ([08-stage1-web-ui.md](08-stage1-web-ui.md)): node-pty ↔ pi, file API scoped to `config/` + `data/`, watcher → hot-reload, tabs, media auto-open; meet 08's smoothness acceptance numbers on the VPS. *(2026-08-09: built and DEPLOYED — the app server (node-pty ↔ pi, xterm.js over `/ws/term`, traversal-proof read-only file API over the two pane roots, chokidar → `/ws/events` on its own socket) and the three-pane page per 08's laws; ttyd demoted to the fallback rung (Dockerfile CMD note; verify leg 4 keeps it honest). Probes green on the dev machine and the box; server-side smoothness receipts well inside budget (file 4 ms, watcher hop ~26 ms). The item CLOSES at the maintainer's pane-page eyeball — perceived smoothness and the focus laws are R9's acceptance look, not a probe's. The eyeball ran the same day: green in the real browsers, everything as intended — the item closes.)*
6. [ ] **(on ice 2026-08-08 — R11 revised; icebox)** The vault (R11): enroll (paste key / terminal OAuth with export-down), passkey-PRF wrap with Argon2id fallback, isolated origin + CSP + Trusted Types, inject → tmpfs, rotation sync-back, and a verified wipe: after teardown, no `auth.json` in any volume, backup, or image layer.
7. [ ] **(on ice 2026-08-08 — sleeps with the doors; wakes at icebox revival or stage-2 design)** Door table re-verified the week this ships (R5/R11's trigger; Anthropic's paused credit plan checked monthly; xAI/Kimi/Copilot terms checked before their doors are shown).
8. [ ] House lane (R12): org API account with a provider-side spend cap; gateway with per-friend virtual keys (budget + rate limit); ledger with grants, the global daily alarm, the monthly kill-switch; rounds visible in the status strip; nightly reconciliation against pi's per-turn cost lines. House-lane model mix chosen with provider terms in view (Gemini's under-18 clause — door table; the age policy is ruled 18+, R20). *(2026-08-09: the org key is minted early and stays in the maintainer's custody, outside the repo and outside any transcript (password manager); it reaches the box only as a gitignored `.env` secret when the gateway builds — never the repo, never an image layer. Before the lane's first turn: confirm the provider-side spend cap is set.)*
9. [ ] Disclosure live **before the first friend plays** (R13): landing/privacy note + first-run notice (drafts in [06-research-log.md](06-research-log.md)), consent + the 18+ assertion (R20) recorded at invite-acceptance; deletion runbook written and dry-run once.
10. [ ] Shipper (R13): checkpoint mirror, seal-at-end with manifest + hashes, sweep-on-connect + daily cron; central store private and EU-located; the analysis machine's mirror pull lands in the kit's `sessions-in` layout; ship-twice idempotency tested.
11. [ ] The friend intro (two paragraphs, plus the LICENSE line — R3's trigger fires at first hosted access): what it is, the trust prompt, the house lane and its cap *(2026-08-08: one door for now — the three-doors walkthrough and scoped-key advice sleep with R11's icebox entry)*, that play is recorded (link to the note), `/limits`, the glass's video expectation (Commons catalogue — honest misses are normal), the phone caveat, who to ping when the keeper misbehaves.
12. [ ] Idle reaper wired to the seams: a stop is *both* R11's wipe and R13's seal; `docker stats` watch; disk quota per volume (downloads grow — clips and pictures). *(2026-08-09: the app-server SEAM landed with item 5 — `/healthz` carries `idleSeconds`, lifecycle logs mark connect/disconnect/spawn/exit, a stop is already a clean pi hangup, and pi only spawns on first attach so an idle container carries no game process. The host-side half — stop-on-idle, start-on-connect, per-volume quotas — is PROPOSED to ride the shipper round (R13), where a stop gains its seal meaning; with R11 iced there is nothing to wipe yet, and one friend on a 4 GB box leaves no RAM pressure. Ruled 2026-08-09: it rides the shipper round.)*
13. [ ] Nightly volume backup to off-box storage, excluding `auth.json` by construction; test one restore. The central session store backs up separately (it is the research record).
14. [ ] Per-friend smoke sitting with each of the first 2–3 friends, watching latency and rendering (desktop first; phones work via xterm.js but the on-screen-keyboard experience is poor — say so upfront).

Effort estimate: the fallback rung stays a weekend; the full rung is realistically **two to four part-time weeks**, vault and ledger dominating — both are stage-2 work done early on purpose (R12's front-load argument). *(2026-08-08, R11 iced: the vault leaves the rung — but the fallback rung's own-key door leaves with it, so even friend #1 rides the house lane, which pulls at least a minimal gateway + grant cap forward. The ledger now dominates the estimate alone.)*

## Exit gates → stage 2

- ≥ 4 friends have completed multi-sitting stories without operator hand-holding; the ranked-findings loop (`/analyze-sessions`) has digested their sessions **arriving via the shipper, not hand-carried** (R13 end-to-end).
- Real per-turn cost telemetry from shipped sessions replaces every estimate in [03-public-launch.md](03-public-launch.md) (the per-turn `usage.cost` field is already summable — sweep receipt in 06).
- House-lane ledger reconciles to the cent against pi's cost lines over a full month; caps and kill-switch proven by deliberately draining a test grant.
- Backup/restore proven; update path exercised at least twice without a lost chronicle; **one deletion request executed end-to-end** (volume + central store + analysis mirror).
- The R5/R11 door table is current *(2026-08-08: iced with the doors — "current" re-earns at stage-2 design, the icebox revival trigger)*, and the stage 2 auth/billing design is written against what is true *then*.
