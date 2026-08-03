# Design ↔ code audit — 2026-08-03

Full-stop review: does the shipped extension keep true to `design/undertakings-*.md`?
Method: all four design docs read against every line of `extension/*.ts`, the two
`.pi/extensions` entry points, the config tree and the tests; `unit.ts` re-run
during this audit — **54/54 green, matching the build doc's claim**. Integration
smoke was NOT re-run (Part B spends live LLM tokens); its last recorded runs are
2026-08-03 per the build doc.

**Verdict: on the right track.** The engine implements the mechanics spec
faithfully — shape pool, attempt-loop order, outcome bands, planner contract,
choice UI, dice, offers, self-healing /roll, nonce discipline, ledger-derived
state — and the architecture invariants (A1–A3, A5) hold in code, not just in
prompts. What follows are the deviations found, worst first. Each ends with a
**Decide:** line for your revision pass.

---

## RESOLVED — 2026-08-03, same day (user's rulings → Phase 2.8 build)

Every item below was ruled on and built; the running record is
`undertakings-build.md` § Phase 2.8. In short:

- **D1 → fixed, stronger than proposed**: one gate holds ALL work (every
  attempt anywhere refuses while a twist/trial/peril stands); the panel burns
  red + bell; the standing layer steers the keeper back. G7 revised.
- **D2 → rebuilt as ≤1 autoresolve per quest** (checkpoint trials in
  twist-free quests, positions drawn); strict alternation rejected (G5); the
  decisions-log entry corrected with the real 40/60 math.
- **D3 → 2–4 options total** (the four-slot board), enforced.
- **D4 → mechanical citation floor** (`citesGrounding`): reasons must share
  words with the laws/world text or the plan is rejected.
- **D5 → place page feeds the planner**; doc's "shapes" typo fixed to suits.
- **D6 → cap binds everywhere**; the fifth-slot ask routes through the
  seeker (offer → shelve_quest → grant). Shelved/untaken matters return only
  via /quest accept at the anchor place.
- **D7 → hindered beats the clamp** (challenge over mercy, G10).
- **D8 → done-gate unconditional** (legacy leniency removed).
- **D9 → resolved answer sheets open at the GM table** (all paths, pick
  marked); `resolved` now set by the pick (D12's flag put to work).
- **D10 → stale texts swept.**
- **D11 → grew into G13 renown + G14 perils/wounds/death** (the living-world
  round; Kenshi doctrine in the research doc).
- **D12 → resolved/tally feed /history + /quest**; untaken courses
  re-acceptable only by the seeker's command.

Verified after the round: **64/64 unit + 18/18 headless RPC smoke**. The
original findings below stand as the audit record.

---

## Discrepancies

### D1 · A quest can complete WITHOUT its finale while a gate stands on another quest — G9/G10 leak
- **Where:** `extension/index.ts:1907` (`gatesOpen`), finale branch `:2020`,
  hazard branch `:2027`, plain-tick fallthrough `:2032`; spec side
  `undertakings-mechanics.md` §2 steps 4–6.
- **What:** The finale and hazard branches require `gatesOpen` (no pending
  choice/roll *anywhere*). When a gate is pending on quest A and the keeper
  attempts quest B, both branches are skipped and the attempt falls through to
  a **plain tick** — which can *fill B's clock*. `update_quest(done)` then
  passes (clock full), and B completes with its armed finale never fired
  (`checkFired` stays false; the full-clock early return at `:1897` means it
  can never fire later). Same path lets a `hindered` attempt tick through
  unopposed — the exact "outnumbered assault ticks unopposed" bug G10 was
  written against.
- **Reachable in normal play:** the widget says "plain talk stays free", the
  player steers to quest B, protocol obliges the keeper to attempt it. Nothing
  in the keeper's standing layer mentions the pending gate on A, so it won't
  self-avoid this.
- **Note:** the code matches the spec *as literally written* (§2 step 4 says
  "gates open", step 6 says "otherwise → tick") — the hole is in the spec's
  ordering itself, and it defeats G9 ("the peak is always in the player's
  hands") and G10.
- **Decide:** (a) hold the beat instead of ticking — a would-complete or
  hindered attempt while any gate is pending returns "another matter awaits
  the seeker's word first" (no tick), mirroring the per-quest holds; and/or
  (b) surface the pending gate in the standing layer so the keeper steers back.
  Then fix §2's ordering note.

### D2 · The decisions log claims a "no-drought rule" that was never in the code — and its numbers don't add up
- **Where:** `undertakings-build.md` decisions log ("Fix: the scripted opening
  … + the no-drought rule (plain never follows plain) … Long-run plain share
  stays ≈ ⅓") vs `extension/ledger.ts:149-168` (`drawQuestShape`) and its unit
  tests.
- **What:** No committed version of `drawQuestShape` (checked Phase-1 and
  Phase-2 commits) ever had a plain-never-follows-plain rule, the mechanics doc
  doesn't list it, and no test asserts it. As coded, after a twist-free quest
  the next draw is twist-free with probability ⅓ — two twist-free quests in a
  row are normal.
- **The math:** given quests form a chain: twisted → always twist-free (P2);
  twist-free → ⅔ twisted / ⅓ twist-free (identical-shape guard). Steady state:
  **40 % twisted / 60 % twist-free** — not the log's "plain share ≈ ⅓", and a
  stretch for the mechanics doc's "roughly half the draws carry a twist"
  (true of the raw pool, not the realized stream; self-set tasks push the
  twist share lower still).
- **Decide:** (a) correct the decisions-log entry (drop the rule, fix the
  number), or (b) actually implement no-plain-after-plain — but note that
  forces strict twisted/plain alternation, which G5 ("the same structure
  repeating back-to-back is a bug") arguably forbids. Recommend (a), with the
  real 40/60 figure recorded; leave hard variety guarantees to Phase 3's
  shuffle-bags as planned.

### D3 · Fate-plan validator accepts 2–5 options; the spec promises 2–4 (+1 blue)
- **Where:** `extension/gmchat.ts:426` (`options.length < 2 || > 5`, `:427`
  ≤1 blue) vs `undertakings-mechanics.md` §3 "Validation bounds (code, F5):
  2–4 options (+1 blue)" and the same claim in `undertakings-build.md` Phase 1.
- **What:** A plan with 5 plain options and no blue passes validation. The
  planner *prompt* asks for 2–4 (+1 blue), so in practice plans conform — but
  the docs present the bound as code-enforced, and it isn't.
- **Decide:** tighten the validator (non-blue count ≤ 4) or reword the doc to
  "2–5 total, at most one blue".

### D4 · "reason cites a law" is listed as validation, but only the prompt asks for it
- **Where:** `undertakings-mechanics.md` §4 ("`reason` must cite a law or
  palette entry") and `undertakings-build.md` Phase 1 ("parseFatePlan
  validation (… reason cites a law …)") vs `extension/gmchat.ts:399` — the
  parser only checks `reason` is a non-empty string.
- **What:** Citation is semantic; it's enforced by the fate prompt's fairness
  contract, not by `parseFatePlan`. The A5/F4 chain ("every backfire traces to
  a discoverable law") therefore rests on prompt compliance.
- **Decide:** reword both docs ("required by the planner prompt; parser checks
  presence only") — or accept and note it; real validation would need a judge
  call, likely not worth it.

### D5 · Fate planner receives less context than the spec says
- **Where:** `undertakings-mechanics.md` §4 input list ("world + laws file +
  **place page** + personas present + quest + drawn suit + **recent quest
  shapes**") vs `extension/index.ts:1972-1981` and `gmchat.ts:461-466` — the
  call passes the place **title** only (no page content) and recent **suits**
  (not shapes).
- **What:** "Recent shapes" is almost certainly a doc typo for suits (suits are
  the variety axis a complication needs; shape variety is handled at draw).
  The place *page* is a real gap: the planner grounds the twist in a place it
  knows only by name, though the page (visit history, details) exists on disk.
- **Decide:** fix the doc's "shapes"→"suits"; then choose whether to pass the
  place page body into `FateDeps` (better-grounded complications, slightly
  bigger side-call) or shrink the spec's promise to the title.

### D6 · GM-table `quest_grant` repair bypasses the open-quest cap (P4)
- **Where:** `extension/index.ts:509-538` (`applyGmFix` "quest_grant" — no
  `countOpenQuests` check) vs the real tool at `:1806` which refuses the 5th;
  goals doc P4.
- **What:** A table repair can push the chronicle past 4 open quests. Arguably
  intentional (repairs record what already happened), but neither the docs nor
  the table's own instructions say so — the meta-GM isn't even told a cap
  exists.
- **Decide:** enforce the cap in the fix (refuse + tell the table to close
  something first), or document the exemption in mechanics §2 and the GM
  prompt.

### D7 · The karmic clamp overrides a declared *hindered* edge — a reckless stroke can roll favored
- **Where:** `extension/index.ts:1910-1920` (`declareTrial`: `coldStreak >= 2`
  is checked before `params.edge`) vs G10 ("a stroke the fiction stacks
  against … must earn itself through a hazard trial (worst of two dice)") and
  spec §9 ("after two straight setbacks the next trial comes openly favored").
- **What:** The two rules collide on the same trial and code silently gives
  the clamp precedence: after two setbacks, a hindered attempt still triggers
  a *hazard* trial (G10's carrier) but rolls it with the **best** of two dice.
  "Bold words never succeed where bold deeds would not" bends exactly when the
  player is on a losing streak.
- **Decide:** pick a precedence and write it down. Options: hindered beats the
  clamp (clamp defers to the next non-hindered trial), or clamp neutralizes to
  a plain single die on hindered attempts, or keep as-is as a mercy rule —
  then G10 gets a "unless the fates relent" clause. (Side note: GM-table
  "trial" fixes never apply the clamp at all — same decision applies there.)

### D8 · Done-gate has a legacy bypass
- **Where:** `extension/index.ts:2110-2122` (`update_quest`: gate only applies
  when `size > 0` from the branch or the quests.md mirror) vs mechanics §2
  "`update_quest(done=true)` is **refused unless the clock is full**"
  (unconditional).
- **What:** A pre-undertakings quest that was never `attempt_quest`-ed (no
  shape event, no clock mirror line) can be marked done in one call. Only
  legacy chronicles are affected — every modern grant writes a shape — but the
  doc states the gate as absolute.
- **Decide:** lazily arm the 4/0/1 shape inside `update_quest` too (closing
  the hole), or add the legacy exception to mechanics §1/§2.

### D9 · A4's "after resolution show the whole answer sheet" isn't backed by data
- **Where:** goals A4; GM prompt `extension/gmchat.ts:271` ("Once its outcome
  is answered in the ledger, you may explain the whole of it freely"); README
  repeats the promise. But the table's context (`tableSystemPrompt`) contains
  only ledger lines — `describeEvent(fate)` stays "(sealed)" forever, and the
  resolved outcome reveals only the *picked* path's band and text.
- **What:** Invited to explain the full plan post-resolution, the table cannot
  see the unpicked options' hidden `band`/`reveal`/`reason` — it can only
  confabulate them, which is exactly what A4 ("veiled, never lied about") is
  against.
- **Decide:** feed resolved plans to the table (e.g. include
  `undertakings[slug].plan` in the GM system prompt once `resolved` — that
  flag exists and is currently read by nothing, see D12), or soften prompt +
  A4 to "explain the resolved path freely".

### D10 · Stale enumerations and comments (cosmetic)
- **Where:**
  - `README.md` ledger-event list (§ "The ledger lives in the session") stops
    at Phase 1: `offer` / `offer_dropped` / `check` / `roll` are missing (the
    prose section below it does describe them).
  - `extension/ledger.ts:91-93` and `:200-201` still describe `check` as a
    "(hidden) trial beat — 0 = none"; since Phase 2.5 it is a fires-on-completion
    **flag** (mechanics §1 has it right; the pool only ever sets `1`).
- **Decide:** doc sweep — no behavior involved.

### D11 · P2's "breather after any disaster" has no carrier
- **Where:** goals P2, second clause. Neither mechanics spec nor code reads
  past *outcomes* when drawing shapes — `drawQuestShape` sees only the last
  granted shape. The per-quest karmic clamp (favored die after two setbacks)
  is the only mercy mechanism, and it's per-quest, not cross-quest pacing.
  (Partially incidental cover: a `[failed]` quest is always a twisted one, so
  *if it was also the last granted*, the next draw is twist-free — but with
  several open quests that's not guaranteed.)
- **Decide:** spec it concretely for Phase 3 (e.g. "the first grant after any
  `[failed]`/setback-heavy quest draws twist-free"), or strike the clause
  from P2.

### D12 · `Undertaking.resolved` is set by every outcome and read by nothing
- **Where:** `extension/ledger.ts:208-209` (comment: "True once a pick
  resolved the complication") vs `:409-410` — set on *every* `outcome` event,
  including finale/hazard rolls; no consumer anywhere.
- **What:** Harmless dead state today, but the comment lies, and D9's fix is
  its natural consumer — decide together with D9.

---

## Verified sound (spot-checks that held)

- **Shape pool & draw rules** — `4 / 6 / 6@2 / 8@3`, all `check:1`; scripted
  opening, self-set twist-free, P2 cooldown, no identical repeat
  (`ledger.ts:149`, tested). Twist positions match `ceil(beats·0.6)`; clues at
  `twistBeat−1` (`index.ts:1968`).
- **Attempt loop order** — per-quest twist/trial holds → present → clues/weave
  (fail-open `fate_skipped`) → finale-on-completing-tick → hazard → plain +2;
  full-clock refusal; lazy 4/0/1 for legacy quests (`index.ts:1856-2047`).
  A twist-pick that fills the clock correctly makes the twist the peak (the
  finale never fires — spec §2.4).
- **Bands & dice** — pick bands clean/windfall/cost +2, setback −1 floor 0,
  fail→`[failed]` terminal + dropped from open matters; d20 tiers by clock
  (10/15/20), `rollBand` with natural overrides, `BAND_TICKS` 3/2/2/−1, no
  numeric modifiers anywhere, edge = second visible die, crypto-rolled, every
  face recorded; grit once per quest, offered only after seeing a miss,
  TUI-only; headless rolls plainly; bare die can never hard-fail.
- **One gate globally** — choice XOR trial holds at every creation site
  (twist presentation, finale, offer tool, GM trial/choices fixes all check).
- **Offers** — 2–5 labels, no hidden fields, lapse via `offer_dropped` in
  `before_agent_start` on any turn that isn't their own `/pick`; picks with
  slug `""`; can never deadlock.
- **/roll self-healing** — pending choice → points at `/pick`; open work →
  nonce-marked correction carrying the open clocks, forbidding meta-talk,
  routing through `attempt_quest`; else "nothing to roll" (`index.ts:1036-1086`).
- **A2/A3/A4 wiring** — plans ride the session as veiled custom entries;
  `describeEvent(fate)` = "(sealed)"; keeper sees clues/options only, hidden
  fields arrive solely in the post-pick engine hand-off; widget and all state
  derive from the branch (rewind-safe, `session_tree` handler); `/tree`-moved
  leaves get re-stamped chronicles; ledger.md mirror is append-only.
- **Engine nonce** — fresh per run, embedded in every engine hand-off (`/web`,
  pick, roll, nudge), hidden from the GM table, renderers never print it;
  prompt marks bare `[engine]` as play-acting.
- **Prompt protocol** — laws layer 1½ (hot-reloaded per turn), anti-theater
  law naming work/trials/dice, mandatory `attempt_quest`, voice-the-options,
  clue weaving, DW lines, one-clear-sentence, loving failure, LOGIC OVER
  BOLDNESS, offer protocol — all present (`prompt.ts:64-90`, unit-tested).
- **Caps & gates** — open-quest cap 4 at the tool; done-gate on the
  branch-derived clock with quests.md fallback; redeem-at-giver with `self`
  sentinel.
- **Widget** — pi 0.83's `setWidget` defaults to `aboveEditor` (verified in
  the installed package), so the omitted `placement` option is behaviorally
  identical to spec §5; the 7-line max panel fits under pi's 10-line widget
  cap. Alt+1..9 prefill matches spec.
- **Tests** — `unit.ts` re-run this audit: 54/54, including the draw rules,
  band tables, hazard-vs-finale folding, offer lapse/bind, prompt lines.

## Goal coverage at a glance

| Goal | Status |
|---|---|
| G1, G3, G4, G7, G8, G11 | met, code-carried |
| G2 | met in kind; twist share ≈ 40 %, not "roughly half" (D2) |
| G5 | met Phase-1-minimally (no-repeat); full guarantee = Phase 3 bags |
| G9, G10 | met on the main path; leak via cross-quest gate (D1), clamp collision (D7) |
| G6 | **not built** — Phase 3 (breadcrumbs, dents) as planned |
| F1–F5 | met (F2 blue options, F3 stakes contracts, F5 bounds all in code); F4's "cites a law" is prompt-level (D4) |
| P1, P3 | met by construction |
| P2 | first clause met; "breather after disaster" uncarried (D11) |
| P4 | met at the tool; GM-repair bypass (D6) |
| P5 | deferred to Phase 3 by logged decision — minimal no-repeat in place |
| A1–A3, A5 | hold in code |
| A4 | veiling holds; post-resolution transparency unbacked (D9) |

## Phase 3 (unbuilt, as intended)

Confirmed absent, matching "spec'd, not built": shuffle-bag draw events,
breadcrumb chain-exits, hook bundles, consequence-echo callbacks, travel
micro-events, GM-table clock/plan repair kinds, pacing fingerprints,
roll-first-allocate. No stray half-implementations found.
