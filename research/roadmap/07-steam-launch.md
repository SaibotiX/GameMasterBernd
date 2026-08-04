# Stage 4 — Steam

The same game on a second storefront. Steam adds discovery (wishlists, the terminal-game niche that actually lives there) and legitimacy; the web service stays canonical. Nothing about the architecture changes — the Steam build is a thin desktop shell around the exact same client, talking to the exact same servers, accounts and credit ledger. Platform facts below were migrated from the prior project's research (2026-08-01, sources in [06-research-log.md](06-research-log.md)); ⚠ re-verify Steam policy details when this stage actually starts.

## Sequencing (why Steam comes last)

Web-first → Steam-later is the dev-community consensus for a reason: the web channel has zero gatekeeping, instant patching, and no review cycle between us and iteration — while **Steam reviews are permanent** and a raw launch burns the one first impression. Two timing rules:

- **The "Coming Soon" page goes up early, during stage 3** — it must be public ≥ 2 weeks anyway, and launch-week visibility rides on accumulated wishlist mass (community folklore threshold: ~5–10 k wishlists; treat as a soft signal, not a gate).
- **Steam Direct logistics force a lead time:** $100 fee per app (recouped at $1 k adjusted gross — in-app credit purchases count, so F2P recoups), identity/bank/tax paperwork, a 30-day wait after the fee, store and build reviews at 1–5 business days each. Realistic minimum from signup to launch: **4–6 weeks**; plan it into the stage 3 calendar.
- Steam **Playtest** (free, invite-gated) is available once the app exists — an optional rung between web beta and launch. Early Access is likely skipped: our web beta already does its job, and EA carries its own rules (playable game, no crowdfunding framing, no undercutting the Steam price elsewhere).

## The build: one client, wrapped

- **Electron shell around the same xterm.js client.** Electron-on-Steam is proven (Vampire Survivors' breakout build was web-tech in Electron; official Phaser→Electron pipelines exist); no shipped Tauri-on-Steam precedent was found — Electron is the de-risked pick. The shell is a window, a Steamworks binding, and our web client; the game still runs server-side.
- **Same accounts, same credits, everywhere.** Established, Valve-tolerated pattern (RuneScape, Screeps: World, Melvor Idle). Linking a Steam identity to an existing web account must work both directions.
- **The aligned-offer rule (the A Dark Room lesson):** a permanently free identical web version cannibalizes a *paid* Steam release — so there is never a paid Steam SKU. The offer is identical on both storefronts: free to start, prepaid rounds. Decision R7.
- **The Steam overlay must function inside the shell** — not cosmetic: players must be able to report illegal AI output through it (a standing Valve requirement for live-AI games), and overlay-in-Electron is a known fiddly integration. Budget real time.
- **Steam Deck is a first-class worry for a game you type at:** 1280 × 800 layout (terminal font scale!) and *explicit* on-screen keyboard invocation via Steamworks whenever the input line focuses. Runs under Proton. Test on hardware before launch.
- OS targets: Steam is ~94 % Windows / ~4 % Linux / ~2 % macOS (June 2026 survey). The web-tech client makes all three nearly free to build — ship all three, **QA Windows first**, Linux/macOS best-effort.

## AI-content compliance (this governs us directly)

World Console is squarely **live-generated AI content**. Steam's regime since Jan 2024 (scope narrowed Jan 2026 to content players consume):

1. **Disclosure in the content survey, published on the store page.** Written in plain words, same as the credit model.
2. **Guarantee no illegal/infringing output + describe the guardrails.** Our guardrail description largely already exists in-house: the constitution layer, the code-owned invariants (bar enforcement, clock refusal, fairness caps), the guardian truth-checks, and the append-only ledger that makes every AI action auditable. Stage 4 paperwork = distilling that into the survey answers — without publishing the R&D itself (decision R4).
3. **Live-generated Adult-Only sexual content is banned outright.** Resolved 2026-08-04: constitution rule 4 now binds the keeper's own telling as well as the scrying glass (never pornographic, no gore for its own sake, no hatred against real peoples) — platform law mirrors our own text; the survey answers reuse rule 4's wording.
4. Reality check from the migrated research: live-LLM games ship on Steam routinely (Suck Up!, Whispers from the Star, AI Roguelite — roughly 1 in 5 of 2025's releases disclose GenAI); no documented post-2024 rejection of one was found. **The genre's real failure mode is review collapse from AI-capacity paywalls** (Whispers from the Star went recent-negative over queues) — which is why the free tier and the kill-switch capacity planning in [03-public-launch.md](03-public-launch.md) matter more than the approval process.

## Money on Steam

- **In-client credit purchases must use the Steam MTX API / Steam Wallet — Valve takes 30 %.** Selling the *same* rounds on our own site (Stripe, full margin) stays allowed as long as the purchase happens outside the client and the Steam build doesn't advertise the external store (Path of Exile / Warframe / Genshin precedent). Consequence for [03-public-launch.md](03-public-launch.md): pack prices must clear margin *after* the 30 % cut.
- **Gambling rules bite a dice game with purchasable currency** — see decision R8 and the hard rule in [03-public-launch.md](03-public-launch.md): rounds buy AI compute, never rerolls, favor, renown or healing. That rule is what keeps the store-facing answer simple.
- **No advertising-based model** (Steam rule 14) — already foreclosed in stage 2–3 design. Rule 15 (payment-processor standards) is one more reason the economy stays plain prepaid credits.
- **BYO-account/key path:** Steam precedent exists for games requiring the player's own AI key. In our architecture this is simply a player whose container runs on their own login instead of a gateway virtual key (the stage 1 pattern, subject to the R5 policy watch) — a power-user option, not the default.

## Store presence

5+ real screenshots and a full capsule-art set are mandatory — and for a terminal game the presentation is the whole battle: **sell the fantasy, never "a text game."** The pitch is the keeper, the worlds that remember, dice that cannot be faked, death that is real — a chronicle you can reread. Screenshots must show the moments the game is proudest of: the dice ceremony, the burning four-slot board, a chronicle page, the ledger.

## Scale honesty

Migrated comps for text/terminal games on Steam: Hacknet >200 k copies in year one; Duskers ~100–200 k owners; Kind Words 200–500 k at $4.99; the closest structural analog — hackmud, a multiplayer text game — peaked at **503 concurrent players** and settled at 10–20; Emily is Away (free) drew 22.8 k reviews. Planning number: **hundreds of concurrents is success**, which conveniently also keeps the AI bill and the kill-switch math sane.

## Entry gates

- Stage 3 stable ≥ 1 month with positive measured margin per round; support load sustainable solo.
- Coming Soon page live ≥ 2 weeks with wishlist trend recorded (soft signal).
- Content-survey answers drafted (guardrail description distilled); constitution content bounds explicit; ToS/age policy done (stage 3 gate, reused).
- Overlay verified inside the Electron shell; Deck 1280 × 800 + on-screen keyboard tested on hardware.
- Steam MTX ↔ ledger integration reconciles to the cent in test mode, including refund webhooks.
- ⚠ All Steam policy facts in this file re-verified against current partner docs.
