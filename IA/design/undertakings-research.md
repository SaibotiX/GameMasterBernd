# Undertakings — research record (2026-08-03)

Two web-research passes distilled; kept as evidence for the goals doc. When a
design argument starts, this is the receipts file.

## Tabletop mechanics & GM craft

- **D&D 5e**: one universal check (d20+mod vs DC), roll only when uncertain
  AND failure costs; DC ladder Very Easy 5 → Nearly Impossible 30; bounded
  accuracy keeps tiers meaningful forever. Advantage/disadvantage = roll two
  keep one (~+3.3 avg), legible, never stacks. Optional DMG rules: success at
  a cost (miss by 1–2), degrees of failure (miss by 5+).
- **4e skill challenges (cautionary)**: N-successes-before-M-failures is a
  probability cliff (per-check odds >65% ⇒ auto-win, <50% ⇒ auto-lose);
  failures as invisible counters changed nothing in fiction. Fixes: grade the
  finale by accumulated position instead of pass/fail; every failure mutates
  the situation; announce structure openly — hide outcomes, not stakes.
- **PbtA (Apocalypse World / Dungeon World)**: 2d6 — 10+ do it, 7–9 do it
  with cost, 6− the GM makes a move; "success with complication" is the modal
  outcome, "nothing happens" doesn't exist; the GM never rolls. GM agenda +
  12 principles (be a fan of the characters; make a move that follows; never
  speak the name of your move; ask questions and use the answers…) — nearly a
  drop-in narrator system prompt.
- **Soft/hard moves**: telegraph first, detonate only after a miss or an
  ignored warning ("golden opportunity") — consequences always trace to a
  warning the player saw. Our two-stage fuse (clues beat, twist beat) is this.
- **Blades in the Dark**: position (controlled/risky/desperate) × effect
  declared BEFORE the roll — the stakes contract; progress clocks 4/6/8 pace
  multi-step work (every roll ticks something, no dead beats); devil's
  bargains = consented guaranteed complication for a better roll; resistance
  rolls = bounded player veto. Citizen Sleeper lifted clocks into a video UI.
- **GM craft**: Colville — escalate, never dead-end (one patrol, not the
  fortress); objective told, method never. Mercer — consequences are not
  punishments; telegraph so outcomes feel earned. Mulligan — "yes, and" /
  "no, but": every refusal hands back a live alternative. Sly Flourish —
  prep secrets & clues, not plot: ~10 floating facts revealed wherever play
  goes (how hidden outcomes get foreshadowed organically). Alexandrian —
  Three Clue Rule (plant 3, they'll miss one, misread another); fail forward
  when refusing a retry feels weird; real failure must stay possible.
- **Digital presentations**: BG3 — the roll as full-screen ceremony, DC and
  modifiers shown, post-roll spends (inspiration), karmic dice clip cold
  streaks. Disco Elysium — odds shown before commit; white (retry after the
  world changes) vs red (one-shot, labeled) checks; failure written as
  premium content. Citizen Sleeper — roll first, allocate after: luck becomes
  resource allocation. KoDP — hidden pre-weighted outcomes made fair by
  fallible in-fiction advisors and post-hoc explicability; criticized exactly
  where outcomes keyed to invisible counters. FTL — blue options: visible
  prep purchases certainty; but its odds-fairness relies on run repetition,
  which a one-shot narrative game doesn't have ⇒ fairness must come from
  telegraphing. Old World (Soren Johnson) — reject opaque triggers, key
  events to visible state.
- **Fail-forward bounds**: the complication spiral is the known failure mode;
  bound with finite meters (stress/clock segments), one active threat clock,
  complications converge on the existing finale, hard failure stays possible.

### Top 5 principles for making pre-decided hidden outcomes feel FAIR
1. Telegraph the fuse, hide the bomb (≥2 clue channels, soft before hard).
2. Key outcomes to visible state, never secret dice or hidden counters.
3. State the stakes contract before commitment; hide only the content.
4. Pass the post-hoc explicability test; never trade failure for nothing.
5. Bound the damage; always leave the player one visible next move.

## Videogame quest structure & variety

- **WoW**: hubs (2–4 hooks sharing one geographic pocket) + breadcrumb quests
  (near-zero-effort pointers to the next hub) produce zone flow; Cataclysm's
  full linearity killed the open feel — keep 2–3 breadcrumbs live so routes
  stay chosen. Kaplan's GDC mistakes list: Christmas-tree effect (cap ~3
  active), mystery belongs in story never in the task ("figure out what's
  wrong" is bad), cap quest text, don't group same types back-to-back,
  pity-timers on drops, celebration payoffs.
- **Quest grammar (Doran & Parberry, 750+ quests)**: everything reduces to ~9
  NPC motivations → strategies → chains of ~20 action atoms; designers vary
  surface fiction and recursive DEPTH, not verbs. A mid-task complication is
  formally "one action expands into a subquest" — our twist, for free.
- **Witcher 3**: "We don't do fetch quests" = ban meaningless, not modest;
  start from a one-line human situation (grudge, grief, debt, secret), attach
  mechanics after. Bloody Baron: twist placed AFTER commitment (~50–70%),
  recontextualizing done work; ambiguous dilemmas; delayed consequences
  resurfacing later are the most memorable beat. 40-second rule: something
  interesting per travel leg — floor AND ceiling.
- **Consequence transparency**: Telltale's "X will remember" proves cheap
  acknowledgment works but decays; Wildermyth's rules thread it — tradeoffs
  not good/bad, big consequences telegraphed beforehand, payoff schedule
  hidden, never troll; when a delayed consequence fires, NAME the past choice
  (the callback is the reward).
- **RimWorld storytellers**: tension is a scheduled wave (burst then
  guaranteed quiet, severity scaled to player progress); pure randomness
  under-delivers drama and reads as slack ⇒ complications on a
  crisis-cooldown clock, not dice.
- **FTL / Curious Expedition / KoDP / Wildermyth**: options keyed to what the
  player owns; complication probability tied to visible resources (disasters
  read as the player's push-your-luck, not GM spite); few, weighty choices
  with fallible advisors and "do nothing" always real; cast events from
  already-known people (role slots over the chronicle) — the anti-hollow
  trick; every event must write at least one line of permanent state.
- **Skyrim Radiant (cautionary)**: generation feels hollow without stakes on
  known entities, permanent visible consequence, and callbacks.
- **Event decks**: draw-without-replacement (shuffle-bags) is the cheapest
  hard variety guarantee — an LLM GM otherwise gravitates to favorite
  patterns; refill on exhaustion, quota categories like card suits.
- **Wildermyth's plot lesson**: procedural PLOT fails; hand-fix the spine and
  landmarks, let generation colonize the space between; players care about
  characters caring, never lore dumps.

### Top 5 anti-boredom rules for structure variety
1. Shuffle-bag every category; never the same skeleton twice in a row.
2. Vary depth, not just verb (flat quests alternate with expanding ones).
3. Complications on a tension clock, not dice (burst → guaranteed quiet).
4. Twist after commitment (50–70%), recontextualizing, never extra errands.
5. Rotate the DECISION SHAPE too (approach / dilemma / push-your-luck /
   triage / roll-first) — same shape with a fresh verb still bores.

### Top 5 ways quests feel like discovering a world, not chores
1. Quests are pointers into geography (hooks bundled, breadcrumb exits).
2. Only known entities have stakes (or mint ones that persist and recur).
3. Mundane surface, hidden second layer — ban meaningless, not modest.
4. Withhold one fact; pay off one memory (~every third quest calls back).
5. Completion must dent the world — observable state later scenes reference.

## Source pointers

Tabletop: dndbeyond.com (basic rules), enworld.org (skill-challenge math),
dungeonworldsrd.com + Sagelt/Dungeon-World (GM principles), bladesinthedark.com
(action roll, clocks), slyflourish.com (secrets), thealexandrian.net (three
clue rule, failure guide), bg3.wiki + inverse.com (dice/karmic), discoelysium
wiki (white/red checks), designer-notes.com (Old World events), KoDP blog +
rpgcodex threads, Colville/Mercer/Mulligan talks. Games: gamedeveloper.com
(Kaplan GDC, Sasko GDC, Citizen Sleeper), mcvuk/shacknews (Witcher 3),
ianparberry.com (quest grammar paper), gdcvault (Wildermyth), rimworldwiki +
number13.de (storytellers), ftl.fandom (blue options), uesp.net (Radiant),
bgdf.com (event decks), massivelyop/wowhead (hubs & breadcrumbs).
