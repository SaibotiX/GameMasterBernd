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

- [x] Tier ladder + margin bands (rollBand: nat 20/1 override, ≥DC+5 great /
      ≥DC success / miss ≤4 cost / else setback; ticks +3/+2/+2/−1);
      check-shapes join the pool (4/check@2, 6/check@3 — trials guard the
      FINAL beat, twists stay mid-quest) — G8
- [x] Dice overlay (ctx.ui.custom, focused; space casts, tumble animation,
      esc before casting leaves the trial standing; headless /roll resolves
      plainly for RPC/tests)
- [x] Edge as a visible second die: keeper declares favored/hindered on
      attempt_quest with a recorded one-line reason; no numeric modifiers
      exist at all — bounded accuracy by construction
- [x] Grit: one per quest, offered inside the overlay AFTER seeing a missed
      die (the BG3 moment); recorded in the roll event
- [x] Karmic clamp: two straight setbacks force a favored die, openly
      ("the fates relent")
- [x] Roll-pending gate: attempt_quest holds at the brink, one gate globally
      (choice XOR trial), talk stays free; widget shows the trial panel — G8
- [→] Roll-first-allocate decision shape — MOVED to Phase 3 (it is a
      decision-shape variant; belongs with the shuffle-bag rotation)
- [x] Unit tests (52/52 green: rollBand/BAND_TICKS/TIERS, check/roll/grit/
      coldStreak folding, shapes carry check, prompt trial line)
- [x] Live smoke: trial declared → /roll → outcome (2026-08-03, 5/5: the
      keeper granted favored edge unprompted WITH a written reason; the two
      dice came up 1 and 1 — natural-1 override → setback, clock slipped
      2/4 → 1/4, bounded, story open. The dramatic worst case exercised
      every rule at once. Overlay/grit are TUI-only: verify in manual play.)

## Phase 2.5 — the playtest round (user feedback, 2026-08-03)

- [x] Finale on the completing stroke: trials fire on whichever attempt would
      fill the clock (not a pre-counted beat); plain shapes removed from the
      pool — every quest's peak is contested — G9
- [x] Hazard trials: edge "hindered" turns that attempt into a worst-of-two
      trial on the spot; recur if recklessness recurs; never spend the
      finale — G10
- [x] offer_choices tool: open alternatives as a pickable panel (2–5 courses,
      no hidden outcomes); lapses when the seeker speaks past it
      (offer_dropped on the next plain turn); /pick generalized — G11
- [x] GM-table hands: fix kinds "trial" (arm a die on an open quest,
      weight easy/middling/hard) and "choices" (lay an offer) — "/dm a roll
      would fit here" now has real hands
- [x] Overlay polish: bottom-center anchor above the editor, own
      accent-colored left-edge frame, band-colored verdict (right-edge
      padding avoided: ANSI widths lie)
- [x] Persistent records: rolls and picks render as colored permanent
      transcript lines (band-tinted dice, accent picks), no longer dim asides
- [x] Unit tests 54/54 (new pool rules, offer lapse/bind, hazard vs finale)
- [x] Live smoke: completing attempt ⇒ finale trial; notice board ⇒ offer ⇒
      pick (2026-08-03, 6/6: the finish declared "an easy trial (DC 10)
      kind=finale", die 4 ⇒ setback — the peak slipped, honestly; the keeper
      turned the notice board into a five-course offer UNPROMPTED and the
      offer-pick recorded with the empty slug)

### Playtest 3 — theater recovery (user's third sitting, 2026-08-03)

- [x] Anti-theater law extended: quest work, trials and dice named in the
      "without the tool call it has NOT happened" rule; attempts MANDATORY
      when a reply advances the task in fiction; prose lists of courses must
      carry offer_choices
- [x] /roll self-healing: no trial + pending choice ⇒ points at /pick; no
      trial + open work ⇒ nonce-marked engine correction carrying the open
      clocks, forbidding meta-talk, forcing the route through attempt_quest
      ("world-console.nudge" renderer: "⚙ the engine steadies the keeper")
- [x] Verified: 54/54 unit; recovery smoke 3/3 against the stranded
      sitting's exact state — first try exposed the keeper apologizing aloud
      and asking the player for the task, so the correction now carries the
      quest facts itself; second try: attempt_quest at once, the unplayed
      twist presented, /pick resolved clean against the sealed plan

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
- 2026-08-03 · Phase 2: trials guard the FINAL beat (climax), twists stay
  mid-quest — the two event kinds read differently by placement alone.
- 2026-08-03 · No numeric roll modifiers anywhere: edge (second die) is the
  only adjustment — every number on screen is a die face or a DC.
- 2026-08-03 · A bare trial can never hard-fail a quest (worst is setback);
  hard failure remains exclusive to desperate twist paths (F5 ladder).
- 2026-08-03 · Roll-first-allocate deferred to Phase 3 with the decision-shape
  rotation; grit is TUI-only (the ceremony is where the choice lives).
- 2026-08-03 · Playthrough finding (user's first real sitting): the only quest
  drew the plain 6-clock — /pick and /roll correctly never fired, but a first
  quest showing no machinery is a pacing bug, not luck to accept. Fix: the
  scripted opening (first given quest never plain) + the no-drought rule
  (plain never follows plain); draw logic extracted to drawQuestShape (pure,
  exhaustively unit-tested). Long-run plain share stays ≈ ⅓.
- 2026-08-03 · Second playthrough (user): (a) climax fell flat — the trial
  fired a beat early and the completing stroke was a plain tick ⇒ finales now
  trigger on COMPLETION, plain shapes deleted, "plain" redefined as
  twist-free (G2 revised, G9 added); (b) two outnumbered assaults ticked
  through unopposed ⇒ hindered attempts are hazard trials (G10); (c) the
  quest board begged for a /pick ⇒ offer_choices + lapse-on-speech (G11);
  (d) overlay overlapped the transcript in the same colors ⇒ bottom-center
  anchor + own accent frame; rolls/picks now colored permanent lines;
  (e) the table can arm a die or an offer on request (trial/choices fixes).
- 2026-08-03 · Offers auto-drop in before_agent_start on any turn that is not
  their own /pick — an offer can never deadlock the one-gate rule.
- 2026-08-03 · Third playthrough (user): the keeper stopped calling
  attempt_quest after beat 1 ("I fight the hound" narrated free), then
  promised dice in WORDS ("if you fail this roll…") with no trial declared —
  the seeker's /roll met "no trial stands", a dead loop. The sealed twist sat
  unplayed at beat 2 the whole time. Fixes: (a) the anti-theater law now
  names quest work, trials and dice ("dice you announce in words are dice
  nobody can cast"); attempts are MANDATORY when a reply advances the task in
  fiction; prose lists of courses must carry offer_choices; (b) /roll is
  SELF-HEALING — with open work and no trial, the engine itself corrects the
  keeper via a nonce-marked message (route through attempt_quest; never
  announce undeclared dice) and the true moment follows; with a choice
  pending it points at /pick. Theater now costs one turn, not the sitting.
