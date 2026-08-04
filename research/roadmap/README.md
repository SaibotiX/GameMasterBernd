# Roadmap — from private folder to public game

Decided 2026-08-04, after the distribution research sitting. This folder is the plan for how World Console leaves this machine: first a hosted web service for friends, then — if it holds — a public launch with paid rounds, and Steam as the storefront beyond that. Open-sourcing stays a real option for later; it is the one door that only swings one way, so it is taken last, deliberately, or not at all.

This folder is **internal planning** — like the rest of `research/` and `aitester/`, it is never part of anything handed to players.

## The path at a glance

| Stage | What | Players | Who pays AI | Status |
|---|---|---|---|---|
| 0 | Local play + trusted-friend copies | you + a few friends | each their own account | current |
| 1 | **Friends web service** — the game streamed to the browser, per-friend containers on a VPS | invited friends, secret links | each their own account (or your key, hard-capped) | next |
| 2 | **Invite-only paid beta** — accounts, credit ledger, LLM gateway, Stripe | waitlist invites | players buy rounds; your org API account underneath | gated |
| 3 | **Public launch** — open signups, free taste, prepaid rounds | anyone | same as stage 2, at scale | gated |
| 4 | **Steam launch** — Electron shell around the same client; same servers, accounts, credits | Steam's audience | same as stages 2–3 (Steam MTX in-client) | gated |
| ⊥ | **Open source** — orthogonal track, can attach after any stage | — | — | option, one-way |

Each stage is cheap enough to abandon, and every gate must be passed by evidence, not enthusiasm — the gates are listed in each stage's document.

## Now (updated 2026-08-04)

Stage 0 housekeeping is **complete**: roadmap decided (R1–R8), `research/` consolidated, guardrail live (root `CLAUDE.md` + registry protocol), `LICENSE` in place, constitution content bounds explicit, repo pushed to GitHub (verified private). The R5 policy re-check is done — the June-15 **Agent SDK credit pool** is the current regime (Pro ≈ $20/month of third-party-agent budget; see [06-research-log.md](06-research-log.md)).

Next, in order:

1. **Stage 1 build** — the [02](02-friends-web-service.md) checklist: Dockerfile → in-container smoke → Caddy + secret links → friend intro. First artifact: the Dockerfile.
2. **aitester Batch 2** (game track, `research/design/undertakings-build.md` Phase 2.9) — Phase 3 waits for two consecutive clean batches in both worlds.
3. Optional, whenever a local copy is wanted: the whitelist packaging script ([05](05-offline-distribution.md)).

## The files

| File | Topic |
|---|---|
| [01-decisions.md](01-decisions.md) | The decision registry (R1–R8) and the deviation protocol: what was chosen, why, what was rejected, the one-way doors |
| [02-friends-web-service.md](02-friends-web-service.md) | Stage 1 spec: architecture, containers, auth, security, ops, build checklist |
| [03-public-launch.md](03-public-launch.md) | Stages 2–3 spec: accounts, credit ledger, gateway, pricing math, abuse, business duties |
| [04-licensing-and-ip.md](04-licensing-and-ip.md) | Legal state today, the licensing ladder, the open-source decision, third-party compliance |
| [05-offline-distribution.md](05-offline-distribution.md) | The fallback channel: trimmed player copies and the portable one-click bundle |
| [06-research-log.md](06-research-log.md) | The evidence base: case studies with numbers, the 2026 Anthropic policy timeline, all sources |
| [07-steam-launch.md](07-steam-launch.md) | Stage 4 spec: the Steam build, AI-content compliance, Steam money rules, store logistics, scale expectations |

## Guiding principles

1. **Reversible before irreversible.** Private → hosted → paid → public are all revocable moves. Open-sourcing is not. Order the path accordingly.
2. **The player pays their own AI cost for as long as possible.** The current "hassle" — everyone logs into their own Anthropic account — is what keeps our cost at exactly zero. Give that up only when a credit ledger meters every turn against money the player already paid.
3. **The readable game is a feature, not a leak.** The engine is TypeScript and the worlds are prose; client-side they can never be hidden, server-side they never leave the box. Hosting *is* the protection strategy — everything else (obfuscation, bundling) was researched and rejected.
4. **Cost engineering is already half-built.** The engine splits its LLM work into separate calls (keeper / guardian / fate weaver / GM table / saga) and does archive recall in code. That is exactly the structure the profitable AI games use to route cheap and price sanely.
5. **The moat is not the code.** Mindustry sells at $9.99 with its GPL source a click away; Aseprite sells at $20 with its source public. What they sell is the official, convenient, maintained artifact and the brand. Plan for that moat, not for secrecy.
6. **No silent deviations.** Every future research or planning session checks new findings against both decision registries — this folder's R1–R8 and the game-design law in `research/design/undertakings-goals.md` — before adopting them; conflicts are marked `⚠ DEVIATION (<id>)` and ruled on by the maintainer. The protocol lives in [01-decisions.md](01-decisions.md) and the root `CLAUDE.md`.
