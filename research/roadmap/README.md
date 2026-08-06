# Roadmap — from private folder to public game

Decided 2026-08-04, after the distribution research sitting. This folder is the plan for how World Console leaves this machine: first a hosted web service for friends, then — if it holds — a public launch with paid rounds, and Steam as the storefront beyond that. Open-sourcing stays a real option for later; it is the one door that only swings one way, so it is taken last, deliberately, or not at all.

This folder is **internal planning** — like the rest of `research/` and `aitester/`, it is never part of anything handed to players.

## The path at a glance

| Stage | What | Players | Who pays AI | Status |
|---|---|---|---|---|
| 0 | Local play + trusted-friend copies | you + a few friends | each their own account | current |
| 1 | **Friends web service** — the game streamed to the browser, per-friend containers on a VPS | invited friends, secret links | own key/sign-in per the door table (R11), or the ledgered house lane on the operator's commercial account (R12 — any provider, aggregator qualifies) | next |
| 2 | **Invite-only paid beta** — accounts, credit ledger, LLM gateway, Stripe | waitlist invites | players buy rounds; the operator's commercial account underneath | gated |
| 3 | **Public launch** — open signups, free taste, prepaid rounds | anyone | same as stage 2, at scale | gated |
| 4 | **Steam launch** — Electron shell around the same client; same servers, accounts, credits | Steam's audience | same as stages 2–3 (Steam MTX in-client) | gated |
| ⊥ | **Open source** — orthogonal track, can attach after any stage | — | — | option, one-way |

Each stage is cheap enough to abandon, and every gate must be passed by evidence, not enthusiasm — the gates are listed in each stage's document.

## Now (updated 2026-08-07)

Stage 0 housekeeping is **complete**: roadmap decided, `research/` consolidated, guardrail live (root `CLAUDE.md` + registry protocol), `LICENSE` in place, constitution content bounds explicit, repo pushed to GitHub (verified private). **The 2026-08-05 stage-1 design round landed R11–R14** — multi-provider doors with player-side credential custody · the ledgered house lane on the org key · session shipping with loud disclosure · the three-pane page — and corrected the policy ground: the June-15 **Agent SDK credit pool was paused before it ever took effect**, and hosted third-party apps may not offer Claude.ai login at all; the per-provider **door table** in [06-research-log.md](06-research-log.md) is the standing record. Two ⚠ rulings await the maintainer, recorded in the R11/R12 entries (the door constraint; the funding vehicle).

**The 2026-08-06 business/naming sitting** answered the commercial unknowns in six evidence sections of [06](06-research-log.md) — hosting · domain/TLD · trademark · Austrian founding & tax · payments · compliance gaps — and made the coverage register law ([09-coverage.md](09-coverage.md), R15: zero silent unknowns). Its proposals went to the maintainer **as the register's ◐/○ rows**: the name (clearance clean; worldconsole.com squatted at $3,595, every other TLD free) · the TLD basket (.games + .at + .eu ≈ €50/yr at INWX proposed) · the box (netcup Vienna ≈ €6/mo proposed, cross-provider backups) · the Impressum address strategy · the age policy (18+ proposed) · the stage-2 payments branch (Stripe direct vs Stripe-MoR) · the maintainer's founding branch (employment/age — input only they can give). Nothing was adopted against standing law; the one would-be deviation (a non-Stripe merchant of record) is flagged inside the payments section and arises only if that branch is ever chosen.

**The 2026-08-07 ruling pass closed those edges as R16–R21:** the names (**World Console**; studio **Hausregel**) · the domain (**worldconsole.eu alone**, INWX) · the box (**netcup Vienna**, Hetzner the prepared runner-up) · the Impressum (private address, ⚠ re-ruled before stage-3 public) · **18+** for stages 1–2 · the founding branch (student, 18+ — the e.U. kit confirmed, every branch kept documented). Deliberately still open: the stage-2 payments branch (deferred by the same pass) · mail on the domain (Migadu proposed, un-ruled) · R11/R12's two ⚠ rulings (door constraint; funding vehicle). Stage-1 build item 1 is unblocked.

Next, in order:

1. **Stage 1 build** — the [02](02-friends-web-service.md) checklist, fallback rung first: buy **worldconsole.eu** + order the **netcup Vienna** box + sign the AVV (item 1's errand, R17/R18), then Dockerfile → in-container smoke → Caddy + secret links, with disclosure and the LICENSE line from day one; then vault · house lane · shipper · panes ([08](08-stage1-web-ui.md)). First artifact: the Dockerfile.
2. **aitester Batch 2** (game track, `research/design/undertakings-build.md` Phase 2.9) — Phase 3 waits for two consecutive clean batches in both worlds.
3. Optional, whenever a local copy is wanted: the whitelist packaging script ([05](05-offline-distribution.md)).

## The files

| File | Topic |
|---|---|
| [01-decisions.md](01-decisions.md) | The decision registry (R1…, open-ended) and the deviation protocol: what was chosen, why, what was rejected, the one-way doors |
| [02-friends-web-service.md](02-friends-web-service.md) | Stage 1 spec: architecture, containers, auth, security, ops, build checklist |
| [03-public-launch.md](03-public-launch.md) | Stages 2–3 spec: accounts, credit ledger, gateway, pricing math, abuse, business duties |
| [04-licensing-and-ip.md](04-licensing-and-ip.md) | Legal state today, the licensing ladder, the open-source decision, third-party compliance |
| [05-offline-distribution.md](05-offline-distribution.md) | The fallback channel: trimmed player copies and the portable one-click bundle |
| [06-research-log.md](06-research-log.md) | The evidence base: case studies with numbers, the 2026 Anthropic policy timeline, all sources |
| [07-steam-launch.md](07-steam-launch.md) | Stage 4 spec: the Steam build, AI-content compliance, Steam money rules, store logistics, scale expectations |
| [08-stage1-web-ui.md](08-stage1-web-ui.md) | Stage 1 page spec: three panes around the terminal, interaction laws, hot-reload, the login screen's face |
| [09-coverage.md](09-coverage.md) | The coverage register (R15): every product-side domain with status, owning doc, and next trigger — pointer-only; the zero-silent-unknowns duty |

## Guiding principles

1. **Reversible before irreversible.** Private → hosted → paid → public are all revocable moves. Open-sourcing is not. Order the path accordingly.
2. **The player pays their own AI cost for as long as possible — and nobody plays unmetered.** (revised 2026-08-05, R11/R12) Bring-your-own stays the default door: their key or permitted sign-in, their spending, our cost zero. The one exception is deliberate: the house lane, where the maintainer's org key pays *through the credit ledger* — capped grants during the test phase to buy playtest data, purchased top-ups later. The ledger is the constant; who fills it changes by stage.
3. **The readable game is a feature, not a leak.** The engine is TypeScript and the worlds are prose; client-side they can never be hidden, server-side they never leave the box. Hosting *is* the protection strategy — everything else (obfuscation, bundling) was researched and rejected.
4. **Cost engineering is already half-built.** The engine splits its LLM work into separate calls (keeper / guardian / fate weaver / GM table / saga) and does archive recall in code. That is exactly the structure the profitable AI games use to route cheap and price sanely.
5. **The moat is not the code.** Mindustry sells at $9.99 with its GPL source a click away; Aseprite sells at $20 with its source public. What they sell is the official, convenient, maintained artifact and the brand. Plan for that moat, not for secrecy.
6. **No silent deviations.** Every future research or planning session checks new findings against both decision registries — this folder's R registry and the game-design law in `research/design/undertakings-goals.md` — before adopting them; conflicts are marked `⚠ DEVIATION (<id>)` and ruled on by the maintainer. The protocol lives in [01-decisions.md](01-decisions.md) and the root `CLAUDE.md`.
