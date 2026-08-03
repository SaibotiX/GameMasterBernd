# Undertakings — mechanics specification

The implementable spec. Phase tags mark what ships when (see
undertakings-build.md). Terms: a *beat* is one meaningful attempt scene; a
quest's *clock* has `size` segments and fills by ticks.

## 1. Clocks (built; revised through playtest round 2.5)

- Every granted quest draws a shape: `{ clock: 4|6|8, twist: 0|n, check: 0|1 }`
  — twist = complication beat (mid-quest), check = FINALE ARMED (fires on
  completion, not at a counted beat). Beats = clock/2 (standard tick = 2).
- Shape pool (current): `4`, `6` (twist-free), `6@2`, `8@3` (twisted) — ALL
  with check:1. Plain shapes are deleted: every quest's completing stroke is
  contested (G9); "simple" means twist-free, never climax-free. Roughly half
  the draws carry a mid-quest twist.
- Draw rules (drawQuestShape, pure + unit-tested): self-set tasks are
  twist-free (their finale still stands); **the opening is scripted** — a
  story's first given quest carries a twist (RimWorld's lesson); no twist
  right after a twisted quest (P2); never the identical shape twice when
  another is available.
- `twistBeat` from `ceil(beats * 0.6)` keeps the twist at 50–75% (P3); clues
  land at `twistBeat - 1`.
- The clock is mirrored as a `- clock: n/m` line in quests.md for readability,
  but the **branch-derived ledger value is authoritative** (files are never
  rewound by /tree). Legacy quests without a clock line lazily get `4/0/1` on
  first attempt (finale armed like any modern quest).

## 2. The attempt loop (built; revised through playtest round 2.5)

`attempt_quest(title, approach, edge?, edge_reason?)` — the only way work
advances. Branch order per attempt:

1. Quest must be `[open]`. A presented, unpicked twist on THIS quest → "the
   choice stands open" (no tick). A standing trial on THIS quest → "the die
   must fall first" (no tick).
2. Twist presentation: next beat ≥ `twistBeat`, plan woven, unspent, and no
   gate pending anywhere → no tick; the complication event carries the
   visible options; the widget shows them. The beat is consumed.
3. Clues: twist armed, plan not yet woven, next beat ≥ `twistBeat − 1` →
   tick + weave the fate plan (side call, §4) + hand the keeper the two clue
   lines (F1's soft move). Planner unreachable ⇒ fate_skipped, twist
   neutralized, play continues.
4. **Finale (G9)**: finale armed, unfired, and this tick would FILL the clock
   (`filled + 2 ≥ size`), gates open → no tick; a `check` event (kind
   "finale") declares the stakes contract (tier + DC public) and waits for
   /roll. Fires once; if a twist-pick already completed the clock, the twist
   was the peak and the finale never fires.
5. **Hazard (G10)**: the keeper declared `edge: "hindered"` (with recorded
   reason) → no tick; a `check` event (kind "hazard") — the bold stroke must
   earn itself, worst of two dice. May recur if recklessness recurs; never
   spends the finale.
6. Otherwise → tick (+2), return progress `n/m` and "narrate the work".

Gate: `update_quest(done=true)` is **refused unless the clock is full**.
`attempt_quest` on done/rewarded/failed quests refuses. One attempt = one
real scene of effort (protocol: a reply that advances the task in fiction
MUST carry the call — narrated progress without it is theater).

Open-quest cap (P4): `grant_quest` refuses while 4 quests stand open.

## 3. Outcome bands (Phase 1 without dice)

Each fate-plan option carries one hidden band:

| band     | clock effect        | side effects                          |
|----------|---------------------|---------------------------------------|
| clean    | +2                  | possible small perk in narration      |
| windfall | +2                  | addItem loot / ally / discovery event |
| cost     | +2                  | narrated cost, recorded               |
| setback  | −1 (floor 0)        | situation worsens, still convergent   |
| fail     | quest → `[failed]`  | rare; desperate options only          |

Validation bounds (code, F5): 2–4 options (+1 blue), at least one
clean-or-windfall, at most one fail and only on a `desperate` option.
`[failed]` is a terminal status like `rewarded`; openQuestLines drops it.

## 4. The fate planner (Phase 1)

`gmPlanFate` — a gmchat-style side call (keeper's context never sees it, A2).

- Input: world + laws file + place page + personas present + quest + drawn
  complication suit + recent quest shapes (variety hint).
- Suits (drawn by code): material failure · world-law surprise · persona
  interruption · rival interference (from the laws palette) · time pressure ·
  knowledge gap · consequence echo (a logged past choice resurfaces) ·
  windfall.
- Output (strict JSON, parsed and bound-checked like parseGmAnswer):
  `{ complication, clues: [2], options: [{ id, label, risk: safe|risky|desperate,
  promise, band, reveal, reason, requires?: {item?|persona?|place?} }] }` —
  `reveal`/`reason`/`band` are the hidden answer sheet; `reason` must cite a
  law or palette entry (A5, F4).
- Blue options (F2): an option with `requires` renders only when the chronicle
  proves it (items.md substring / personaExists / placeExists) — shown marked.
- Failure mode: planner unreachable or invalid twice → the twist is skipped,
  the quest continues plain. Play never blocks on the planner.
- Ledger: the full plan is stored as a **veiled** event (describeEvent says
  "sealed", A4); the presentation event carries only the visible fields.

## 5. Choice UI (Phase 1; extended for trials and offers)

- Panel: `ctx.ui.setWidget(key, lines, { placement: "aboveEditor" })` — shows
  the pending twist (options with risk word and promise, blue options marked
  with their qualifying fact), an open offer (labels only), or a standing
  trial (tier, DC, edge). Never blocks the editor (G7).
- Pick: `/pick <n> [extra words]` — completions list the live options;
  Alt+1..9 via `onTerminalInput` (consume + `setEditorText("/pick n ")`) so
  extra words can be appended before submit.
- Plain messages while a choice is open are conversation only — a TWIST
  persists (nothing auto-picks); an OFFER lapses on the next plain turn.
- Resolution: code applies the band (§3), records pick + outcome events,
  clears the widget, and hands the keeper an `[engine:<nonce>]` message
  (reveal + reason + "narrate diegetically, never name the mechanics, end
  with an open move") with triggerTurn — the /web hand-off pattern. Offer
  picks carry no bands: the choice simply becomes the seeker's word.
- Widget state derives from branch events, so /tree mid-choice rewinds the
  panel correctly (A3).

## 6. Ledger events (Phase 1; extended through the playtest rounds)

| event          | payload                              | /ledger description    |
|----------------|--------------------------------------|------------------------|
| quest_shape    | slug, clock, twist, check            | "the fates take measure…" (size public, twist position not shown) |
| quest_tick     | slug, add, filled/size, note         | "the work advances…"   |
| fate           | slug, plan (hidden fields)           | veiled: "…(sealed)"    |
| fate_skipped   | slug                                 | "the fates hold their tongue…" |
| complication   | slug, text, options (visible fields) | "the task twists…"     |
| offer          | text, options (labels)               | "choices laid before the seeker…" |
| offer_dropped  | —                                    | "the choices pass unchosen…" |
| pick           | slug ("" = offer), option id, extra? | "the seeker chooses…"  |
| check          | slug, tier, dc, trial, kind, edge?   | "a trial bars…" (stakes contract, public) |
| roll           | slug, dice[], kept, dc, band, grit   | "the die falls…" (every face public) |
| outcome        | slug, band, add, public text         | "the fates answer…"    |

derive() folds these into `undertakings[slug]` (clock, twist/finale state,
grit, cold streak) + the global `pendingChoice` (twist|offer) and
`pendingRoll`.

## 7. World laws file (Phase 1)

`config/worlds/<id>.laws.md` — hot-reloaded; optional (absent = empty).
Sections: Physics & nature deviations · Biology · Special mechanics (magic /
technology systems) · Hard limits (the impossible) · What goes wrong here
(the interruption palette) · Advice channels (who knows what, how reliably —
KoDP's fallible-advisor pattern). Feeds: keeper prompt (layer "1½ · the laws
of this world"), fate planner, GM table.

## 8. Prompt additions (Phase 1)

Keeper protocol: attempt_quest whenever the seeker works a task (narration
alone never advances it); voice engine-presented options in character, never
invent or pre-empt the pick; weave clue lines before the twist; Dungeon World
lines — be a fan of the seeker, make a move that follows, **never speak the
name of your move**; failure narration written as lovingly as success; the
task in one clear sentence, mystery in the story.

## 9. Dice (built — Phase 2)

- d20, tiers by clock size: easy DC 10 (clock 4) / middling 15 (6) / hard 20
  (8) — announced BEFORE the cast (the stakes contract). No numeric modifiers
  exist anywhere: the only adjustment is **edge**, a second visible die
  (favored keeps the best, hindered the worst), declared by the keeper with a
  recorded one-line reason.
- Margin bands (rollBand, pure): natural 20 always **great**, natural 1
  always **setback**; else ≥DC+5 great (+3) / ≥DC success (+2) / miss ≤4 cost
  (+2, a visible price) / worse setback (−1, bounded — a bare die can NEVER
  hard-fail a quest; [failed] stays exclusive to desperate twist paths).
- /roll: in the TUI a focused overlay anchored bottom-center above the editor
  in its own accent frame — space casts, the die tumbles, esc before casting
  leaves the trial standing. **Grit** (one per quest) is offered inside the
  overlay after SEEING a missed die (reroll once). Headless sessions roll
  plainly. After two straight setbacks the next trial comes openly favored
  ("the fates relent"). Every face is crypto-rolled and recorded; rolls and
  picks render as colored permanent transcript lines.
- **/roll is self-healing** (playtest 3): cast with no trial standing —
  if a choice is what stands, it points at /pick; if open work exists, the
  engine corrects the keeper itself (nonce-marked, carrying the open work's
  clocks, forbidding meta-talk) so the contested effort routes through
  attempt_quest and the true moment follows in one step. Theater costs one
  turn, never the sitting.

## 9½. Open offers (built — playtest round 2.5)

`offer_choices(prompt, options[2..5])` — when a scene lays real alternatives
before the seeker (a task board, a fork, rival requests), the keeper hands
them to the engine: same panel, same /pick (+ optional words), NO hidden
outcomes. An offer never binds: any turn that is not its own /pick drops it
(`offer_dropped` — it can never deadlock the one-gate rule). Protocol: a
prose list of courses is not a choice — enumerating tasks requires the call.
The GM table can lay one too (fix kind "choices") and can arm a die on an
open quest (fix kind "trial", weight easy/middling/hard).

## 10. The long game (Phase 3 — spec'd, not built)

Shuffle-bags as ledger draw events (shape/suit/decision-shape decks,
draw-without-replacement, branch-aware); breadcrumbs (chains end in a named
pointer via chronicle_place; keep 2–3 live); hook bundles per place;
consequence-echo callbacks ("resurface later" flags); travel micro-events
(one per leg, never zero, never two); GM-table repair kinds for clocks and
plans; pacing fingerprints per chronicle; roll-first-allocate decision shape
(Citizen Sleeper: the die shown first, the seeker chooses where to spend it —
moved here from Phase 2 to join the decision-shape rotation).
