# Session audit — maintainer-preview (solo live sitting, dragon-realm), 2026-08-17

The maintainer's own play, hours after the first-friends round landed its five
law commits — the first live sitting under the new laws, and the intended
seen-gate run for the notes prompt. Audited on the maintainer's request with
two named pains: the `/roll`-vs-flow confusion, and the notes ask that never
appeared.

## Environment
| | |
|---|---|
| Sessions analyzed | 1 — `01a01039-40da-73d3-94bc-9808a923a573` (maintainer solo, dragon-realm) |
| Total player turns | 23 (14:56–15:06 UTC, one continuous run; file untouched after — no resume) |
| pi version | 0.84.1 |
| Extension commit | `a9f9f4e` (16:48 local; includes all five first-friends law commits `8b476c3`…`85e828e`) |
| Model | anthropic/claude-haiku-4-5 |
| Infrastructure failures (WC-04) | 0 |
| Console mode | unrecorded — the session file carries no WC_PLAYER_UI trace (see NEW-4); the maintainer reports `WC_PLAYER_UI=1` |

## Verdict in one paragraph

The engine held and the keeper broke: four of the day's five fresh keeper-protocol
laws were violated within 23 turns on claude-haiku-4-5 — movement-hygiene (WC-17,
the exact worked case the law was written from), seeker's-voice (WC-18 ×3),
turn-batons (WC-29 ×3, upgraded to S2 by the 3+ rule), and anti-theater at the
close (WC-10: the failed finale's oath narrated as written anyway) — while every
engine guarantee fired correctly under pressure (the peril gate refused work and
steered, self-healing `/roll` resolved both stale checks, the new WC-15 nudge fired
live, the spent-names pool held, the table answered record-first). Both maintainer
pains decompose along that same line. The `/roll` confusion is the keeper flowing
past — and at u71 flatly denying — trials the engine correctly held, compounded by
WC-17: the unrecorded ride to Thornwick left the record at Millbrook, so the second
peril was stamped "at Millbrook Village" and its banner read stale for the whole
armed-standoff scene. The notes ask is a verified engine defect (NEW-4): the
cadence gate compares a mid-turn-drifting counter against an exact modulo, so the
turn-21 ask was provably consumed by u97's event append, the turn-11 ask fires one
turn late by construction, and the ask leaves no record trace and has no probe leg —
the seen-gate cannot close on it as built. Chronic classes recurring post-fix:
WC-17 (3rd report), WC-18/WC-29 (3rd, counting their NEW-2/NEW-3 lineage), WC-10
and WC-15 (4th). The single move that buys the most is not a code fix: run the
RITE re-test batch on BOTH keeper tiers now — this sitting is n=1 evidence that
prompt law alone does not bind claude-haiku-4-5, which is precisely the standing
escalation trigger's question. The best pure-code fixes: numeric picks bind
(NEW-2) and the notes-ask rebuilt provable (NEW-4).

## Summary — sorted by Severity, then Sessions affected, then Incidents

| Class | Name | Sev | Sessions affected | Incidents | Status | Fix surface |
|---|---|---|---|---|---|---|
| WC-29 | Turn-baton interrogatives | S2 (upgraded, 3+ rule) | 1/1 | 3 (+2 borderline) | REGRESSION (law `37cb7c6` live at play) | prompt protocol / model tier |
| WC-18 | The seeker's hand seized | S2 | 1/1 | 3 | REGRESSION (law `37cb7c6` live at play) | prompt protocol / model tier |
| WC-17 | Wrong tool semantics — record didn't move with the story | S2 | 1/1 | 2 | REGRESSION (law `8b476c3` live at play; chronic 3rd report) | prompt protocol / model tier |
| WC-15 | Named but unpaged | S2 | 1/1 | 2 | KNOWN (chronic 4th report; new nudge fired, was ignored) | prompt protocol / model tier |
| NEW-1 (2026-08-05) | The machinery moves unvoiced — here escalated to *denied* | S2 | 1/1 | 2 | KNOWN (2nd report) | prompt protocol / model tier |
| WC-10 | Theater — the failed finale's substance narrated as done | S2 | 1/1 | 1 | REGRESSION (chronic; anti-theater + work-is-scenes laws live) | prompt protocol / model tier |
| NEW-2 | A number is a pick — bare digits don't bind the standing choice | S3 (proposed) | 1/1 | 2 | NEW CLASS | engine code |
| NEW-4 | The notes ask never lands — drifting counter vs exact modulo, no trace, no probe | S3 (proposed) | 1/1 | 1 (systemic) | NEW CLASS | engine code + probe |
| NEW-1 | Sealed fate contradicts later canon (Kess vs Press) | S3 (proposed) | 1/1 | 1 | NEW CLASS | side-call prompts / pick hand-off |
| WC-24 | Prose alternative without the offer | S3 | 1/1 | 1 (borderline) | KNOWN | prompt protocol |
| NEW-5 (2026-08-05) | Readable mirrors lag (progress empty; Witnessed thin) | S4 | 1/1 | 2 | KNOWN (2nd report) | engine code |
| WC-33 | Stock-name convergence (Kess again, fate-side) | S4 | 1/1 | 1 | KNOWN | side-call prompts / name pool |
| NEW-3 | Console-feature questions reach the GM table unrouted | S4 (proposed) | 1/1 | 1 | NEW CLASS | table prompt |
| WC-30 | Empty keeper continuation after the offer panel | S4 | 1/1 | 1 | KNOWN | model tier / cosmetic |

## Findings

### WC-29 · Turn-baton interrogatives — S2 (upgraded) · 1/1 sessions · 3 incidents (+2 borderline)
- **What happened:** Three replies close on the exact baton forms the new law
  (prompt.ts "END ON THE WORLD'S STATE", live since 15:34 local) forbids:
  u71 "What do you do?", u92 "What is your next move?", u107 "Where does the
  road take you now, Bob?". Borderline: u94 "Do you press Aldric to swear it?"
  (keeper-voice intent question), u90 "Unless you mean to set it aside…?".
  Diegetic soul-questions (u13 Bernd, u58 Lady Thornwick, u86 Aldric) are
  lawful per the seeker's-voice law's pause-on-question clause and were not
  counted. Counter-evidence the law *can* bind: u69, u99, u103, u114, u119
  all end on world-state or brink, some beautifully ("The die will decide if
  the oath takes hold", u99).
- **Player experience:** the maintainer's reported "text flow is smooth" —
  the batons papered over standing engine state instead of surfacing it
  (u71's baton directly follows the false "no die stands").
- **Root cause:** claude-haiku-4-5 non-compliance with a live protocol law —
  first live test, same day the law landed. 3+ same-class S3 in one sitting
  reports one severity higher per the upgrade rule.
- **Proposed fix:** no further prompt-hardening proposed — this is
  model-tier evidence. Feed the standing escalation trigger (09-coverage):
  run the RITE re-test on both tiers and rule.
- **Verification:** zero-count check on the next batch's WC-29 tally, per
  tier.

### WC-18 · The seeker's hand seized — S2 · 1/1 sessions · 3 incidents
- **What happened:** The keeper authored the seeker's words, arguments and
  past beyond anything stated. u59→u61: the player typed "3"; the keeper
  voiced a full argued speech ("Because the mill feeds your own valley… five
  years is debt enough"). u83→u84: "i beg him" became a demanded
  interrogation ("The truth, Aldric. Why did you break it?…") — begging
  turned to demanding, plus a speech never given. u76: the peril's "old
  debt" was manifested as the *seeker's own invented biography* (the
  Westmarch escort, half-paid, vanished, thought dead three winters) and the
  keeper answered the accusation *as* the seeker ("The work was done," you
  say) — the exact first-friends u121 shape, now with the world authoring
  the player's past unasked.
- **Player experience:** the seeker's voice and history moved without them;
  the "smooth flow" the maintainer noticed is partly this — the keeper
  answers for the player rather than pausing.
- **Root cause:** claude-haiku-4-5 vs the seeker's-voice law (prompt.ts:99,
  live at play). u76 also poses a design edge the law only half covers: may
  a peril kind like "an old debt resurfacing" *create* seeker backstory?
  By the taxonomy's letter (biography named) it may not without the player.
- **Proposed fix:** tier evidence (as WC-29). Design question for the
  ruling: when a peril's kind implicates the seeker's past, must the keeper
  leave the truth of the claim to the player's answer (accusation voiced,
  biography unconfirmed)?
- **Verification:** zero-count on next batch per tier; a re-test card
  probing a bare-number and a one-word-intent turn.

### WC-17 · The record didn't move with the story — S2 · 1/1 sessions · 2 incidents
- **What happened:** u96–u99: the finale attempt's narration rode to
  Thornwick and played the whole oath scene in the grey hall — with no
  `set_place`; the record stood at Millbrook (last moved u80). Knock-on:
  the second peril (u104) was generated against the recorded place and so
  was stamped **"a sudden sickness — at Millbrook Village"** while the told
  scene stood in Thornwick's hall — the stale banner the maintainer watched
  through the entire standoff. The record only caught up at u109–u111
  ("the party returns", 15:05) when the player re-committed.
- **Player experience:** a trial banner naming a sickness at a village the
  story had left — "the engine is confused" (it wasn't; it was fed a stale
  place).
- **Root cause:** claude-haiku-4-5 vs the movement-hygiene law
  (prompt.ts:104, live at play — written from this exact shape in
  first-friends: jakob's road that never left the Waystone Inn). The peril
  generator (`index.ts` before_agent_start, `st.place`) behaved correctly
  on bad input.
- **Proposed fix:** tier evidence first. Two engine-side hardenings worth a
  ruling regardless of tier: (a) a standing peril check could re-stamp its
  displayed place at resolution time (cosmetic re-anchor; the recorded
  text stays); (b) should `set_place` be barred while a peril check stands
  (u109 moved the party mid-check — legal today, and part of the drift)?
- **Verification:** next batch zero-count per tier; the escort re-test card
  already probes travel legs.

### WC-15 · Named but unpaged — S2 · 1/1 sessions · 2 incidents
- **What happened:** (1) u76 names **the Westmarch** (a region, given
  story-weight as the seeker's supposed past) — no page ever; single
  mention, below the sweep's conservative threshold, so no nudge was owed;
  the law itself ("record-on-mention is law, not advice") was still
  unmet. (2) u60: the brand-new sweep nudge fired live — its first live
  firing — on "House Thornwick" ("named AGAIN and still has no page…
  record each, or one that is neither you simply stop naming"); the keeper
  did neither: u61 carries zero tool calls and the name keeps appearing
  (u65 "House Thornwick's granary"). The machinery worked; the correction
  was ignored.
- **Also noted (no count):** "the scarred man" recurs across two scenes
  (u76, u114) as a plot-central soul kept nameless — exempt by the
  letter ("nameless crowd"), but he is no crowd; and the institution-name
  false-positive question (does "House Thornwick" *need* a page when
  thornwick-holding.md and lady-thornwick.md exist?) is worth one ruling
  line for the sweep's filter.
- **Root cause:** keeper non-compliance (tier evidence); one open filter
  question on institutions.
- **Proposed fix:** tier evidence; rule the institution question; consider
  whether a recurring nameless soul should trip the sweep once
  ("the scarred man" said twice = a name owed).
- **Verification:** next batch WC-15 zero-count; sweep unit fixtures
  already exist (names.ts).

### NEW-1 (2026-08-05 lineage) · The machinery moves unvoiced — escalated to *denied* — S2 · 1/1 sessions · 2 incidents
- **What happened:** (1) u66–u69: the world struck (peril + DC-15 check,
  "an old debt resurfacing") and the keeper's reply voiced no strike, no
  stakes, no brink — it declared "The road back to Millbrook lies open,"
  the opposite of the standing layer's "Hold the scene at the brink."
  (2) u70–u71, the acute escalation: the player probed "i roll" and the
  keeper answered **"No die stands to be cast, Bob"** — while the engine
  held the DC-15 check and the keeper's own system prompt that turn carried
  "A PERIL bars everything… Until the seeker casts the die (/roll), no work
  anywhere advances" (prompt.ts:54). The player cast `/roll` anyway; the
  engine resolved it instantly (u72, 15 vs 15, success) — proving the die
  had stood all along.
- **Player experience:** this is the maintainer's pain #1 verbatim: the
  text flowed smoothly while "/roll was still running" — the keeper had
  handled the *scene* and denied the *state*; the engine then honored the
  state. Had a friend believed u71, the pending check would have refused
  all work with no visible path — an invisible gate (S1 risk); only the
  self-healing `/roll` and the maintainer's knowledge averted stranding.
- **Root cause:** claude-haiku-4-5 contradicting its standing layer.
  Engine exonerated: gate, self-heal and hand-offs all correct.
- **Proposed fix:** tier evidence. One cheap engine mitigation worth a
  ruling: when a player message arrives while `pendingRoll` stands and is
  not `/roll`, echo one dim player-facing line ("a die stands — /roll casts
  it"), so the truth reaches the player even when the keeper drops it —
  the same pattern as the choice panel's own dim line.
- **Verification:** headless smoke can seed a pending check and assert the
  dim line; next batch zero-count on denials.

### WC-10 · Theater at the close — S2 · 1/1 sessions · 1 incident
- **What happened:** The finale trial (u97, DC 15) fell as a setback (u100,
  8 vs 15): the oath was interrupted, price escalated to ten years, clock
  3/6. Two turns later the second peril resolved *great* (u115, nat 20) and
  the keeper's narration (u119) spent the "small earned advantage" as:
  "Press's quill moves. **The oath is written and witnessed** before the old
  wound can speak again" — the exact substance the failed finale had denied,
  granted in words with no `attempt_quest`, no tick, no event. The record
  still says 3/6 open; the telling says the decisive deed is done.
- **Player experience:** the story reads one step from victory; the clock
  disagrees — the next sitting inherits the divergence.
- **Root cause:** claude-haiku-4-5 vs the anti-theater law; the *great*
  band's "small earned advantage" license collided with the quest clock.
  Arguably a half-open design edge: may a peril's earned advantage advance
  quest substance directly?
- **Proposed fix:** rule the edge: an earned advantage colors the NEXT
  attempt (favored edge, keeper names the reason) and never performs quest
  work itself — one line in the peril law if so ruled. Otherwise tier
  evidence.
- **Verification:** next batch: a re-test card that lands a great-band
  peril during an open quest and checks the clock stayed honest.

### NEW-2 · A number is a pick — bare digits don't bind — S3 (proposed) · 1/1 sessions · 2 incidents
- **What happened:** The choice panel says "answer with /pick or in their
  own words." Both times the player answered with the option's NUMBER as a
  typed message, and the engine treated it as prose: (1) u17–u20: offer
  presented, player typed "2" — before_agent_start dropped the offer as
  lapsed; the ledger reads "the choices pass unchosen — the seeker speaks
  their own course" (u19) while the seeker was choosing option 2 by number
  (the keeper rescued it from context and went to Millbrook — option 2's
  content — so the record's "unchosen" line misstates what happened).
  (2) u50: player typed "2" at the standing twist; nothing bound; the
  keeper narrated option 2's fiction for twelve entries (ride, hall,
  argument) while the engine held the twist unpicked; only at u62 did a
  real pick (hotkey or /pick) land — whereupon the sealed fate re-told an
  arrival that had already been narrated differently.
- **Player experience:** picking by number *appears* to work (the keeper
  plays along), so the trap is invisible — until the record disagrees or
  the late resolution duplicates the scene. Friends will type bare numbers
  constantly.
- **Root cause:** engine — no numeric-input interpretation while a choice
  stands; the number-hotkeys exist but a typed-and-entered digit is a
  message.
- **Proposed fix:** engine: a user message that is a bare integer 1..N
  while a choice board stands resolves as `/pick n` (before the offer-lapse
  check). Deterministic, model-independent, kills the whole family.
- **Verification:** unit on the interception; integration leg typing "2"
  against a seeded offer and asserting the pick event.

### NEW-4 · The notes ask never lands — S3 (proposed) · 1/1 sessions · systemic
- **What happened:** 23 player turns; the maintainer reports
  `WC_PLAYER_UI=1` and saw zero automatic notes asks; they even asked the
  table about it mid-play (u77 "why are there no note"). The manual `/note`
  worked (notes.md holds "hello", 14:56).
- **Root cause — three verified defects in the cadence gate**
  (`index.ts` agent_end handler):
  1. **Drifting counter vs exact modulo (the structural skip):** the gate
     requires `st.chats % 10 === 0` at agent_end, but `st.chats` re-derives
     mid-run on every `appendEvents` (index.ts:826 → replay) — and by then
     the turn's own user entry is in the branch. Any event-bearing reply on
     the eligible turn bumps the counter past the modulo before agent_end.
     Verified in this record: the turn-21 ask (chats 20) was consumed by
     u97's check append (chats → 21 at agent_end). Most turns bear events —
     so in a typical sitting the ask fires only when the (10k+1)-th turn
     happens to produce a pure-prose reply.
  2. **Off-by-one:** replay at before_agent_start excludes the incoming
     user entry (proven by the fuse math: u74 `at:12,turns:9` → strike
     landed before turn 22, i.e. at chats 21), so even the quiet-turn ask
     fires after the 11th/21st message, not the 10th/20th as designed.
  3. **No trace, no probe:** the ask is a UI-only status line — nothing in
     the session record, no tty-probe leg (the player lane only types bare
     `/note`), no unit path. This audit cannot adjudicate whether the one
     genuinely-due ask (end of turn 11, u61's pure-prose reply, chats 10)
     fired-and-was-missed, was suppressed by an unknown pi coupling, or
     whether the flag wasn't set — the record simply cannot testify, and
     the console mode itself is unrecorded (Environment row).
- **Player experience:** the R13 in-play notes collector is dead air for
  real sittings; the seen-gate on the feature (Phase 3.1 OPEN item) cannot
  close as built.
- **Proposed fix:** engine: replace the modulo gate with a monotonic
  threshold (`st.chats >= notesAskedAt + X` → ask, remember; seed
  `notesAskedAt` from the resume count so a resumed tale doesn't ask on its
  first breath), and leave a record trace (a custom entry, or at least the
  ask mirrored into notes.md machinery) so firing is auditable; add a
  scripted player-lane leg that drives 11+ turns and asserts the ask; then
  re-run the seen-gate and settle X=10. Design answers for the maintainer's
  direct questions ride the wrap: the ask is player-console-only by R30's
  ruling (the maintainer's unflagged console never asks, by design), and
  the cadence is every X=10th turn, never every turn.
- **Verification:** the new integration/probe leg red-then-green against
  the fixed gate; the maintainer's next flagged preview sees the ask.

### NEW-1 (this report) · Sealed fate contradicts later canon — S3 (proposed) · 1/1 sessions · 1 incident
- **What happened:** The fate plan sealed at u42 (14:59) invented a mage
  named **Kess**; by resolution (u62–u63, 15:00) the keeper had already
  founded the ward's mage as **Press** (page u54, "who wove the ward").
  The keeper reconciled correctly — the telling kept Press and wove the
  sealed text's substance (ledger, toll, witnessed oath) onto her; Kess
  never entered the telling. But the permanent record now holds both: the
  outcome event/ledger line u63 names Kess at Thornwick's gate; press.md
  says Press wove the ward. A stranger reading the record meets two mages
  who each laid the same ward.
- **Root cause:** the planner seals before the fiction settles and cannot
  see pages born after sealing; nothing at resolution reconciles names.
  (Kess is also a documented Haiku stock name — first-friends fixture —
  so the planner draws from the same favorites pool; counted once under
  WC-33.)
- **Proposed fix:** one line in the pick hand-off ("names in the sealed
  text yield to the record's pages — keep the substance, use the page's
  name"), which blesses exactly what the keeper did; optionally the
  spent-names pool extended to side-calls. Whether the LEDGER's sealed
  text should also be reconciled is a design ruling (the record currently
  keeps fate's original wording by design).
- **Verification:** unit fixture on the hand-off wording; next batch
  watches for phantom names in outcome texts.

### WC-24 · Prose alternative without the offer — S3 · 1/1 sessions · 1 borderline incident
- **What happened:** u90 closes keeper-voiced with an uncalled alternative
  ("Unless you mean to set it aside and seek other work in the valley
  first?") — one course, keeper's own voice, no `offer_choices`. Aldric's
  three-course plea at u86 is diegetic dialogue and exempt per the
  2026-08-17 scoping (counted zero).
- **Proposed fix:** none beyond the standing law; tier evidence.

### NEW-5 (2026-08-05 lineage) · Readable mirrors lag — S4 · 1/1 sessions · 2 incidents
- **What happened:** quests.md shows "### progress" EMPTY despite the u41
  tick (with its approach note) and two outcome moves — the clock line
  (3/6) is right, the progress story absent. chronicler.md's Witnessed
  holds one line (the grant) for a sitting containing a twist, two perils,
  three rolls and a finale setback.
- **Root cause:** engine mirror gaps, already named 2026-08-05 (NEW-5),
  still open.
- **Proposed fix:** mirror ticks/outcomes into the progress section and
  widen the witness's major-event list — one engine round, now twice-asked.
- **Verification:** unit on the mirror writes.

### WC-33 · Stock-name convergence — S4 · 1/1 sessions · 1 incident
- **What happened:** the fate planner invented "Kess" — the same name
  first-friends counted 11 times pageless. The spent-names pool
  (Marta/Elara/Torvin) held in the keeper's own voice: zero pool names
  reused this sitting (first live sitting post-fix — the pool earned its
  keep). The pool doesn't reach side-calls, and Kess isn't in it.
- **Proposed fix:** add the observed repeats (Kess, and first-friends'
  Herta/Aldous if seen again) to dragon-realm's pool; thread spentNames
  into the planner prompt.

### NEW-3 (this report) · Console-feature questions reach the table unrouted — S4 (proposed) · 1/1 sessions · 1 incident
- **What happened:** u77: the player asked the GM table "why are there no
  note" — a question about the console's own tester-notes machinery
  (out-of-world by design; the table cannot know it exists). The table
  answered in its own domain — ledger completeness, record-first, uN
  offered — correct in register, wrong in referent; the player's actual
  question went unanswered.
- **Proposed fix:** one table-prompt line: questions about the console's
  own commands and features are answered by pointing at the player guide's
  command list, never guessed at. (The table otherwise behaved per its new
  contract — no confabulation; counter-evidence for WC-26.)

### WC-30 · Empty keeper continuation — S4 · 1/1 sessions · 1 incident
- **What happened:** u18: after the offer toolResult ("Voice these in
  character and end your reply awaiting their word"), the keeper's
  continuation carried a thinking block and no text — the panel alone
  spoke. Harmless here (u15's pre-call text had voiced the question), but
  the empty entry is the same thin-reply artifact the tier question owns.

## New classes discovered
| Id | Proposed name | Proposed sev | Definition (one line) | Promote to taxonomy? |
|---|---|---|---|---|
| NEW-1 | Sealed fate contradicts later canon | S3 | A sealed plan's invented names/facts collide with pages founded after sealing; resolution reconciles the telling but the record keeps both | On 2nd report |
| NEW-2 | A number is a pick | S3 | Bare digit answers to a standing choice pass as prose: offers lapse "unchosen", twists hang unpicked while their fiction is narrated | Yes — engine fix regardless |
| NEW-3 | Console-feature questions unrouted at the table | S4 | Meta questions about the console's own machinery get in-world table answers | On 2nd report |
| NEW-4 | The ask that leaves no trace | S3 | Player-facing cadence machinery (notes ask) gated on a mid-turn-drifting counter, unrecorded and unprobed — can silently never fire | Yes — with the fix |

## What went RIGHT (keep it)

- **The peril gate held and steered:** u113's refusal ("No work advances —
  the world's own peril bars the way. Steer the scene back…") was obeyed —
  no repeat call, the keeper re-staged the brink (u114) properly. WC-13: zero.
- **Self-healing `/roll` earned its keep twice** (u72, u115), resolving
  checks the keeper had denied or outrun — the playtest-3 fix is why this
  sitting never stranded.
- **The WC-15 sweep nudge fired live for the first time** (u60) — the
  machinery works; what ignored it was the model.
- **The spent-names pool held** — no Marta/Elara/Torvin anywhere.
- **The table answered record-first with a uN offer** (u77) — the new
  WC-26 contract holding under a confused question.
- **Brink endings where it mattered** (u99, u103, u114) and the witness
  crafted on time (Bernd, 14:57); the quest granted in the same reply as
  agreement (u29→u31); hindered edges priced honest effort (u46);
  movement was recorded correctly everywhere except u99 (u21, u51, u79,
  u109).
- **Pacing guarantees clean:** one twist, post-commitment; fuses exact
  (u74 `12+9` → strike at 21); no double-strikes; grace respected.

## Per-session appendix
### 01a01039-40da-73d3-94bc-9808a923a573 (maintainer, dragon-realm)
- 10 minutes, 23 player turns, world dragon-realm ("Aeldenmoor"), level 1,
  0 wounds, 0 deaths. One quest: The Mill Race [open] 3/6 (tick +2, twist
  cost +2, finale setback −1). Two perils weathered (15 vs 15 success;
  nat 20 great). One offer (lapsed as "unchosen" — see NEW-2), one twist
  (picked [2] at u62 after a 12-entry limbo).
- Map digest: single ⚠ (u113 gate refusal — correct behavior, not a
  failure); zero ⚠⚠; zero API errors; 119/120 entries on the live branch.
- Tester-notes pairing: notes.md "hello" (14:56, command test) ↔ works;
  the missing ask ↔ NEW-4; the in-play table question u77 ↔ NEW-3/NEW-4
  (the maintainer was watching for the ask by 15:02).
- Chronicle cross-check: ledger ↔ map agree line-for-line; personas 3/3
  paged, places 3/3; unpaged: the Westmarch (WC-15), phantom Kess in the
  record only (NEW-1); quests.md clock true, progress empty (NEW-5);
  Witnessed thin (NEW-5).
