# Undertakings — mechanics specification

The implementable spec. Phase tags mark what ships when (see
undertakings-build.md). Terms: a *beat* is one meaningful attempt scene; a
quest's *clock* has `size` segments and fills by ticks.

## 1. Clocks (Phase 1)

- Every granted quest draws a shape: `{ clock: 4|6|8, twistBeat: 0|n }`
  (0 = plain). Beats = clock/2 (standard tick = 2 segments).
- Shape pool (Phase 1): `4/0`, `6/0`, `6/2`, `8/3` — half plain, half twisted;
  self-set tasks draw only plain shapes. Anti-repeat (Phase 1 minimum): reroll
  once if the draw equals the previous quest's shape; no twist if the previous
  quest had one (P2). Full shuffle-bags land in Phase 3.
- `twistBeat` from `ceil(beats * 0.6)` keeps the twist at 50–75% (P3); clues
  land at `twistBeat - 1`.
- The clock is mirrored as a `- clock: n/m` line in quests.md for readability,
  but the **branch-derived ledger value is authoritative** (files are never
  rewound by /tree). Legacy quests without a clock line lazily get `4/0` on
  first attempt.

## 2. The attempt loop (Phase 1)

New tool `attempt_quest(title, approach)` — the only way work advances:

1. Quest must be `[open]`. If this quest has a presented, unpicked
   complication → return "the choice stands open" (no tick).
2. If the *next* beat is `twistBeat - 1` → tick + generate the fate plan
   (side call, §4) + hand the keeper the two clue lines to weave in (F1's
   soft move).
3. If the *next* beat is `twistBeat` and no other complication is pending
   globally (P1: one at a time; if one is pending elsewhere, just tick and
   defer) → no tick; present the complication: ledger event with the visible
   options + the choice widget (§5). The beat is consumed by the event.
4. Otherwise → tick (+2), return progress `n/m` and "narrate the work".
5. Clock full → "the deed stands done — record it with update_quest".

Gate: `update_quest(done=true)` is **refused unless the clock is full**
(same style as redeem_quest's giver gate). `redeem_quest` unchanged.
`attempt_quest` on done/rewarded/failed quests refuses. One attempt = one real
scene of effort (protocol instructs the keeper; not code-enforceable).

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

## 5. Choice UI (Phase 1)

- Panel: `ctx.ui.setWidget(key, lines, { placement: "aboveEditor" })` — shows
  the pending complication + numbered options with risk word and promise;
  blue options marked with their qualifying fact. Never blocks the editor (G7).
- Pick: `/pick <n> [extra words]` — completions list the live options;
  Alt+1..4 via `onTerminalInput` (consume + `setEditorText("/pick n ")`) so
  extra words can be appended before submit.
- Plain messages while a choice is open are conversation only — the panel
  persists, nothing auto-picks.
- Resolution: code applies the band (§3), records pick + outcome events,
  clears the widget, and hands the keeper an `[engine:<nonce>]` message
  (reveal + reason + "narrate diegetically, never name the mechanics, end
  with an open move") with triggerTurn — the /web hand-off pattern.
- Widget state derives from branch events, so /tree mid-choice rewinds the
  panel correctly (A3).

## 6. Ledger events (Phase 1)

| event          | payload                              | /ledger description    |
|----------------|--------------------------------------|------------------------|
| quest_shape    | slug, clock, twistBeat               | "the fates take measure…" (size public, twist position not shown) |
| quest_tick     | slug, add, filled/size, note         | "the work advances…"   |
| fate           | slug, plan (hidden fields)           | veiled: "…(sealed)"    |
| complication   | slug, text, options (visible fields) | "the task twists…"     |
| pick           | slug, option id, extra?              | "the seeker chooses…"  |
| outcome        | slug, band, public text              | "the fates answer…"    |

derive() folds these into `undertakings[slug]` (filled, twistBeat, cluesGiven,
pending presentation) + a global `pendingChoice`.

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

## 9. Dice (Phase 2 — spec'd, not built)

d20, six named tiers (5→30), margin bands (beat by 5+ = clean+perk / make =
clean / miss 1–4 = cost / miss 5+ = detonate). Advantage/disadvantage = second
visible die. Engine-rolled (crypto), recorded; roll happens in a focused
`ctx.ui.custom` overlay (unmissable but only summoned at the moment). One
grit token per quest = reroll after seeing the die; karmic clamp = open
advantage after two straight hard failures. Roll-first-allocate variant
(Citizen Sleeper) as a decision shape.

## 10. The long game (Phase 3 — spec'd, not built)

Shuffle-bags as ledger draw events (shape/suit/decision-shape decks,
draw-without-replacement, branch-aware); breadcrumbs (chains end in a named
pointer via chronicle_place; keep 2–3 live); hook bundles per place;
consequence-echo callbacks ("resurface later" flags); travel micro-events
(one per leg, never zero, never two); GM-table repair kinds for clocks and
plans; pacing fingerprints per chronicle.
