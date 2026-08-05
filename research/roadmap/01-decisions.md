# Decision record

Decisions taken 2026-08-04. Each entry: what was decided, why, what was rejected, and when to revisit. Evidence lives in [06-research-log.md](06-research-log.md).

## How this registry works (the guardrail)

- **Two registries govern this project.** Game-design law lives in [`research/design/undertakings-goals.md`](../design/undertakings-goals.md) (the G/F/P/A entries) with its running decisions log in [`research/design/undertakings-build.md`](../design/undertakings-build.md); product and distribution law lives here (R1–R8). The root `CLAUDE.md` binds every future research or planning session to check both **before** adopting new findings.
- **Deviations are marked, never silent.** New material that contradicts a standing entry is neither adopted nor discarded quietly: it gets a `⚠ DEVIATION (<id>): <one line>` marker in the document where it lands, and goes to the maintainer for a ruling.
- **Rulings amend entries in place, dated** — "(revised 2026-08-05: …)" or "superseded by R9, 2026-08-05" — never a silent rewrite. Same convention the goals file already uses ("G7 … revised 2026-08-03, audit round").
- **Ids are never reused.** New decisions take the next free number here (R9…) or in the goals file (G15…). The design↔code audit's D1–D12 belong to that document alone.

---

## R1 — Distribute as a hosted web service, not as packaged builds

**Decided:** The primary way anyone plays World Console (beyond this machine) is a browser tab pointed at a server we run. The existing terminal game is streamed as-is via xterm.js/ttyd; no rewrite.

**Why:**
- Client-side, this game cannot keep secrets. The worlds, laws, constitution and moods are hot-reloaded markdown — prose cannot be compiled — and even the layered prompt travels to the model API from the player's machine, where it can be read in transit or extracted by asking. Server-side hosting is the only architecture where "the code is invisible" is actually true.
- One click for testers beats every install story we researched (zips, npm, binaries, Python-for-video, SmartScreen warnings).
- Updates stop being dangerous: worlds live in server-side volumes; replacing the game folder can no longer delete a friend's chronicle.

**Rejected:**
- *Single compiled executable.* Would require forking pi (the engine reads the game from a folder by design, and writes its world back as markdown files — a design pillar), bundles ~100 MB per OS, needs Python for video, and still hides nothing that matters. All cost, no protection.
- *Obfuscation / bytenode / Node SEA.* Covers only the ~13 engine files, not the prose that is the game; Node SEA even embeds source readable. Raises reading cost slightly, protects nothing.

**Revisit when:** hosting economics or provider policy break (see R5); then [05-offline-distribution.md](05-offline-distribution.md) is the prepared exit.

---

## R2 — Staged rollout: friends → paid invite beta → public

**Decided:** Stage 1 serves invited friends only, free, with players on their own Anthropic logins. Stages 2–3 (strangers) happen only behind a prepaid credit ledger.

**Why:** An open, free LLM endpoint is a money pump aimed at the operator: honest randoms cost real dollars per evening (~5–10 ¢ per keeper turn at Sonnet-class prices), and dishonest ones farm it as free model access through the chat box — the documented fate of AI Dungeon's GPT-3 era. Both researched AI-RPG businesses (Old Greg's Tavern, Friends & Fables) gate every expensive path behind subscriptions, credits, or hard daily caps. Nobody serves strangers unmetered; neither will we.

**Rejected:** *Public-and-free on our API key* — even briefly, even "just to get players." A hard monthly spend cap converts this from ruinous to merely wasteful; it stays rejected.

---

## R3 — All rights reserved now; open source stays a live option for later

**Decided:** The repo keeps full default copyright (no permissive license). An explicit LICENSE/NOTICE stating "© Tobias Maier, all rights reserved — personal play by invitation welcome, no redistribution" should be added when the first copy or hosted access leaves our hands. Open-sourcing remains a genuine later option — chosen at a launch moment, with the license picked then.

**Why:** The asymmetry is absolute: closed → open is always possible; open → closed is impossible for anything already shipped (Aseprite closed its license going forward in 2016 — its GPL past lives on as the LibreSprite fork). Staying closed today costs nothing and forecloses nothing.

**Already ruled out for the eventual choice:** MIT/permissive — it expressly permits the silent commercial rebrand that motivated this whole research thread. Candidates that survive: **GPLv3/AGPL** (copies must stay open and credited; AGPL also binds anyone hosting it as a service — directly relevant since our own future *is* a hosted service) and **PolyForm Noncommercial** (source visible, all commercial use forbidden). Split licensing (engine open, worlds/papers reserved) stays on the table. Details in [04-licensing-and-ip.md](04-licensing-and-ip.md).

---

## R4 — The R&D stays back regardless

**Decided:** `research/` (the design, analysis and roadmap papers) and `aitester/` are never part of player copies, the hosted image's exposed surface, or any future public repo — unless separately and deliberately decided. "Open the game" and "publish the research record" are two different decisions.

**Why:** Those folders are the recipe — mechanics spec, research trail, playtest telemetry kit, this plan. If copying is the fear, the papers are more copyable than the code.

---

## R5 — Players bring their own Anthropic account for as long as policy allows

**Decided:** Stage 1 friends log in with their own accounts inside their own container (`/login`, auth stored in their private volume). Our org API key enters the picture only in stage 2, behind the gateway and ledger. Plain API keys are the always-compliant fallback for friends who prefer them.

**Why:** It keeps our cost at zero and spending visible to the person spending (`/limits` already shows the buckets). But this rides on moving ground: Anthropic banned consumer-plan OAuth in third-party tools (Feb 2026), cut third-party agents off subscriptions (April 4, 2026), then partially reversed with allocatable "Agent SDK credits" (May 2026). Three policy changes in five months.

**Revisit when:** building stage 1's login flow (re-check the current policy that week), and before any stage 2 architecture is finalized.

*(revised 2026-08-05, stage-1 design round: extended and part-superseded by R11/R12. Sign-in widens from "their own Anthropic account" to every pi provider door the provider's policy leaves open in a hosted app, and durable credential custody moves into the player's browser (R11); an operator-funded lane exists from stage 1 on the org API key under Commercial Terms (R12) — the "org API key enters the picture only in stage 2" clause is superseded. ⚠ The 2026-08-04 "June-15 Agent SDK credit pool" status is stale: Anthropic PAUSED that plan June 15–16 before it took effect, and separately prohibits hosted third-party apps from offering Claude.ai login at all — full re-check in the 2026-08-05 sections of [06-research-log.md](06-research-log.md).)*

---

## R6 — One roadmap, evidence-gated

**Decided:** Each stage document carries explicit entry gates (stability, telemetry, legal readiness). Moving to the next stage requires the gates, not momentum. Cost assumptions in these documents are estimates until stage 1's real telemetry replaces them — pi records per-turn cost in every session file, so the data collects itself.

---

## R7 — Steam comes after the public web launch, as the same game on the same servers

*(R7–R8 added 2026-08-04 after migrating the prior project's platform research — facts and sources in [06-research-log.md](06-research-log.md).)*

**Decided:** Steam is stage 4: an Electron shell around the exact same browser client, on the same accounts and credit ledger, free to start with in-client credit packs through Steam's MTX API. The web service stays canonical. The "Coming Soon" page goes live early in stage 3 to accumulate wishlists.

**Why:** Web-first validation is the community-consensus sequence — the web channel iterates with no review cycle, while Steam reviews are permanent and a raw launch burns the one first impression. Shared servers/accounts across Steam and own-site is an established, Valve-tolerated pattern (RuneScape, Screeps: World, Melvor Idle). Electron is proven on Steam; no Tauri precedent was found. And the offer must be identical everywhere: a paid Steam SKU of a free web game is the documented flop pattern (A Dark Room's Steam port).

**Rejected:** Steam-first (iteration throttled by reviews + the 30-day wait, on an unvalidated game); any paid-SKU shape.

**Revisit when:** stage 3 begins (page timing) — and re-verify all Steam policy facts then (⚠ they were researched 2026-08-01).

---

## R8 — Money buys AI compute, never mechanical advantage

**Decided:** Purchased rounds/credits spend exclusively on AI usage (turns, premium calls like sagas or video scrying). Nothing mechanical is ever purchasable: grit rerolls stay one-per-quest and earned, favored/hindered dice require a recorded fictional reason, renown is walked for, wounds heal only when the fiction earns it. This deliberately forecloses "buy a reroll" forever.

**Why:** This game runs on open dice, and purchasable currency near chance mechanics is legally radioactive: *Kater v. Churchill Downs* (9th Cir. 2018) held purchasable virtual chips can be a "thing of value," making a game illegal gambling under state law **even with no cash-out**; Steam bans gambling outright; state regulators remain active. Our prepaid-compute model is safe precisely because money never touches outcomes — and beyond the law, "no hidden modifiers anywhere" is the game's identity, and a purchasable die would be the most hidden modifier of all.

**Rejected:** purchased rerolls/boons/healing; ad-subsidized rounds (Steam rule 14 bans ad-based models, and it is a poor fit regardless).

---

## R9 — Commit per revertible change, push per verified checkpoint

*(added 2026-08-05 after the batch-3 round; operational rules bind every session via CLAUDE.md "Committing & pushing")*

**Decided:** The commit is the unit of REVERT, not the unit of session or
reply. One commit = one logical change that (a) could be `git revert`ed
alone and still make sense, and (b) leaves the tree green (fast unit gate
before every commit touching `extension/`; full recipe before push). A
maintainer ruling with N items becomes ~N commits landed one by one as
each goes green — entangled fixes that cannot be verified apart stay
together in one commit (that IS one logical change); independent fixes
never share one. Docs, tests and registry lines ride in the commit of the
change they describe; the round narrative (build-log entry, cross-cutting
records) closes the round as its own wrap commit. Pushes happen at
VERIFIED CHECKPOINTS only — a few per session, never per commit, never
red: after a task-group lands verified, ALWAYS before an AI batch
launches (meta.md stamps `git log -1`; no commits mid-batch, ever), at
round/session end (a session never ends with unpushed work — a clearly
marked `wip:` commit is allowed when truly interrupted), and before
anything sweeping or risky. Messages keep the house narrative register,
scoped to the one change: `<surface>: <what and why in one breath>`. This
decision is the maintainer's standing authorization: sessions commit and
push per this policy without asking each time; history-rewriting git
(amend after push, rebase, force-push, reset) stays ask-first.

**Why:** The batch-3 era exposed both failure modes in one day. The
"chronicler round" landed as ONE commit — 23 files, ~1,950 lines,
fourteen concerns — where reverting any single feature is surgery; and
mid-round a commit had to be artificially HELD BACK so a running batch
would not split across two stamps. Atomic-commit doctrine exists for the
first problem (smallest meaningful change → `git revert` in seconds,
`git bisect` lands on the culprit); the agent-era consensus adds
verify-before-commit as the bisectability guarantee. The checkpoint-push
rule solves the second structurally: batches always run against a pushed,
stamped, green commit.

**Rejected:** *Feature-branch-per-task with PRs* — the 2026 team default,
but this repo is one maintainer plus one agent session on a trunk; a
branch layer would add ceremony with no reviewer to serve (worktrees
remain the tool for parallel agents, which this repo doesn't run).
*Commit-per-reply / auto-checkpoint commits* — noise without revert
value. *Conventional-commit prefixes (feat:/fix:)* — machine-readable but
foreign to the house register; the surface-prefix style carries the same
information here.

**Revisit when:** a second human contributor or CI lands (branches + PRs
return then), or a batch's stamp discipline fails in practice — or the
maintainer adopts a standing REVIEWER thread (clarified 2026-08-05): an
advisory post-commit reviewer needs no revision (atomic commits are its
food); a gating reviewer slots into the existing commit≠push gap
("verified checkpoint" grows to mean recipe-green AND review-clean —
still no branches); only a reviewer that also WRITES in parallel with the
main thread brings worktrees/branches back.

---

## R10 — Sessions end at round boundaries, by the session's own judgment

*(added 2026-08-05; extends R9's round-end wrap — operational rules bind
every session via CLAUDE.md "Session cut points")*

**Decided:** Deciding when a session should END is the SESSION's duty,
not the maintainer's — only the AI can feel its own context strain, and
the maintainer cannot. A session must proactively recommend a cut (never
wait to be asked) when BOTH hold: (1) a round just closed per R9 — wrap
commit done, suites green, pushed, zero silent deviations, no open tasks
— and (2) the next work item is a substantial new round (an
implementation round, a batch, an audit) OR the session notices genuine
strain (re-reading files it already read to answer, uncertainty about its
own earlier in-session decisions, heavy compaction behind it). Never cut
mid-round — mid-round interruption is R9's `wip:` + the harness's own
compaction, which exists precisely for continuation. At a cut the session
runs the COLD-START TEST — "could a fresh session reconstruct everything
needed from CLAUDE.md and the owning documents alone?" — repairs any
record gap it finds (that gap is a records bug, not a memory bug), then
ends with a paste-ready opener pointing at the owning documents. THERE IS
NO HANDOFF FILE: the repo's records ARE the handoff (build log carries
the next-step checkbox; registries carry the decisions; reports carry the
findings). The opener points; it never restates.

**Why:** Context degradation is measured, not felt: accuracy drops of
30–50% begin well before documented window limits (~50K tokens of a 200K
window in Chroma's 2025 study, across 18 frontier models), hit complex
tasks hardest, and skew attention toward recent tokens — exactly the
failure surface of this project's long implementation rounds. Practice
consensus matches: fresh-session-per-distinct-round, with handoffs as
pointers to typed state, "without duplicating file content." This
project already paid the whole cost of that architecture — records-first,
reconstructable from the repo (proven 2026-08-05 when a fresh-session
readiness check passed against the live tree) — so the fresh window is
nearly free, and the only missing piece was WHO decides. Sessions have
the information; now they have the duty.

**Rejected:** *A literal self-respawn* — the harness cannot start its
successor, and session boundaries should stay in the maintainer's hands
anyway (the session decides and prepares; the maintainer presses new).
*Token-count thresholds* — a session cannot honestly measure its own
usage; a number would be hallucinated precision, so triggers are
event-based (round boundaries) plus named behavioral signals.
*A standing HANDOFF.md* — a second home for state that drifts from the
registries; forbidden by the one-truth-one-home rule.
*Always-compact-never-cut* — compaction is the right tool mid-round; at
round boundaries the research says a fresh window simply reasons better.

**Revisit when:** the harness gains a trustworthy context-usage readout
for the session itself (thresholds become honest then), or cut
recommendations turn out too eager/too timid across a few rounds (tune
the criteria against real use).

---

## R11 — Every door pi offers, wherever the provider still opens it — and the keys live with the player

*(added 2026-08-05, stage-1 design round, on the maintainer's instruction; part-supersedes R5 — dated note there. Evidence: the 2026-08-05 sections of [06-research-log.md](06-research-log.md); auth mechanics live in [02-friends-web-service.md](02-friends-web-service.md) §Auth.)*

**Decided:** The stage-1 login is multi-provider: every provider the installed pi speaks (0.83.0 ships seven OAuth flows — Anthropic, ChatGPT/Codex, GitHub Copilot, OpenRouter, xAI, Kimi, Radius — plus 40+ API-key provider ids) is offered through whichever credential door that provider's **current policy permits inside a hosted third-party app**. As of 2026-08-05 that means: **API keys are the universal door** (Anthropic explicitly directs third-party products to them; Google affirmatively recommends the player's own AI Studio/Vertex key; OpenAI's works-but-"not supported" stance on BYOK apps is carried as a flagged risk, not a ban), **OpenRouter's PKCE flow qualifies** (it mints a user-owned API key and exists for third parties — and aggregates many models behind one account), and the three big consumer-subscription doors are **closed for hosted apps**: Anthropic prohibits offering Claude.ai login outright, Google shut its consumer OAuth lane down entirely (June 18, 2026), and ChatGPT has no general mechanism (the Aug 2, 2026 "Sign in with ChatGPT" carries identity, not compute). xAI/Kimi/Copilot flows are ⚠ unverified for hosted use and get checked the week the login ships — R5's standing trigger, which now owns a per-provider **door table** in the research log. Credential custody: **the durable copy of every credential lives in the player's browser vault, never on our server** — IndexedDB ciphertext under a non-extractable WebCrypto device key, wrapped by a passkey (WebAuthn PRF) or an Argon2id passphrase, served from an isolated vault origin under strict CSP + Trusted Types; injected per session over TLS to a no-body-logging endpoint into a tmpfs-backed `auth.json` in the player's own container; synced **back** to the vault when pi rotates OAuth tokens (pi rewrites `auth.json` on refresh — custody without sync-back strands rotating tokens); structurally wiped at session end (container teardown; host: core dumps off, no or encrypted swap; volume backups exclude `auth.json`).

**Why:** Any-provider entry multiplies who can play without touching our cost (R5's principle, widened). Client custody removes the one thing worth breaching: the documented BYOK incidents cluster on server-side key stores (SillyTavern's exfiltration PSA, May 2026; Chatbot UI's hosted-key leak), while the client-custody precedents (TypingMind, big-AGI) run clean — there is no vault of friends' tokens for us to guard, lose, or answer for. The honesty stays in the design: during a live session the player's container necessarily holds plaintext, and we ship the JavaScript — client custody shrinks blast radius and liability, it does not make us untrusted-server-proof (WAICT is the watched fix); the strongest practical mitigation is pushed at every player instead: scoped keys with provider-side spend limits.

**⚠ DEVIATION note, surfaced for the maintainer (2026-08-05):** the instruction that seeded this entry envisioned subscription sign-in with "Anthropic, Google, ChatGPT…". The verified August-2026 policy ground prohibits exactly those three subscription doors in a hosted app. This entry adopts the compliant subset under R5's own "for as long as policy allows" bound. Ruling requested: confirm the constrained shape (doors reopen the day a provider permits them — the table is standing law for which are open), or direct otherwise; shipping prohibited doors is one enforcement sweep away from banned player accounts and is not recommended.

**Rejected:** *A central encrypted key store* (the LibreChat/OpenRouter shape) — one breach is every player's provider keys, and it makes us a standing credential custodian, the exact liability the ruling removes. *Plaintext browser localStorage* (the TypingMind default) — OWASP's flat "do not": one XSS reads every key; the vault is the hardened version of the same custody idea. *Split custody* (ciphertext on our server, key client-side) — buys device roaming, but a durable copy still sits with us, against the ruling's letter. *Per-session re-authorization, zero storage anywhere* — maximal security, worst friction, and it converges on the vault the moment anything is cached.

**Revisit when:** the login flow is built (re-run the door table — and monthly for Anthropic's paused Agent SDK credit plan, which could resume in any shape); WebAuthn PRF support at implementation start (the fastest-moving fact in the custody research); the IETF browser-apps BCP when it lands as an RFC (~Jan 2027); WAICT quarterly — if it ships, the threat-model note upgrades.

---

## R12 — The house lane: operator-funded play from stage 1, one ledger from test grants to sold tokens

*(added 2026-08-05, stage-1 design round, on the maintainer's instruction; revises R5's "org key only in stage 2" clause — dated note there. Lane mechanics in [02-friends-web-service.md](02-friends-web-service.md); the money loop stays [03-public-launch.md](03-public-launch.md)'s.)*

**Decided:** The login screen's third door: **play with no key at all.** House-lane turns route through our gateway — the LiteLLM-style per-player virtual keys 03 specified for stage 2, built now — onto the **maintainer's org API key under the provider's commercial terms**, which is expressly the compliant vehicle (Anthropic's Commercial Terms §A.1 allow powering "products and services Customer makes available to its own customers and end users") and expressly **not** the maintainer's personal subscription, which consumer terms forbid sharing, reselling, or automating (research log, 2026-08-05). The maintainer carries the cost deliberately: the test phase buys playtest data (R13 rides this lane hardest). Metering exists from the first turn, in the **credit ledger stage 2 was always going to need**: per-player balances, append-only transactions, per-player hard caps (test-phase grants are free credits), the global daily spend alarm, and the monthly kill-switch cap that never comes off — 03's standing rule, live early. House-lane model routing is ours (the cheap-routing target); BYO players keep their own model choice. **The same ledger is the token feature:** stage 2's purchased packs are top-ups on these exact rails (Stripe per 03), premium credits ride the same accounting, and at public launch the free-grant faucet narrows to the trial-sized taste 03 already draws. R2 stands untouched — strangers never meet an unmetered endpoint; a capped, ledgered, invite-only lane is not "public-and-free on our API key," which stays rejected. R8 stands — house credits buy compute, never advantage.

**Why:** It removes the last onboarding wall — a friend with no AI account plays in one click, which is exactly the population whose playtest data the test phase exists to collect. And it front-loads stage 2's riskiest component: by the time real money touches the ledger, grants, caps, metering and reconciliation (pi's per-turn cost lines, R6) have run for months on friends.

**Rejected:** *Funding from the personal subscription* (the instruction's literal reading — surfaced for the maintainer with the ruling request in the summary of 2026-08-05) — prohibited three ways by consumer terms (account sharing, resale, automated access) and one enforcement action from losing the maintainer's own account; the funding intent survives, the vehicle changes. *Unmetered friend play on the org key* (the old 02 "interim alternative") — R2's lesson gates every expensive path from day one; the real ledger replaces the interim hack entirely. *A throwaway test-phase mechanism* — it would be rebuilt for tokens within months; building the ledger once is cheaper than twice.

**Revisit when:** stage 2's payment integration starts (processor, prices, top-up shapes — derived from real stage-1 telemetry per R6); if Anthropic's paused credit plan resumes in an operator-allocable shape (as proposed it was subscriber-self-claimed only — useless to us; a true allocation mechanism would add a fourth door); if test-phase spend breaches the monthly cap twice — the cap is the experiment's budget, not a suggestion.

---

## R13 — Play sessions are research data: recorded, disclosed, shipped at the seams

*(added 2026-08-05, stage-1 design round, on the maintainer's instruction. Shipper mechanics in [02-friends-web-service.md](02-friends-web-service.md); evidence and the disclosure drafts in the 2026-08-05 sections of [06-research-log.md](06-research-log.md).)*

**Decided:** Every hosted play session is collected for development — debugging and design analysis, the same records the analysis kit already eats (R6: pi stamps per-turn cost and the whole ledger into the session file; the telemetry collects itself). The unit is **the session**: the JSONL plus the chronicle folder it stamps (joined by the session's uuid). Shipping is **never per-edit** — the industry-consensus shape is batch-at-boundary over durable local appends, and pi's local append already happens: (1) a debounced incremental mirror during play (~10-minute checkpoints), (2) a **seal at session end** — manifest with per-file hashes, verify, `sealed` marker last, compact to `tar.zst` centrally — and (3) a **sweep on next start + daily cron** for anything a crash left unsealed. Idempotent throughout (session id keys the destination; shipping twice is a no-op). The store is **private and EU-located**, maintainer-only, same tier as `research/` (R4) — the maintainer's analysis machine pulls a mirror; the immutable-reports law is untouched. **Disclosure is loud, not fine-print** (drafted wording in the research log): the landing page and a first-run notice say plainly that sessions are recorded in full and the developer personally reads them; that players should not type real personal details — theirs or anyone's — as a minimization ask, **not** a legal shield (the logs are personal data regardless); lawful basis is consent taken at invite-acceptance; withdrawal and deletion honored within a month; recipients (host, model provider) named; retention: the beta's life + 12 months at most, earlier on request. **Scope: hosted sessions only** — local/offline copies ([05-offline-distribution.md](05-offline-distribution.md)) never phone home; privacy is half of why that channel exists. Collection may continue into the public stages only behind the same loud disclosure at signup.

**Why:** The playtest loop is the product's actual engine right now — the ranked-findings reports run on exactly these records, and stage 1's entire point is real human sessions reaching that loop without hand-carrying files. Batch-at-the-seams is what the shipping research found everywhere (Unity's 60 s batches, Sentry/Crashlytics disk-queue-then-send, OTel batch processors, DCSS webtiles accumulating records server-side): nobody ships per-event over the network; local durable append + boundary flush + ship-on-next-start for crashes. And the disclosure shape is the AI Dungeon 2021 lesson inverted — their crisis was users discovering humans read private stories *without* clear disclosure; we lead with it.

**Rejected:** *Per-edit streaming* — chatty, partial states mid-write, zero analytical gain over checkpoints; no surveyed system does it. *Ship-at-quit only* — loses exactly the sessions that matter most (crashes, abandonments); the sweep exists because Crashlytics-style next-start upload is the proven crash answer. *Silent or softened collection* ("anonymous telemetry" phrasing) — the logs are full transcripts; softening the human-reads fact is the documented path to a trust crisis. *Public session logs* (the DCSS-server norm of downloadable morgues) — wrong for us: these are players' private stories and presumptively personal data.

**Revisit when:** stage 3 opens signups (consent UX at scale; re-verify the provider data-processing terms and EU–US transfer ground recorded in the research log — both ⚠ fast-moving); the first deletion request arrives (exercise the path end-to-end, then trust it); or the store outgrows a single box (lifecycle rules then).

---

## R14 — The stage-1 page: three panes around the terminal, nothing else

*(added 2026-08-05, stage-1 design round, on the maintainer's instruction; owning spec: [08-stage1-web-ui.md](08-stage1-web-ui.md). Elaborates R1 — same streamed TUI, no rewrite — it does not touch it.)*

**Decided:** The friend's page is three panes and a thin status strip: the **terminal** (xterm.js, the whole game) top-left as the primary pane at roughly two-thirds width; a right column holding the **viewer** (tabs, rendered markdown, pictures and clips) over the **file manager** in the bottom third. The panes serve `config/` + `data/` **read-only** — nothing there is secret by design (invariant A5 makes the laws file player-discoverable; what *is* secret — sealed fate plans, the engine nonce — lives in session files under `~/.pi/agent/`, which the panes never serve; `youtube-cookies.txt` is the one in-tree exclusion). Interaction laws: one-click open, tabs remember, everything hot-reloads off a server-side watcher, media **auto-opens** when the scrying glass lands a catch (the fiction says the glass *shows* — now it does; today's engine only announces file paths), and the terminal owns the keyboard. Implementation: a small per-container **app server** (node-pty ↔ pi, xterm.js WebSocket, file API, watcher, plus the session-lifecycle hooks R11's injection and R13's shipper need) — the "DIY alternative" 02 already named, promoted because the panes need a server anyway; bare ttyd stays the day-one fallback. Checked before writing (the maintainer's 4.0 ask): the streaming *architecture* was specified; no page layout existed anywhere — this is new law, not a revision.

**Why:** It mirrors how the game is actually played on the dev machine — terminal in one window, the world folder open beside it — and the chronicle is half the game (the Steam-stage pitch is "a chronicle you can reread"; F2 keys outcomes to visible state, and the panes make that state *actually visible*). Media in the viewer is a strict improvement over local play. And minimal is the flexibility: three regions and a strip can be re-proportioned freely later; every rejected extra would calcify now what stage 2 learns better.

**Rejected:** *Terminal-only page as the end state* — hides the chronicle and the glass's media, the artifacts the game is proudest of (kept as the day-one fallback). *IDE-in-browser (code-server)* — wrong register, heavyweight, hands out edit powers v1 withholds. *A web-native client driving pi over RPC* — the sweep's load-bearing fact kills it: all six ceremony overlays, the board's dress and the footer die over RPC (the aitester's `/ai-state` exists because of exactly this); rebuilding the ceremony is the rewrite R1 forbids. *More panes* (quest board, dice history) — every candidate already lives inside the TUI; a web duplicate splits one truth into two homes. *Player editing of `config/`* — deferred deliberately, not rejected forever: a later decision once support costs are understood.

**Revisit when:** stage 2 opens (strangers need onboarding/help surfaces friends don't); or friend feedback shows the panes confusing rather than serving (the layout is cheap to re-cut — that is its point); or the config-editing question is raised for ruling.
