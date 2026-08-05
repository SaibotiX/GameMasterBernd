# Stages 2–3 — invite-only paid beta, then public launch

Strangers may only ever reach the game behind a **prepaid credit ledger**. This document specifies the pieces added on top of stage 1, the pricing math, and the duties that arrive with the first paid cent. Evidence and case-study numbers: [06-research-log.md](06-research-log.md).

## The core idea (what the research settled)

The money flow and the AI flow are two separate loops that meet only in a database table:

```
player pays €X ──→ Stripe Checkout ──→ our account
                                    └─→ ledger: player.rounds += N

player acts ──→ server: player.rounds > 0 ?
                ├─ yes → LLM gateway (player's virtual key, budget) → OUR org API key → provider
                │        actual usage read from response → player.rounds -= 1
                └─ no  → "buy rounds"

monthly: provider bills US once, for everyone's aggregate usage
```

The player's money never touches Google/Anthropic/OpenAI. There is **one org API account per provider on our side**; the "round" is an internal accounting row whose price is set so `price per round > our average provider cost per round`. Friends & Fables runs five model families behind one credit currency — proof the credit is pure bookkeeping. This is exactly what we build; it is not novel.

## New components on top of stage 1

*(revised 2026-08-05, decision R12: the **ledger and the LLM gateway are no longer stage-2 novelties** — stage 1's house lane builds and exercises both, with free grants, per-player caps and the kill-switch running on friends for months before money arrives. Stage 2 adds the money loop onto the standing rails: accounts, Stripe, purchased top-ups.)*

| Component | Choice / note |
|---|---|
| Accounts | e-mail magic-link (no passwords to store); one account ↔ one container+volumes identity |
| Ledger | **from stage 1 (R12)** — Postgres: `users`, `credit_transactions` (append-only), `balance` as derived sum — same fold-the-log philosophy as the game's own ledger; balance may never go negative; stage 2 adds purchase/refund transaction types |
| Payments | Stripe Checkout + webhooks (web-only sidesteps the 15–30 % app-store cut Old Greg's mobile-first approach pays) |
| LLM gateway | **from stage 1 (R12)** — LiteLLM-style proxy: per-user virtual keys with individual budgets and rate limits in front of our single org key; house-lane pi in each container is pointed at the gateway (pi's provider layer is multi-provider/configurable — one config detail to verify). The gateway's metering is the billing source of truth |
| Reconciliation | pi's own per-turn cost lines in session files are the independent second record; a nightly job compares the two |
| Abuse controls | per-user rate limits, per-user gateway budget, global daily spend alarm, signup friction (invite codes in stage 2, e-mail verification + drip limits in stage 3) |

## The billable unit: one keeper turn = one round

A round bundles the keeper turn **and** its hidden side calls (guardian checks, fate weaving, table answers within the turn). Genuinely expensive extras map to a separate credit unit, exactly the Fables pattern of gating premium work behind credits:

- `/history long` (the saga call), `find_video` (slow, bandwidth-heavy) → cost credits, not rounds.
- Old Greg's equivalent trick: their round is a *whole party cycle*; their guest-players ride free while the host pays. We are single-seeker, so our simpler unit works.

### The hard rule: money buys compute, never advantage (decision R8)

This game runs on open dice, and the law has met purchasable currency near dice before: *Kater v. Churchill Downs* (9th Cir. 2018) ruled purchasable virtual chips a potential **"thing of value"** — illegal gambling under state law **even with no cash-out** — and Steam bans gambling outright. Our model is safe *because* rounds only ever buy AI compute. So, codified: **nothing mechanical is ever purchasable.** No bought rerolls (grit stays one-per-quest, earned), no bought favored dice (favor needs a recorded fictional reason), no bought renown, no paid wound-healing (`heal_wounds` stays fiction-gated). Beyond the legal shield, this protects the game's identity — "no hidden modifiers anywhere" dies the day a die can be bought.

## Cost side — why our engine is well-positioned

The engine already splits its LLM work into **separate calls**: keeper (must be strong), guardian truth-checks, fate-plan weaving, GM-table answers, sagas. That is precisely the structure that lets the profitable AI RPGs route models by task (Fables: Gemini/Llama/GPT/Grok/own fine-tune behind one GM). Route the side calls to a Haiku/Flash-class model and only the keeper rides the expensive one. Further cost levers already built: code-side archive recall instead of long context, `/compact`, per-turn cost stamped into every session file (telemetry is free).

**Placeholder math — replace with stage 1 telemetry:** keeper turn ≈ 10–20 k tokens in / ~1 k out on a Sonnet-class model ≈ 5–8 ¢, side calls routed cheap ≈ +1–2 ¢ → **~6–10 ¢ per round all-in; cheap-routing target ~3–6 ¢.**

## Pricing (draft, to be re-derived from real telemetry)

Modeled on the two live businesses (Old Greg's: $5 one-time/50 rounds, $15/mo/200, $25/mo/450 → 5.6–10 ¢ per round; Fables: $19.95–39.95/mo "unlimited standard turns" made safe by hard-capped free tier + cheap default routing + credits for premium):

| Tier | Draft | Rationale |
|---|---|---|
| Free taste | small **daily** round allowance on the cheap-routed path (e.g. 5–10 rounds/day per verified account), hard-capped | bounded like Fables' 25 turns/day — and a *recurring* taste beats a once-only trial: the live-AI genre's top review-collapse pattern is walling off the core experience (Whispers from the Star went recent-negative over exactly this). A free player stays a real, rate-limited player; never unbounded |
| Starter pack | ~€5 one-time / ~50 rounds | low-friction entry, proven by Old Greg's original flat price |
| Regular | monthly pack of rounds at better unit price | prepaid, expires-or-rolls decision later |
| Premium credits | separate small currency for sagas / video scrying | Fables' credits pattern |

Start with **prepaid packs only** — no "unlimited" promise until cheap-routing is proven against real usage curves. Margin target: price per round ≥ 2× measured cost per round (covers free taste, refunds, VPS, Stripe fees). Three standing constraints from the migrated platform research: **never advertising-subsidized rounds** (Steam's rule 14 bans ad-based models, and it is a poor fit regardless); pack prices must still clear margin **after Steam's 30 % MTX cut** once stage 4 exists ([07-steam-launch.md](07-steam-launch.md)); and wherever rounds are sold, **the credit model gets explained in plain words** — opaque AI paywalls are the genre's #1 review complaint.

## What paid + public means beyond software

- **Business:** register per local rules; Stripe account; invoices/receipts. In the EU: VAT on digital services (OSS scheme), GDPR (privacy policy, data export/delete — per-user volumes plus the R13 session store's per-player prefix make deletion tractable by design; disclosure and consent have run since stage 1, R13).
- **Terms of service:** conduct, refunds, chronicle data ownership, service-may-end clause.
- **Moderation duty:** strangers chatting with an LLM under our key makes us the operator under the provider's usage policies — abuse reporting path, ban switch per account (stop container + freeze ledger).
- **Reports & DSA:** storing players' chronicles makes us a hosting service under the EU DSA, and the Art. 16 notice-and-action duty applies regardless of company size — a report button/address that reaches a human, plus a statement of reasons when we act. Cheap to build; wire it into the account page from day one.
- **Minors:** set the age policy (13+/16+) in the ToS before stage 3 opens. The constitution's content bounds are explicit as of 2026-08-04 — rule 4 binds both the scrying glass and the keeper's own telling — so the ToS and Steam's guardrail description reuse its wording ([07-steam-launch.md](07-steam-launch.md)). (Noted 2026-08-05: the age policy and the house-lane model mix must be decided *together* — Google's Gemini API terms prohibit services "likely to be accessed by" under-18s outright; door table in [06-research-log.md](06-research-log.md).)
- **Media compliance:** hosted `find_video` means shipping YouTube-scraped clips to paying customers — ToS exposure we should not carry commercially, and datacenter IPs hit YouTube's bot-walls anyway (stage 1 limitation note). Decision before stage 3: hosted tiers run **wiki-media only** (text + pictures), with video as a BYO-cookies opt-in or a local-play-only feature. No user uploads exist anywhere in the product, so CSAM-reporting and DMCA-agent duties do not attach — true only while nothing player-uploaded is ever stored; any future upload feature re-opens that gate deliberately.
- **Support:** a contact address and a "the keeper is stuck" repair path (the GM table's repair hands already cover most of it in-game).

## Stage gates

**Enter stage 2 (paid invite beta)** only with: stage 1 exit gates passed · ledger + gateway + Stripe wired and reconciling to the cent on test accounts · ToS/privacy drafted · business registration answered · invite codes ready.

**Enter stage 3 (public)** only with: ≥ a full month of beta where measured margin per round is positive after fees · zero unresolved billing disputes · abuse alarms tested by a deliberate self-attack (try to farm our own endpoint through the chat box — the AI Dungeon lesson, rehearsed on ourselves) · load test at 3× expected concurrency.

**Standing kill-switch:** a global daily spend cap that pauses new rounds platform-wide. It exists from the first day of stage 2 and never comes off.
