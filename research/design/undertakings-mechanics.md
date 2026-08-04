# Undertakings — mechanics specification

The implementable spec. Phase tags mark what ships when (see
undertakings-build.md). Terms: a *beat* is one meaningful attempt scene; a
quest's *clock* has `size` segments and fills by ticks.

## 1. Clocks (built; revised through the audit round, 2026-08-03)

- Every granted quest draws a shape:
  `{ clock: 4|6|8, twist: 0|n, check: 1, mids: number[] }` — twist =
  complication beat (mid-quest), check = FINALE ARMED (fires on completion,
  not at a counted beat), mids = CHECKPOINT-trial beats. Beats = clock/2
  (standard tick = 2).
- **Difficulty comes first (G13).** The clock size is the difficulty — easy 4
  / middling 6 / hard 8, same words as the trial tiers — drawn from the
  seeker's renown level (DIFFICULTY_BY_LEVEL, % easy/mid/hard):
  L1 55/35/10 · L2 45/35/20 · L3 30/40/30 · L4 20/35/45 · L5 10/30/60.
  The keeper may instead NAME the weight when the fiction plainly signals
  scale (grant_quest `weight`) — a named weight also outranks the
  no-repeat nudge; a hard task early is the seeker's to accept and to lose.
- Twist rules (drawQuestShape, pure + unit-tested): self-set tasks are
  twist-free (their finale still stands); **the opening is scripted** — a
  story's first GIVEN quest carries a twist on a 6+ clock (RimWorld's
  lesson); no twist right after a twisted quest (P2's cooldown); otherwise a
  6/8-clock twists **2 in 3** (4-clocks are too short to twist); never the
  identical (clock, twist) shape twice when avoidable. Long-run twist share
  among given quests ≈ 40% — deliberately not a pattern (G5).
- **≤1 AUTORESOLVE per quest** (the no-drought rule, rebuilt): at most one
  beat of any quest passes as a plain uncontested tick; every other beat is a
  twist, a clue weave, or a drawn checkpoint trial — and the soft beat's
  position varies with the draw. The checkpoint map:
  `4/0 → []` (beat 1 soft) · `6/0 → one of beats 1|2` · `6@2 → []` (the clue
  beat is the soft one) · `8@3 → [1]` (clues at 2) · `8/0 → two of beats
  1..3`. There is nothing duller than two winning strokes in a row for free.
- `twistBeat` from `ceil(beats * 0.6)` keeps the twist at 50–75% (P3); clues
  land at `twistBeat - 1`.
- The clock is mirrored as a `- clock: n/m` line in quests.md for readability,
  but the **branch-derived ledger value is authoritative** (files are never
  rewound by /tree). A quest without a shape lazily gets `4/0/1` on first
  attempt (finale armed like any modern quest).

## 2. The attempt loop (built; revised through the audit round)

`attempt_quest(title, approach, edge?, edge_reason?)` — the only way work
advances. Branch order per attempt:

1. Quest must be `[open]`. A presented, unpicked twist on THIS quest → "the
   choice stands open" (no tick). A standing trial on THIS quest → "the die
   must fall first" (no tick).
2. **ONE GATE HOLDS ALL WORK (G7/G9/G10, audit fix D1)**: any choice or die
   pending anywhere else — another quest's twist, an offer, the world's own
   peril — → no tick, "steer the scene back". Work on quest B can never slip
   past quest A's trial; the peak cannot be dodged by a side errand. Talk
   stays free; progress does not.
3. Twist presentation: next beat ≥ `twistBeat`, plan woven, unspent → no
   tick; the complication event carries the visible options; the four-slot
   board shows them (urgent red — the choice is unskippable). The beat is
   consumed.
4. Clues: twist armed, plan not yet woven, next beat ≥ `twistBeat − 1` →
   tick + weave the fate plan (side call, §4) + hand the keeper the two clue
   lines (F1's soft move). Planner unreachable ⇒ fate_skipped, twist
   neutralized, play continues.
5. **Finale (G9)**: finale armed, unfired, and this tick would FILL the clock
   (`filled + 2 ≥ size`) → no tick; a `check` event (kind "finale") declares
   the stakes contract (tier + DC public) and waits for /roll. Fires once; if
   a twist-pick already completed the clock, the twist was the peak and the
   finale never fires.
6. **Checkpoint (G13, ≤1-autoresolve)**: this beat is in the shape's `mids`
   and unfired → no tick; a `check` event (kind "checkpoint") — same stakes
   contract, quest-tier DC; never spends the finale. A hindered attempt here
   folds into the same die (worst of two).
7. **Hazard (G10)**: the keeper declared `edge: "hindered"` (with recorded
   reason) → no tick; a `check` event (kind "hazard") — the bold stroke must
   earn itself, worst of two dice. May recur if recklessness recurs; never
   spends the finale. The keeper also declares hindered for LOW-EFFORT moves
   (G12): a careless "I go there / I attack" is a hindrance of its own making.
8. Otherwise → tick (+2), return progress `n/m` and "narrate the work".

Gate: `update_quest(done=true)` is **refused unless the clock is full** —
unconditionally: a quest with no recorded work at all refuses too (audit fix
D8; no legacy leniency). `attempt_quest` on done/rewarded/failed/shelved
quests refuses. One attempt = one real scene of effort (protocol: a reply
that advances the task in fiction MUST carry the call — narrated progress
without it is theater).

Open-quest cap (P4): `grant_quest` refuses while 4 quests stand open — and
tells the keeper the way through: lay the four before the seeker
(offer_choices), `shelve_quest` the one they name, then grant anew. The cap
binds GM-table repairs too (audit fix D6). Shelving and revival: §12.

## 3. Outcome bands (Phase 1 without dice)

Each fate-plan option carries one hidden band:

| band     | clock effect        | side effects                          |
|----------|---------------------|---------------------------------------|
| clean    | +2                  | possible small perk in narration      |
| windfall | +2                  | addItem loot / ally / discovery event |
| cost     | +2                  | narrated cost, recorded               |
| setback  | −1 (floor 0)        | situation worsens, still convergent   |
| fail     | quest → `[failed]`  | rare; desperate options only          |

Validation bounds (code, F5): 2–4 options TOTAL (the choice board holds four
slots; at most one of them blue), at least one clean-or-windfall, at most one
fail and only on a `desperate` option. `[failed]` is a terminal status like
`rewarded`; openQuestLines drops it.

## 4. The fate planner (Phase 1)

`gmPlanFate` — a gmchat-style side call (keeper's context never sees it, A2).

- Input: world + laws file + the place's PAGE (its recorded lay, details and
  visit history — the twist grows from what the record knows, audit fix D5) +
  personas present + quest + drawn complication suit + recent SUITS (variety
  hint).
- Suits (drawn by code): material failure · world-law surprise · persona
  interruption · rival interference (from the laws palette) · time pressure ·
  knowledge gap · consequence echo (a logged past choice resurfaces) ·
  windfall.
- Output (strict JSON, parsed and bound-checked like parseGmAnswer):
  `{ complication, clues: [2], options: [{ id, label, risk: safe|risky|desperate,
  promise, band, reveal, reason, requires?: {item?|persona?|place?} }] }` —
  `reveal`/`reason`/`band` are the hidden answer sheet; `reason` must cite a
  law or palette entry (A5, F4), and the citation has a MECHANICAL floor
  (audit fix D4): `citesGrounding` requires each reason to share at least one
  meaningful stemmed word with the laws + world text — a plan whose reason
  touches no law is rejected and re-asked once, then the twist is skipped.
- Blue options (F2): an option with `requires` renders only when the chronicle
  proves it (items.md substring / personaExists / placeExists) — shown marked.
- Failure mode: planner unreachable or invalid twice → the twist is skipped,
  the quest continues plain. Play never blocks on the planner.
- Ledger: the full plan is stored as a **veiled** event (describeEvent says
  "sealed", A4); the presentation event carries only the visible fields.

## 5. Choice UI (Phase 1; rebuilt as the four-slot board, audit round)

- Panel: a `ctx.ui.setWidget` component above the editor rendering the
  **2×2 four-slot board** (ui.ts `gridBox`, pure + unit-tested — the same
  architecture as the /quest window): one slot per option (id, label, risk ·
  promise, blue options marked ⚑ with their qualifying fact); empty slots
  stay empty. A standing trial shows as its stakes line instead.
- **Urgency (G7 revised)**: a twist, a finale or a peril renders the board
  and headline in ERROR RED and rings the terminal bell once when it opens —
  the moment is unmissable and unskippable (all work holds, §2 step 2).
  Offers render calm (accent) — they lapse, nothing burns. Typing is never
  blocked.
- Pick: `/pick <n> [extra words]` — completions list the live options;
  Alt+1..9 via `onTerminalInput` (consume + `setEditorText("/pick n ")`) so
  extra words can be appended before submit.
- Plain messages while a choice is open are conversation only — a TWIST
  persists (nothing auto-picks; and no work anywhere advances until the
  pick); an OFFER lapses on the next plain turn.
- Resolution: code applies the band (§3), records pick + outcome events,
  clears the board, and hands the keeper an `[engine:<nonce>]` message
  (reveal + reason + "narrate diegetically, never name the mechanics, end
  with an open move") with triggerTurn — the /web hand-off pattern. Offer
  picks carry no bands: the choice simply becomes the seeker's word.
- Widget state derives from branch events, so /tree mid-choice rewinds the
  board correctly (A3).

## 6. Ledger events (Phase 1; extended through the playtest rounds)

| event          | payload                              | /ledger description    |
|----------------|--------------------------------------|------------------------|
| quest_shape    | slug, clock, twist, check, mids, selfSet | "the fates take measure…" (size public; twist/checkpoint positions not shown) |
| quest_tick     | slug, add, filled/size, note         | "the work advances…"   |
| fate           | slug, plan (hidden fields)           | veiled: "…(sealed)"    |
| fate_skipped   | slug                                 | "the fates hold their tongue…" |
| complication   | slug, text, options (visible fields) | "the task twists…"     |
| offer          | text, options (labels), place        | "choices laid before the seeker…" |
| offer_dropped  | —                                    | "the choices pass unchosen…" |
| offer_taken    | n (offer ordinal), option            | "a formerly offered course is taken up…" |
| pick           | slug ("" = offer), option id, extra? | "the seeker chooses…"  |
| check          | slug ("" = peril/venture), tier, dc, trial, kind (finale/hazard/checkpoint/peril/venture), edge?, flesh? | "a trial bars…" (stakes contract, public) |
| roll           | slug, dice[], kept, dc, band, grit   | "the die falls…" (every face public) |
| outcome        | slug, band, add, public text         | "the fates answer…"    |
| peril_fuse     | at (chat count), turns               | veiled: "the fates wind a hidden spring" (A4) |
| peril          | kind, tier, dc, text                 | "the world strikes…"   |
| wound          | add, reason                          | "the seeker is wounded…" |
| heal           | reason                               | "a wound is tended…"   |
| death          | reason                               | "☠ the seeker's tale ends…" |
| quest (shelved/revived) | title                       | "quest shelved… / quest revived…" |
| twist_dropped  | slug, reason                         | "the twist dissolves — overtaken by events…" (GM repair; the sealed plan opens) |

derive() folds these into `undertakings[slug]` (clock, twist/finale state,
mids/checkpoints, grit, cold streak, picked option) + the global
`pendingChoice` (twist|offer), `pendingRoll` (slug "" = peril), `wounds`,
`dead`, `fuse`, `untakenOffers`, and the `tally` (every counter /history
shows) from which `renown` computes score and level.

## 7. World laws file (Phase 1)

`config/worlds/<id>.laws.md` — hot-reloaded; optional (absent = empty).
Sections: Physics & nature deviations · Biology · Special mechanics (magic /
technology systems) · Hard limits (the impossible) · What goes wrong here
(the interruption palette) · Advice channels (who knows what, how reliably —
KoDP's fallible-advisor pattern). Feeds: keeper prompt (layer "1½ · the laws
of this world"), fate planner, GM table.

## 8. Prompt additions (Phase 1; extended through the audit round)

Keeper protocol: attempt_quest whenever the seeker works a task (narration
alone never advances it); voice engine-presented options in character, never
invent or pre-empt the pick; weave clue lines before the twist; Dungeon World
lines — be a fan of the seeker, make a move that follows, **never speak the
name of your move**; failure narration written as lovingly as success; the
task in one clear sentence, mystery in the story. Added in the audit round:
EFFORT IS THE PRICE (G12 — careless moves are hindered or hand the scene's
watchers the advantage); the four-slot cap and shelving flow; peril
narration + heal_wounds discipline; naming a grant's weight when the fiction
signals scale; the standing layer now carries renown, wounds, and any
unresolved gate (so the keeper steers back instead of narrating around it) —
and a dead seeker flips the prompt into the epilogue layer. Added in
playtest 4 (the apple stranding): NAMING THE WORLD IS THE KEEPER'S WORK —
the party is somewhere from the first scene; when the record is silent, the
keeper invents the place from the story's cues and set_places it, and NEVER
asks the seeker where they are; EVERY place and EVERY soul the story names
gets its page at once (what was said + invention true to the world; only the
nameless crowd goes unpaged); work agreed in story is granted in the same
reply; and ENGINE REFUSALS ARE COURSE CORRECTIONS — do the named thing in
the same reply, never repeat a failing call unchanged, never read an engine
error aloud (the party-stands-nowhere refusals themselves now carry that
guidance).

## 9. Dice (built — Phase 2)

- d20, tiers by clock size: easy DC 10 (clock 4) / middling 15 (6) / hard 20
  (8) — announced BEFORE the cast (the stakes contract). No numeric modifiers
  exist anywhere: the only adjustment is **edge**, a second visible die
  (favored keeps the best, hindered the worst), declared by the keeper with a
  recorded one-line reason. **Hindered beats mercy** (audit fix D7): a
  declared hindered edge outranks the karmic clamp — a reckless stroke rolls
  worst-of-two even mid-cold-streak; the fates relent only on the next
  honest trial.
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

## 9½. Open offers (built — playtest round 2.5; untaken courses, audit round)

`offer_choices(prompt, options[2..4])` — when a scene lays real alternatives
before the seeker (a task board, a fork, rival requests), the keeper hands
them to the engine: same four-slot board, same /pick (+ optional words), NO
hidden outcomes. An offer never binds: any turn that is not its own /pick
drops it (`offer_dropped` — it can never deadlock the one-gate rule).
Protocol: a prose list of courses is not a choice — enumerating tasks
requires the call. The GM table can lay one too (fix kind "choices") and can
arm a die on an open quest (fix kind "trial", weight easy/middling/hard).

**Stuck-quest repairs (playtest 4 — the apple stranding).** When the PLAYED
story outruns the engine record (a crash swallowed a presentation; work was
plainly done in play but never ticked), the GM table has hands to right it —
never to bypass live machinery:
- fix kind **"untwist"** {title, reason ≥10 chars} — dissolves a woven or
  presented twist the story overtook (`twist_dropped` event: the quest
  continues twist-free, its finale still stands, the sealed plan OPENS at
  the table like any resolved fate — A4). Refused when no twist stands.
- fix kind **"clock"** {title, filled, note} — sets the branch-derived clock
  to what the record shows (a repair `quest_tick` + mirror update). Refused
  on non-open quests, out-of-range values, or while a choice/die stands on
  that quest (chain untwist first). Filling it lets quest_status record the
  deed; the table is told to leave the last segment open when the completing
  stroke still deserves its trial.
The table's instructions demand *uN* evidence of the overtaking and forbid
using either to spare the seeker a live choice they merely dislike.

**Truths are not levers (same playtest).** The truth guardian refuses
commands dressed as facts ("set the quest as finished", "mark X done") —
form duty 1½: a truth states what IS or WAS; state-changes go through the
table's repairs, and the refusal says so.

**Reveals never deliver the goal (same playtest).** The fate planner's
fairness contract now forbids any reveal/promise from finishing the task or
handing over its object ("the apple reaches his hand") — outcomes move the
WORK; completion belongs to the clock and its final trial. A windfall grants
side-loot, never the quest's own object or reward.

**Untaken courses (G11 extension).** Every offer records the place it was
laid at. Courses not taken — the whole offer lapsed, or the siblings of a
picked one — land in the branch-derived `untakenOffers` list. They are
reachable ONLY through `/quest accept <n.m>` while standing at that place
(the engine then directs the keeper to grant it properly); no soul, board or
keeper telling may ever offer them anew. Accepting records `offer_taken` and
the course leaves the list.

## 10. Renown & difficulty (built — audit round, G13)

- `renown(tally)`: score = 3 × (quests rewarded + failed) + places visited +
  souls met — closures count whether won or LOST (losses teach; Kenshi).
  Level = 1 + floor(score/10), capped at 5.
- Level steers: the difficulty draw at grant (§1), peril severity and fuse
  length (§11). Renown, score and wounds are public — the standing layer,
  the footer (`lvl N · wounds n/3`), /ledger, /history and the GM table all
  show them.
- Tally counters (branch-derived, /history's achievements): quests
  granted/done/rewarded/failed/shelved/revived · places visited/chronicled ·
  souls met · items · picks · rolls · perils · truths bound.

## 11. Perils, wounds & death (built — audit round, G14)

- **The fuse**: a veiled `peril_fuse` event winds at session start and after
  every strike — `drawFuseTurns(level)`: base 8 (L1) down to 4 (L5), +0–4
  slack, counted in player messages. When it runs out (and no gate stands,
  and the story is past its 3-turn opening grace), the world strikes on the
  next turn boundary.
- **The strike**: code draws kind (8-entry peril list: a thief's quick hand ·
  a beast off its ground · sudden sickness · foul weather · a stranger
  spoiling for trouble · an old debt · a rival moving first · ground giving
  way) and severity (PERIL_SEVERITY_BY_LEVEL, easy→hard weights shifting
  with renown — even L1 has a 10% hard strike; the world owes no one
  safety). Events `peril` + `check` (slug "", kind "peril"); the keeper
  narrates the interruption THIS turn (standing layer carries it) and the
  seeker casts /roll. Perils bind no quest and hold all work like any gate.
- **Resolution** (same d20 bands): great → the seeker turns it to their
  favor · success → weathered · cost → escape with a visible price ·
  setback → **wound** (+1; +2 on a hard strike). No grit against the world;
  no clock moves. A new fuse winds after the die falls — burst, then
  guaranteed quiet (RimWorld).
- **Wounds**: a public 0–3 meter (footer, standing layer, /ledger,
  /history). `heal_wounds` (keeper tool) tends ONE wound when the fiction
  earns it — a healer's care, real rest, a remedy; refused at 0; protocol
  forbids cheap healing.
- **Death**: at 3 wounds the tale ENDS — a `death` event; the prompt flips
  to the epilogue layer (aftermath only), the engine refuses the tools of
  the living (grant/attempt/update/redeem/shelve/offer/heal), perils stop,
  the footer reads "☠ the tale has ended". Nothing undoes it; a new tale
  begins with /new. F5 still holds: death never comes from full health on
  one bare die — the wound meter is the visible escalation ladder.

## 12. The seeker's records (built — audit round): /quest, /place, /persons, /history

- **/quest** — the four-slot board as a WINDOW (2×2 grid, dice-ceremony
  dress: accent frame, bottom-center overlay; any key closes) showing open
  matters with clock, giver and pending flags; below it the shelved list and
  the untaken courses with their accept ids and places.
- **/quest accept <id>** — takes up a shelved quest (`<slug>`, at its
  granting place) or an untaken course (`<n.m>`, at the place it was laid);
  refused over the 4-cap and away from the anchor place. Revival flips
  `[shelved] → [open]` (event "revived") and the keeper is directed
  (nonce-marked) to weave the return; an untaken course records
  `offer_taken` and the keeper is directed to grant it properly.
- **shelve_quest** (keeper tool) — `[open] → [shelved]` at the seeker's
  word, usually to free the fifth-slot ask; refused mid-gate on that quest.
  Shelved quests leave the keeper's standing layer entirely.
- **/place [name]**, **/persons [name]** — every chronicled place/soul as a
  list (title + first recorded line, the party's spot marked), or one full
  page.
- **/history** — a deterministic timeline of the majors (arrivals, quest
  lifecycle, truths, perils, wounds, death — never ticks) + the achievements
  block (tally, renown, wounds). **/history long** — one side call
  (`gmChronicle`): the sitting retold as a short saga in 2–5 chapters,
  grounded STRICTLY in the record lines, *uN*-cited at pivots, nothing
  invented (falls back to the plain full timeline when the model is
  unreachable). Never a raw JSONL dump.

## 12½. The chronicler round (built — 2026-08-04, maintainer's rulings on AI batch 2)

**The record-on-mention sweep (WC-15's fix).** `before_agent_start` reads
the LAST keeper reply off the branch, extracts proper-name candidates
(`names.ts`, pure + unit-tested: capitalized runs, joiners allowed,
grammar/register stopwords, word-bounded known-set matching against page
titles + world names + quest titles), and hands the unpaged ones to the
keeper through a standing-layer line: judge each THIS reply — soul →
record_persona, place → chronicle_place, neither → speak on. No extra LLM
call, no latency; self-clearing (a founded page joins the known set); a
name ignored twice rests (NAME_OFFER_CAP — precision is the keeper's job,
recall is the sweep's). The protocol laws now also demand page-before-prose
in the same reply (the sound core of "create first, then narrate" — the
full pre-generation pipeline was analyzed and rejected: it cannot know what
prose will improvise; see undertakings-research.md). The GM table completes
the record on request too: "add X as a person" is a legitimate
persona_record/chronicle_place fix whenever X was named in play.

**The chronicler himself (G16).** The voice fronting the keeper (Bernd in
the dragon realm) is never a soul: `record_persona`/`move_persona`/table
persona-fixes bearing his name refuse with the canonized witness-not-
inhabitant text. His SPECIAL page lives at the chronicle root
(`chronicler.md`): after CHRONICLER_CRAFT_AFTER_CHATS (3) player messages a
fire-and-forget side call (`gmCraftChronicler`) shapes "how he shows
himself to this seeker" and "what the quill has noted" from the opening
exchanges (failure = silent retry next boundary; play never blocks); the
engine appends dated "Witnessed" lines per major event (quest, wound, heal,
death, truth, naming — code, no LLM). The keeper reads the page back every
turn (prompt layer 1¾) — the fail-safe: the being the player meets is the
being the record holds. `/persons` lists and shows him specially.

**Ventures (G17) — the seeker's own dice.** `stage_trial(trial, weight,
stakes, edge?, edge_reason?, flesh?)`: a keeper tool for risky deeds
OUTSIDE granted work (locks, theft, charm). Same d20 grammar: tier/DC from
weight (easy 10 / middling 15 / hard 20), stakes contract announced before
the cast (F3), edge only with a recorded reason, one gate holds all work
(G7). `check` event kind "venture", slug "" like perils; `/roll` resolves:
bands as ever; a SETBACK narrates the declared stakes landing and wounds
+1 ONLY when `flesh` was staged (F5 bounded — and refused framing keeps G8:
no dice where nothing is uncertain or nothing at cost). No grit (grit is
quest-bound), no karmic clamp, no fuse rewind (only the world's own strikes
rewind the spring).

**The table knows both worlds.** The GM table's context now carries the
full chronicle page index, a wider play/ledger window (40/60 lines), its
own durable past exchanges, and a record-model paragraph (uN semantics:
bookkeeping entries consume numbers — u1/u2 are typically model/thinking
changes; ledger.md mirrors game events only, across ALL branches). The
keeper still sees none of it. And the curtain opens on the GAME only: real-
world questions (the model behind it, technology foreign to the world's
theme) deflect in one dry line — theme-judged, so a world of machines may
speak of machines.

**Durable table talk + the reading records.** Every /gm exchange appends a
`world-console.gm` custom entry: rendered as a permanent transcript block
(question AND answer, one style), never sent to any LLM, surviving resume
and /tree, mined by the audit kit (session-map prints ⟡ table lines) and by
`/record` — which compiles the COMPLETE record (`record.md` beside
ledger.md: header, chronicler, quests, souls, places, items, and the full
uN-numbered timeline of both conversations, events, and labeled
bookkeeping; regenerated per call, the minimalist ledger.md stays the
append-only mirror). `/thoughts bernd` drives pi's persistent Hide-thinking
setting (label set in-register; applies live via pi's own /settings toggle,
persists across sittings and worlds in the extension's settings file);
`/thoughts gm` collapses past table blocks to one line each — except the
trailing uninterrupted run, which always stays open (any entry kind ends a
run; nothing hardcoded) — with pi's expand key as the per-block peek.

## 13. The long game (Phase 3 — spec'd, not built)

Shuffle-bags as ledger draw events (shape/suit/decision-shape decks,
draw-without-replacement, branch-aware); breadcrumbs (chains end in a named
pointer via chronicle_place; keep 2–3 live); hook bundles per place;
consequence-echo callbacks ("resurface later" flags); travel micro-events
(one per leg, never zero, never two); GM-table repair kinds for clocks and
plans; pacing fingerprints per chronicle; roll-first-allocate decision shape
(Citizen Sleeper: the die shown first, the seeker chooses where to spend it —
moved here from Phase 2 to join the decision-shape rotation).
