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

## Phase 2.8 — the challenge round (2026-08-03: audit resolutions + the living world)

The full-stop audit (design/design-code-audit.md) found 12 discrepancies; the
user ruled on every one and decreed three new systems. All built this round:

- [x] D1 · ONE GATE HOLDS ALL WORK: attempt_quest refuses while any choice or
      die stands anywhere (another quest, an offer, a peril) — the finale can
      no longer be dodged via a side errand; the standing layer names the
      gate so the keeper steers back; twist/finale/peril panels burn error-red
      and ring the bell once — G7 revised, G9/G10 sealed
- [x] D2 · the no-drought rule REBUILT as ≤1 AUTORESOLVE PER QUEST: shapes
      carry drawn checkpoint-trial beats (mids; 6/0 → one of beats 1|2, 8/0 →
      two of 1..3, 8@3 → [1]); at most one beat of any quest is a plain tick
      and its position varies; twist chance decoupled (2-in-3 on 6/8 clocks),
      strict alternation deliberately rejected (G5)
- [x] D3 · fate plans bounded 2–4 options total (the four-slot board), ≤1 blue
- [x] D4 · citation floor: citesGrounding — every hidden reason must share
      words with the laws/world text or the plan is rejected (retry once,
      then fate_skipped)
- [x] D5 · the planner receives the place's PAGE (clipped) — twists grow from
      the record, not thin air
- [x] D6 · the 4-cap binds everywhere (GM repairs too); the fifth-slot ask
      routes through the seeker: offer the four → shelve_quest the named one
      → grant anew
- [x] D7 · hindered beats the karmic clamp — recklessness rolls worst-of-two
      even mid-cold-streak; the fates relent only on honest trials
- [x] D8 · done-gate unconditional: no recorded work ⇒ update_quest(done)
      refused (legacy leniency removed per user)
- [x] D9 · resolved fates' FULL answer sheets feed the GM table (every path's
      band/reveal/reason, the pick marked) — "I told you we should have…"
      gets real answers; `resolved` now set by the pick itself
- [x] D10 · stale texts swept (ledger.ts check-flag comments, README events)
- [x] D11 → G13 · RENOWN: score = 3×closed quests (won or lost) + places +
      souls; level 1–5 caps; DIFFICULTY_BY_LEVEL weights the clock draw
      (L1 55/35/10 → L5 10/30/60); grant_quest gains keeper-named `weight`
      for fiction-signaled scale (outranks the no-repeat nudge)
- [x] D12 · untaken courses: offers record their place; lapsed/unpicked
      courses wait in untakenOffers, reachable ONLY via /quest accept <n.m>
      at that place (offer_taken removes them); never re-offered in play
- [x] G12 · EFFORT IS THE PRICE: protocol law — careless moves ("I go there")
      are declared hindered or hand the watchers the advantage; detail earns
      clean attempts
- [x] G14 · PERILS, WOUNDS & DEATH: veiled peril_fuse (8→4 turns by level,
      +0–4 slack; 3-turn opening grace; re-winds after each strike); 8 peril
      kinds; severity by level (even L1: 10% hard); check slug "" holds all
      work; setback wounds (+1, +2 hard), 3 wounds = death; heal_wounds
      keeper tool (earned, one at a time); death = epilogue prompt layer +
      tools of the living refused + ☠ footer; /new for a new tale
- [x] The four-slot board: ui.ts gridBox (pure, tested) renders the 2×2 grid
      for the choice widget (urgent red for twists/finales/perils, calm for
      offers) AND the /quest window (dice-ceremony dress)
- [x] Commands: /quest [accept <id>] · /place [name] · /persons [name] ·
      /history [long] (deterministic majors-timeline + achievements tally;
      long = gmChronicle side call, record-grounded saga, plain-timeline
      fallback)
- [x] Verified: 64/64 unit (new: draw/difficulty/mids exhaustives, renown &
      peril bounds, checkpoint/wound/death/untaken/tally folding, gridBox
      widths, citation floor, shelve/revive, page lists) + 18/18 headless
      RPC smoke against real pi (crafted session with fuse/peril/wound/
      offer_taken/shelved: /ledger /quest /history /place /persons /roll +
      both /quest accept flows mutate session and quests.md correctly).
      TUI-only paths (board rendering, bell, red urgency, /quest window):
      verify in manual play as ever.

### Playtest 4 — the apple stranding (user's knight sitting, 2026-08-03)

Session 019fc7c7…: the seeker fetched Schnuri's apple; the story said
delivered, the engine said 2/6 with a twist pending; the keeper grew
confused, the seeker bound three "set the quest finished" truths, and /dm
threw "content is not a function". Root causes found in the session record
and ALL fixed + verified:

- [x] **The widget crash (root of everything):** pi's setWidget takes a
      FACTORY `(ui, theme) => Component` for non-array content — we passed a
      component object, so EVERY widget refresh threw "content is not a
      function". It fired exactly at twist presentation (u45/46): the
      complication event landed, the tool RESULT became the error, the
      keeper never saw "voice these paths and wait" and improvised the apple
      delivery while the engine held the gate. It also ate the /dm truth
      confirmations (hence three retried imperative truths) and hid the pick
      panel entirely. Fixed: proper factory (theme from pi's own hand) AND
      updateWidgets is now hard-wrapped — a broken panel can never again
      poison a tool result or a command. Verified by a real pseudo-TTY
      probe: the four-slot board renders over the user's exact crafted
      state, zero errors.
- [x] **Stuck-quest repairs at the GM table** (pulled forward from Phase 3):
      fix kinds "untwist" (twist_dropped event — dissolve a twist the story
      overtook; sealed plan opens, A4) and "clock" (set the branch clock to
      what the record shows; refused mid-gate — chain untwist first). Both
      demand *uN* evidence and are forbidden as escape hatches from live
      machinery.
- [x] **Truths are not levers:** the guardian's new form duty refuses
      commands dressed as facts ("set the quest as finished") and points the
      seeker to the table's repairs instead.
- [x] **Reveals never deliver the goal:** the fate planner's contract now
      forbids outcomes that finish the task or hand over its object (u52's
      setback reveal had narrated "the apple reaches Schnuri" while ticking
      the clock BACKWARD — fiction and engine torn apart in one line).
- [x] **Never ask where — name the world:** the keeper asked "Name the
      castle—what do men call it?" after a party-stands-nowhere refusal
      (u15/16). Protocol now: the party is somewhere from the first scene;
      invent the place from the story's cues, never ask; every NAMED place
      and soul gets its page at once (the steward and the dismissed gardener
      of u45 had none); agreed work is granted in the same reply.
- [x] **Refusals are course corrections:** new protocol law (read the
      refusal, do the named thing in the same reply, never repeat a failing
      call unchanged, never read engine errors aloud) — and the
      party-stands-nowhere errors themselves now carry the invent-don't-ask
      guidance. (The u50 offer_choices refusal already steered the keeper
      back to the pick — that pattern is now the rule everywhere.)
- [x] Verified: 65/65 unit (twist_dropped folding, repair-kind parsing, new
      protocol lines) + 18/18 headless RPC smoke + the TTY widget probe.

## Phase 2.9 — the AI playtester: test first (maintainer's ruling, 2026-08-03)

TEST FIRST — Phase 3 waits, and shrinks (full reasoning and the harness
design: `aitester/ai-playtester.md`). Four human playtests, four
stranding-class finds within the first two tasks; the newest systems
(perils, wounds, death, renown, shelving, untaken offers) have at most one
sitting of exposure — and Phase 3's features live beyond the current
survival horizon. The harness multiplies exposure exactly where the bugs
live, at an evening's cost.

- [x] The harness (`aitester/`): driver spawns the REAL engine over pi RPC
      through a wrapper extension that only ADDS `/ai-state` (headless TUI
      parity — public state, nothing veiled); a tester LLM plays one
      world-specific persona per sitting under a TASKS-FIRST guide; the
      sitting boundary (2 closed / 3rd granted / 24 turns / death / stall /
      provider error) lives in the driver, never in game code
- [x] Batch 1 (2026-08-03, v1): harness flawless, and the record delivered —
      zero quest ticks in 48 turns; unvoiced peril trials stranded both
      sittings unnoticed by the testers ⇒ v2: `/ai-state` every turn +
      TASKS-FIRST personas
- [x] v3 (2026-08-03): harness merged into this repo as `aitester/` — the
      separate-repo layout broke the driver's commit stamp and hid the
      engine-import layout assumption; one commit now pins engine + harness
      (selftest 30/30 · wrapper-smoke 9/9 · scripted batch end-to-end)
- [ ] Batch 2 (v2 harness, both worlds) → report in `aitester/reports/` →
      rulings → fixes → re-test the same ground (RITE)

**Exit criterion to start Phase 3**: two consecutive batches in which every
sitting closes at least two tasks (or dies honestly) with zero S1/S2
findings, in both worlds.

## Phase 3 — the long game (re-scoped 2026-08-03 with the test-first ruling)

Much of the original list had shipped in spirit by Phase 2.8; the relevance
check (`aitester/ai-playtester.md` §9) re-scoped it — verdicts inline:

- [ ] Breadcrumbs: chains end in a pointer (chronicle_place + rumor);
      keep 2–3 live — KEPT (G6 still unserved; nothing built points
      chain-ends onward)
- [ ] Consequence-echo callbacks (resurface-later flags; name the past
      choice) — KEPT (cheaper than specced: D9's resolved answer sheets are
      exactly the record an echo cites)
- [ ] Hook bundles — MERGED into D12's anchors: "2–4 courses waiting per
      place", not a new system
- [ ] Travel events — RE-SCOPED to "no leg passes silently" (color, an
      encounter, or the fuse striking); per-leg guarantees would
      double-punish travel on top of G14
- [ ] Shuffle-bags — SHRUNK: draw-without-replacement only where batch data
      shows real repetition (trouble kinds, decision shapes); the
      ≤1-autoresolve rule, no-repeat reroll, decoupled twist chance and the
      renown-weighted draw already serve G5/P5's intent
- [ ] Plan-rewriting repair kind (small) — untwist + clock repairs were
      PULLED FORWARD and proven in playtest 4
- [→] Pacing fingerprints — DEFERRED: the batch reports ARE the first
      fingerprints; automate what they prove useful
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
  scripted opening (first given quest never plain); draw logic extracted to
  drawQuestShape (pure, exhaustively unit-tested). [CORRECTED by the audit,
  same day: the "no-drought rule (plain never follows plain)" this entry once
  claimed was never implemented, and the "plain share ≈ ⅓" figure was wrong —
  the realized stream was ≈ 40% twisted / 60% twist-free. The audit round
  rebuilt the intent as the ≤1-AUTORESOLVE rule (checkpoint trials inside
  twist-free quests) instead of cross-quest alternation, which the user
  rejected as a pattern (G5): "the game is designed to not follow strict
  patterns".]
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
- 2026-08-03 · Audit round (design/design-code-audit.md, user's rulings):
  gates are UNSKIPPABLE and global (one gate holds all work — flash red, ring
  the bell, refuse every attempt) rather than per-quest; hindered outranks
  the karmic clamp (challenge over mercy); the 4-cap is absolute but the
  seeker chooses what to shelve; quests may be shelved/revived and untaken
  offers taken up — but ONLY by the seeker's own command at the anchoring
  place, never re-offered in play; the fate planner is grounded harder
  (place page in, citation floor on reasons, 2–4 options); resolved answer
  sheets open at the GM table; legacy done-gate leniency removed.
- 2026-08-03 · The living world (user's decree, Kenshi research): the game is
  a CHALLENGE — effort is priced (careless moves are hindered), difficulty
  ladders with renown (score counts losses as much as wins), the world
  strikes on a hidden fuse quest-or-no-quest, wounds are a public 0–3 meter,
  and DEATH IS A FEATURE: sought or unsought, it ends the tale (epilogue
  layer; /new). Guaranteed success is the enemy: "If he puts in no effort,
  nothing will be given to him."
- 2026-08-03 · Playtest 4 (the apple stranding): UI failures must never
  poison engine answers — every widget path is hard-wrapped, and any
  non-array setWidget content must be a `(ui, theme) => Component` FACTORY
  (pi contract; a bare object throws "content is not a function" into
  whatever tool call triggered the refresh). Repairing a story the record
  lost is table work, not truth work: truths refuse imperatives; the table
  gained untwist + clock hands, evidence-bound. Naming the world is the
  keeper's job — invented from cues, never asked; named places and souls are
  paged the moment they exist. Refusal texts are steering, part of the
  design surface: every engine refusal must name the correction it wants.
- 2026-08-03 · Test first (the AI-playtester ruling): before Phase 3, AI
  batches multiply playtest exposure where the bugs concentrate — the
  newest systems, inside the first two tasks. Phase 3 shrinks per the
  relevance check (see the re-scoped list above) and starts only after two
  consecutive clean batches (every sitting closes two tasks or dies
  honestly, zero S1/S2) in both worlds. The harness plays the REAL engine
  over RPC (never instrumented, `/ai-state` adds text-only TUI parity) and
  lives in `aitester/` — merged into this repo the same day it was split
  out, because a separate repo broke the one-commit stamp that makes a
  batch's findings attributable to an exact engine state.
