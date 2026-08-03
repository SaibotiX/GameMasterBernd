# Undertakings — build plan & progress

Checked off as built AND verified (unit/integration/live smoke). Each item
names the goals/invariants it serves (undertakings-goals.md).

## Phase 1 — the spine (complications without dice)

- [x] World laws files for both worlds (`config/worlds/<id>.laws.md`) — A5, F4
- [x] Loader: `World.laws` (optional file, hot-reloaded) — A5
- [x] Prompt: layer "1½ · the laws of this world" + protocol additions
      (attempt loop, voice-the-options, clue weaving, DW principles,
      one-clear-sentence tasks, loving failure narration) — G1, G3, F1, F4
- [x] Ledger: events quest_shape / quest_tick / fate (veiled) / complication /
      pick / outcome (+ fate_skipped); derive → undertakings map +
      pendingChoice — A3
- [x] world.ts: clock line parse + tick + `[failed]` terminal status — G1, F5
- [x] Shape draw at grant (4/0, 6/0, 6/2, 8/3; self-set plain-only; no-repeat
      reroll; no twist after a twisted quest) — G5, P2, P3
- [x] Open-quest cap (refuse the 5th) — P4
- [x] gmchat: gmPlanFate side call + parseFatePlan validation (2–4 options,
      ≥1 clean/windfall, ≤1 fail on desperate only, reason cites a law,
      2 clues; planner failure ⇒ quest continues plain) — A1, A2, F3, F5
- [x] index.ts: attempt_quest tool (clues stage → present stage → tick),
      done-gate on update_quest, blue-option filtering vs chronicle — G1, F2
- [x] Choice widget (aboveEditor) + /pick command + completions + Alt+1..9
      prefill hotkeys; widget derives from branch events — G7, A3
      (widget/hotkeys are TUI-only code paths, exercised in manual play)
- [x] /pick resolution: band table, outcome events, [engine:nonce] hand-off
      to narrate — A1, A2, F4
- [x] GM table: undertaking state visible, fate plans veiled — A4
- [x] Unit tests: clock parse/tick/gate, derive folding, parseFatePlan
      validation, laws loading, prompt layer (50/50 green 2026-08-03)
- [x] README section
- [x] Live smoke: one quest end-to-end with a complication and a pick
      (2026-08-03, 6/6: tick → fate woven → twist with 4 honest-risk paths →
      /pick → outcome "cost" applied, clock mirror 4/6, no provider errors.
      Note: crafted smoke sessions MUST carry a chronicle stamp or the
      adoption rule routes world files to the legacy folder — fixture gotcha,
      not an engine bug. Widget/hotkeys are TUI-only paths: verify in manual
      play.)

## Phase 2 — the dice

- [ ] Tier ladder + margin bands; check-shapes join the shape pool
- [ ] Dice overlay (ctx.ui.custom, focused, ASCII die, DC + named modifiers)
- [ ] Advantage/disadvantage as a visible second die (keeper justifies, code
      records)
- [ ] Grit: one per quest, reroll after seeing the die
- [ ] Karmic clamp: open advantage after two straight hard failures
- [ ] Roll-pending gate (quest tools blocked, talk free) — G8
- [ ] Roll-first-allocate decision shape (Citizen Sleeper variant)
- [ ] Tests + smoke

## Phase 3 — the long game

- [ ] Shuffle-bags as ledger draw events (shape / suit / decision-shape)
- [ ] Breadcrumbs: chains end in a pointer (chronicle_place + rumor);
      keep 2–3 live
- [ ] Hook bundles per place (2–4 sharing a pocket)
- [ ] Consequence-echo callbacks (resurface-later flags; name the past choice)
- [ ] Travel micro-events (one per leg, never zero, never two)
- [ ] GM-table repair kinds for clocks/plans
- [ ] Pacing fingerprints per chronicle feeding the planner
- [ ] Tests + smoke

## Decisions log

- 2026-08-03 · Percent-chance-per-task replaced by scheduled tension
  (research: randomness reads as slack; PbtA "no nothing-happens").
- 2026-08-03 · Mouse clicks → numbered hotkeys + /pick (pi TUI idiom;
  onTerminalInput prefill gives the "select then add words" flow).
- 2026-08-03 · Fate plan generated at the clues beat (twistBeat−1), not at
  grant — fresher world state, telegraphs precede the choice, quests never
  pursued cost no planner call.
- 2026-08-03 · Clock authority = branch-derived ledger; quests.md line is a
  readable mirror only (files don't rewind with /tree).
- 2026-08-03 · Phase 1 anti-repeat is the minimal no-repeat rule; full
  shuffle-bags deferred to Phase 3 (user-approved build order).
