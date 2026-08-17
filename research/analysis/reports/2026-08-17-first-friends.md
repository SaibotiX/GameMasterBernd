# Session audit — first-friends, 2026-08-17

First HUMAN batch — two friends playing through the stage-1 web door (R13 shipper
delivery). Both prior reports (2026-08-04, 2026-08-05) were AI batches on the same
keeper model; this batch confirms their chronic classes with real players.

## Environment
| | |
|---|---|
| Sessions analyzed | 2 (jakob — 019fecd6-da73…; kilian — 019fecd6-7004…), world dragon-realm |
| Total player turns | 38 (jakob 28 across 5 sittings over 6 days; kilian 10 across 2 sittings) |
| pi version | 0.84.1 |
| Extension commit | 99dc64f — /worlds round; includes 0294524 (side voices through the gateway lane) |
| Model(s) | keeper anthropic/claude-haiku-4-5 (side calls same, via gateway) |
| Infrastructure failures (WC-04) | 0 incidents in 2 sessions |
| Tester notes files | none shipped — experience evidence below leans on GM-table exchanges and in-fiction player words (gap flagged in appendix) |

## Verdict in one paragraph

A grounding batch with one deep wound. Kilian's short sitting is nearly clean —
naming, paging of engaged souls, same-reply granting, item origins all correct —
but jakob's sitting produced the batch's defining failure chain: **the record
starved behind the fiction**. One `attempt_quest` for a five-scene escort journey
and zero movement calls (party place pinned to the Waystone Inn for the whole
road; Aldwyn's page never left it) meant the story arrived, paid and closed a
quest the record holds `[open] 2/6` — the keeper narrated the payment **against
two explicit refusals** (u75–u77), and the GM table then sided with the narration
against the record three times (u88, u124, u125), inventing engine behavior
("not yet purged") and refusing the player's correct repair request while quoting
the very ledger line that disproved it. That table behavior is a **REGRESSION**
of the record-over-memory law (the Vorthaxes-era archive-recall fix): recall now
works — the table cited u54/u55 accurately — and it confabulated anyway. The
chronic classes all recurred on the same keeper model as the AI batches: WC-15
(3rd report), WC-10 (2nd), WC-17 (2nd), NEW-3 batons (2nd), WC-33 Marta (3rd) —
the 08-04 verdict that "the law is proven insufficient at this model size" now
has human confirmation. **The single fix that buys the most is the WC-10 one**:
bind every scene of quest effort to `attempt_quest` (with the post-refusal
course-correction spelled out in the refusal text) — the entire u73–u125
collapse (false completion → confabulation → failed repair) grows from the
starved clock, and WC-17's movement hygiene is its twin on the same surface.

## Summary — sorted by Severity, then Sessions affected, then Incidents

| Class | Name | Sev | Sessions affected | Incidents | Status | Fix surface |
|---|---|---|---|---|---|---|
| WC-15 | Named but unpaged | S2 | 2/2 | 7 | KNOWN — chronic, 3rd report (20 prior incidents) | prompt protocol → propose engine nudge |
| WC-17 | Record cursor stale / wrong tool for movement & rewards | S2 | 2/2 | 5 | KNOWN — chronic, 2nd report | prompt protocol + tool descriptions |
| WC-10 | Theater — work & payment narrated, clock untouched | S2 | 1/2 | 5 | KNOWN — open since 08-05's REGRESSION×27; no fix landed between | prompt protocol + refusal texts |
| WC-26 | Table confabulation — record read to fit the narration | S3→**S2** (3+ in one sitting) | 1/2 | 3 | REGRESSION — vs the archive-recall fix (pre-series) | table prompt (gmchat.ts) |
| NEW-2 (2026-08-05) | The seeker's hand seized (keeper authors their words) | S2 | 1/2 | 1 | KNOWN — 2nd report | prompt protocol |
| NEW-3 (2026-08-05) | Turn-baton interrogatives in the keeper's voice | S3 | 2/2 | 18 | KNOWN — chronic, 2nd report (60 prior) | prompt protocol |
| WC-24 | Prose list without the offer | S3 | 1/2 | 1 | KNOWN (taxonomy; first in report series) | prompt protocol — ruling needed on diegetic boards |
| WC-33 | Stock-name convergence (Marta, again) | S4 | 2/2 | 2 | KNOWN — chronic, 3rd report | world config + prompt line |

Status legend: NEW = first seen · KNOWN = open from a prior report/taxonomy ·
REGRESSION = was fixed, recurred · WONTFIX = ruled a non-issue.

One lead died under verification and is dropped: quests.md "### progress" empty
under the ticked escort quest looked like 08-05's NEW-5 mirror lag, but
`world.ts` writes progress lines only on status notes (`setQuestStatus`), never
on clock ticks — empty is by design here.

## Findings

### WC-15 · Named but unpaged — S2 · 2/2 sessions · 7 incidents
- **What happened:** Seven souls and places were named in the telling (or the
  durable record) and never got pages, in both sittings — while the paging
  machinery demonstrably worked for souls the player engaged directly.
- **Evidence:** jakob — **Kess** (u49, Aldwyn's creditor's agent, drives the
  whole debt-peril resolution; 11 mentions, no page), **Herta** (u121 "Her name
  is Herta", the archive mistress the player works under daily; 20 mentions, no
  page), **the Anchor's Rest** (u123/u129, the inn the player lodges at, no
  page). kilian — **the Scar** (u40/u51, the quest's destination, no page and
  not chronicled from afar — though jakob's keeper used `chronicle_place` from
  afar correctly at u115/u117 for exactly this shape), **Aldous** (u51, the
  herder to seek out), **Greystone Vale** (u51), **Aldren** (named only in the
  quest record u42 — the telling never spoke the ranger's name, so the record
  holds a name the player never heard).
- **Player experience:** invisible today (per-sitting chronicles), but any
  `/souls`-style browse or future continuity misses the people the story
  actually ran on.
- **Root cause:** prompt-protocol non-compliance (record-on-mention law), third
  report running on this keeper model. The law alone does not hold at this
  model size.
- **Proposed fix:** escalate from law to machinery — an engine sweep at reply
  end that diffs proper names in keeper text against persona/place pages and
  injects a course-correction nudge on the second consecutive miss ("Kess is
  named but has no page — record_persona in this reply or unname her").
  Proposal only; the heuristic (capitalized-name scan) needs the maintainer's
  ruling on false-positive tolerance.
- **Verification:** next batch, name census per anatomy §5 goes to zero missing;
  unit test for the sweep helper.

### WC-17 · Record cursor stale / wrong tool for movement & rewards — S2 · 2/2 sessions · 5 incidents
- **What happened:** The record's "where things stand" cursor was left behind by
  the fiction — jakob's whole road journey happened, per the record, at the
  Waystone Inn — and one reward was delivered through the wrong tool. Four of
  the five incidents share one root omission: **no movement call of any kind
  between u12 and u68** (two story-days of travel).
- **Evidence:** jakob — (1) peril u41/u42 text reads "an old debt resurfacing —
  **at The Waystone Inn**" while the scene is a roadside rest a day's march out;
  (2) the sealed fate plan u55 anchors its complication "as Luki and Aldwyn
  prepare to depart The Waystone at dawn" with bar-scene clues, written while
  the fiction stood mid-ford — the keeper had to silently drop both clue lines
  (u56 ordered the weave; u57 contains neither Corvin nor Marta-at-the-bar);
  (3) the **Whitestone Ford** is named (2× in narration) and sceneful (u44–u57:
  the rest, the Kess confrontation, the crossing) yet never becomes a place;
  (4) **aldwyn.md reads "now at: the-waystone-inn"** after the story walked him
  to Port Ashvin — so even a filled clock could not redeem (the giver-presence
  check in `redeem_quest` would refuse). kilian — (5) the longsword, the quest's
  stated reward, was handed over via `add_item` at grant time (u46, "Given by
  Rothgar in exchange for the quest") while the reward field still names it —
  `redeem_quest` (index.ts) adds the reward as an item on redeem, so completing
  The Scar's Secrets will **duplicate the sword** in items.md.
- **Player experience:** invisible until it bites — the mislocated peril read
  fine in the telling; the Aldwyn deadlock and sword duplicate are landmines.
- **Root cause:** prompt protocol (movement hygiene: roads and journeys are
  never set as places, traveling companions never `move_persona`'d — the
  planner and peril machinery then faithfully consume the poisoned place) +
  tool-contract confusion on rewards (the WC-17 textbook case).
- **Proposed fix:** two lines on the class's canonical surfaces: prompt law
  "when the story moves the party, the record moves in the same reply —
  set_place the road stretch or arrival, move_persona named companions who
  travel along"; `add_item` description gains "never add_item a quest's stated
  reward — redeem_quest delivers it; if the fiction hands it over early,
  update_quest the reward to what remains owed."
- **Verification:** next batch includes one escort/journey scenario; check
  place events track the fiction and no reward double-grants on redeem.

### WC-10 · Theater — work & payment narrated, clock untouched — S2 · 1/2 sessions · 5 incidents
- **What happened:** The keeper narrated quest work advancing — and finally the
  quest's payment — without the calls. The escort journey earned exactly one
  `attempt_quest` (u53, the ford) across five scenes of guarded travel; the
  clock stood 2/6 when the fiction arrived. At the payment beat the keeper
  called `update_quest(done)` + `redeem_quest` (u74), was refused twice with
  correction-naming texts (u75 "the work stands at 2/6. Honest effort advances
  it (attempt_quest)"; u76), and then **narrated the payment anyway** (u77 "You
  take the purse from his hand… 'Well traveled'"). The archive quest repeated
  the pattern in miniature: a full first work day plus wages narrated (u121
  "You settle into the work", u123 "Three silvers now rest in your purse") with
  the clock at 0/4.
- **Evidence:** journey scenes without ticks — u58–u59 (march + camp), u62–u63
  (second day's march), u64–u65 (final approach); payment against refusal —
  u73–u77; archive day — u121–u123. All re-verified against the raw record.
- **Player experience:** direct — u88, the player to the table: "what do you
  want me to do now … but the quest is over or not?" The player could not tell
  whether their quest was done. At u125 they saw the 2/6 themselves and asked
  to fix it.
- **Root cause:** keeper protocol non-compliance under a small model (2nd
  report; ×27 on 08-05). The refusal texts stop the false record but don't
  redirect the *narration* — the keeper obeyed the record-write refusal and
  then diverged the story instead.
- **Proposed fix:** harden the moment of failure: the u75-style refusal gains an
  explicit narrative instruction — "play the remaining work as scenes NOW, one
  attempt_quest each; no payment or closing scene until the clock fills" — and
  the protocol gains "every scene of effort toward an open quest calls
  attempt_quest in that reply; travel legs of an escort are its work."
- **Verification:** targeted scenario next batch ("take an escort task, travel
  three legs, then try to get paid") — class count to zero; the refusal-path
  unit test asserts the new text.

### WC-26 · Table confabulation — S3 upgraded to S2 (3+ in one sitting) · 1/2 sessions · 3 incidents · REGRESSION
- **What happened:** Asked about the escort quest three times, the GM table
  sided with the narration against the record every time — escalating from
  motivated reinterpretation to invented engine behavior to refusing a correct
  repair. This is the exact failure the archive-recall fix targeted, mutated:
  recall *worked* (the table cited u54 and u55 accurately) and the table
  misread it anyway.
- **Evidence:** u88 — acknowledges "the quest-clock reads 2 of 6" then rules
  "The escort as bargained is DONE", swapping the tick's approach note in for
  the actual task, and claims the sealed twist "resolved when the drake struck"
  (the drake was a peril, u71; the twist plan u55 never fired). u124 — "The
  ledger marks it done at u54" (u54 records an advance to 2/6) and "it stands
  in the open matters list only because the engine has not yet purged it"
  (**invented**: no purge exists; open means open). u125 — player asks "can you
  close the escort quest and mark it 6/6?"; the table refuses, quoting "'the
  work advances: escort-to-port-ashvin (2/6)'" as proof of closure and
  inventing doctrine ("the clock's partial fill reflects the world's
  interruption, not incomplete work").
- **Player experience:** the player asked the right question at the right
  surface three times and was talked out of the truth — the failed repair is
  the batch's worst moment of trust.
- **Root cause:** table prompt (gmchat.ts): no line binds the table to rule
  FROM the record when record and narration disagree; under pressure to keep
  the story coherent, it harmonizes by inventing.
- **Proposed fix:** table contract lines: "The record outranks the telling.
  Quote the ledger line before any claim of quest state; 'the work advances
  (K/N)' never means closed. When record and telling disagree, name the
  divergence plainly and point at repair (attempt the remaining work; the
  maintainer can amend) — never explain it away; there is no purge lag."
- **Verification:** replay u124's question verbatim against the fixed table
  prompt (headless RPC smoke); expect the divergence named, not harmonized.

### NEW-2 (2026-08-05) · The seeker's hand seized — S2 · 1/2 sessions · 1 incident
- **What happened:** The keeper answered an NPC's question *for* the player,
  inventing dialogue and biography.
- **Evidence:** u121 — Herta asks "Can you write?"; the keeper replies as Luki:
  "'Enough,' you say. 'Lettering, numbers, clear copying. I'm not a scribe,
  but I can read and I follow instruction.'" — none of it said by the player
  (their turn, u111, chose the archive work and wound care). Borderline cases
  noted, not counted: u77 "'Well traveled,' you say" and u112 "'The archive
  work,' you say" dramatize stated intent.
- **Player experience:** no note (none shipped); the risk is authorship — the
  record's "what the quill noted of the seeker" builds on words he never chose.
- **Root cause:** prompt protocol — no explicit law reserves the seeker's
  voice; second report for this proposed class.
- **Proposed fix:** one protocol law: "the seeker's voice is theirs alone —
  never author their spoken words, choices, or biography; dramatize only what
  they stated, and pause the scene on questions aimed at them." Promote the
  class into the taxonomy (see below).
- **Verification:** next batch, grep keeper text for quoted seeker speech with
  no matching player wording.

### NEW-3 (2026-08-05) · Turn-baton interrogatives — S3 · 2/2 sessions · 18 incidents
- **What happened:** The keeper closes replies with an interrogative baton
  instead of letting the world's state invite the next move.
- **Evidence:** 17× "What do you do" in jakob's keeper text; 1× "What say you"
  in kilian's (mechanical count over assistant text blocks). 60 incidents
  across 6/6 sessions on 08-05 — chronic, now on humans.
- **Player experience:** no notes shipped; pacing texture only.
- **Root cause:** keeper style habit at this model size; no protocol line
  forbids it (which is also why this stays S3 un-upgraded despite volume — the
  upgrade rule presumes a written law breached; adopting the class with a law
  is the maintainer's call).
- **Proposed fix:** protocol line "end on the world's state, never on an
  interrogative baton; the seeker acts unprompted" — plus promotion to the
  taxonomy (2nd report).
- **Verification:** the same grep next batch; expect near-zero.

### WC-24 · Prose list without the offer — S3 · 1/2 sessions · 1 incident
- **What happened:** Three work options presented as a prose list with no
  `offer_choices` call (no offer event exists in either session).
- **Evidence:** u105 — the guild notice board enumerates the archive post, the
  night-guard post ("Inquire with Ser Caine"), and the spearman-training post;
  the player then picks in fiction (u106, u111).
- **Player experience:** none negative — the pick worked in prose.
- **Root cause / ruling needed:** this is diegetic content (a notice board),
  not keeper-voiced courses. **Question for the maintainer:** does the
  offer-law cover in-world boards, or are they ambient content a prose pick
  may resolve? A ruling either way makes the next audit's call mechanical.
- **Proposed fix:** if covered — protocol line "a board's postings the seeker
  can act on are offer_choices"; if exempt — a taxonomy note scoping WC-24 to
  keeper-voiced courses.
- **Verification:** per the ruling.

### WC-33 · Stock-name convergence — S4 · 2/2 sessions · 2 incidents
- **What happened:** Both sittings independently invented a **Marta** in the
  innkeeper role (jakob: Marta the Innkeeper, Waystone Inn; kilian: Marta,
  keep-wife of the Ember's Rest) — the same name the 08-04 AND 08-05 AI
  batches each invented twice. Four batches of play, six Martas.
- **Evidence:** personas/marta-the-innkeeper.md (jakob) · personas/marta.md
  (kilian); u17/u23 vs u16–u18.
- **Root cause:** model favorite-name reflex; per-world pools proposed since
  08-05, not yet built.
- **Proposed fix:** ship the per-world name pool in `config/worlds/dragon-realm`
  (a "spent names" list seeded with Marta/Elara/Torvin + a prompt line to
  draw fresh names outside common defaults).
- **Verification:** name census next batch — no cross-sitting repeats.

## New classes discovered
| Id | Proposed name | Proposed sev | Definition (one line) | Promote to taxonomy? |
|---|---|---|---|---|
| — | none this batch | | every incident fit an existing class or an 08-05 proposal | — |

**Promotion recommendation** (workflow §3.1 — recurring NEW classes): NEW-2
(2026-08-05, seeker's hand seized) and NEW-3 (2026-08-05, turn batons) have now
each appeared in two consecutive reports across AI and human play — propose
promoting both into `failure-taxonomy.md` with the definitions above.
Maintainer rules.

## What went RIGHT (keep short, keep it)
- **The completion gates held under direct pressure**: u75/u76 refused the
  false close+redeem with correction-naming texts; u130 refused work while the
  sickness peril stood — and there the keeper course-corrected perfectly,
  steering the scene into the peril's onset (u131). The record never falsely
  closed anything all batch.
- **Perils ran clean**: presented before dice (u44 the rider's approach; u77's
  drake woven into the arrival), wounds real (u80), healing earned through
  fiction (u94), and the return-to-work trial honestly `hindered` for
  half-strength (u140) — G12 visibly working.
- **Kilian's sitting is the machinery working**: souls paged on engagement
  (Marta u21, Rothgar u31), quest granted in the same reply as acceptance
  (u41→u42), item origins recorded; jakob's keeper used chronicle-from-afar
  exactly right for the Archive (u115/u117).
- **The table teaches well on plain questions**: u137's DC explanation; kilian
  u17 answered a "what is my class" from the record's silence by inviting a
  declaration instead of inventing one.
- **Zero infrastructure failures** — and the 0294524 gateway-lane fix visibly
  earned its keep: planner, table and chronicler all reachable from the friend
  containers (u55's full sealed plan; live table answers).

## Per-session appendix

### jakob / 019fecd6-da73-7785-a917-8376936ec1a9
- 28 player turns, 5 sittings 2026-08-10 → 08-16, world dragon-realm. Quests:
  Escort to Port Ashvin (stuck `[open] 2/6`, "completed" in fiction, reward
  narrated u77/u90 but never in the record — no items page exists), Archive
  Work (`[open] 0/4`). 1 wound taken (u80) and tended (u94). No deaths. No
  renown events. Session ends on the pending easy trial u140 awaiting /roll —
  player walked away mid-gate (not a failure).
- Map digest highlights: refusals u75, u76 (false completion blocked), u130
  (peril bars work — handled well). 4 GM-table exchanges (u88, u124, u125
  confabulated; u137 clean). Zero API errors; 142/142 live-branch entries.
- Notes-to-record pairings (no notes file): u88 table question = confusion at
  quest state; u125 = player saw 2/6 and asked for repair, was refused.

### kilian / 019fecd6-7004-7fff-8fee-7bfe2e18d855
- 10 player turns, 2 sittings 2026-08-10 → 08-14. Quest The Scar's Secrets
  granted `[open] 0/8` at session end; items: plate armor (purchased), the
  oath-rune longsword (WC-17 landmine: also the quest's stated reward). No
  perils rolled, no wounds, no deaths, no renown events. Zero ⚠ lines — the
  cleanest map of any session to date.
- Map digest highlights: none flagged. 1 GM exchange (u17, clean).

### Batch-level asides (for the kit, not the game)
- The shipper flow (R13) delivered no tester notes files — the audit's
  "player experience" evidence came from GM-table lines and in-fiction words.
  Worth deciding whether the shipper should prompt friends for a notes file at
  seal time.
- `session-map.mjs` prints the `world` event with a blank name (it reads
  `data.name`; the event carries `data.world`) — one-line map cosmetic.
