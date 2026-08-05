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
