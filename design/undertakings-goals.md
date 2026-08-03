# Undertakings — goals and invariants

The north star for the multi-beat quest system. Every implementation step is
checked against this file; if a change can't point at a goal here, it doesn't
ship. (Mechanics live in undertakings-mechanics.md, evidence in
undertakings-research.md, progress in undertakings-build.md.)

## Player-experience goals

- **G1 — No one-prompt jobs.** A granted task takes several beats of real play
  to finish; "done" is earned through the engine, never narrated into being.
- **G2 — Tasks are discovery, not work.** Quests exist to reveal the world:
  mundane surface, occasional hidden second layer. Roughly half of tasks
  carry no mid-work twist — but no quest ends flat (see G9). Complications
  must never feel like nagging or added chores.
- **G3 — Complications are character moments.** A mid-task twist asks "which
  approach are you?" (rope, smith, or ford) — resolvable in the current scene
  by choice, never by a mandatory extra fetch.
- **G4 — Pre-decided, but fair.** The game decides outcomes in advance, and the
  player can always reconstruct *why* afterwards from things they could have
  known. Surprise yes, gotcha never.
- **G5 — Structure never grinds.** The shape of quests varies (size, twist or
  none, decision shape); the same structure repeating back-to-back is a bug.
- **G6 — The world routes the journey.** Finished chains end in breadcrumbs to
  named people/places elsewhere; several stay live so the route is the
  player's. Completion visibly dents the world.
- **G7 — Choice UI never blocks talk — but a gate holds all work** (revised
  2026-08-03, audit round). Picking a fix is explicit and effortless (the
  four-slot board + hotkeys + /pick with optional extra words), plain
  conversation always flows, and nothing is auto-picked. But a sealed twist
  or a declared die is UNSKIPPABLE: while one stands, no work on ANY quest
  advances — the engine refuses every attempt, the panel burns red, the bell
  rings once. The seeker must decide; they cannot out-wait or out-errand the
  moment.
- **G8 — Dice are ceremony, not bookkeeping.** When a roll happens it is an
  unmissable on-screen moment with visible arithmetic and one post-roll lever;
  rolls only where outcomes are uncertain AND failure costs something.
- **G9 — The peak is always in the player's hands** (playtest verdict,
  2026-08-03). The stroke that completes a task is never a flat tick: it is a
  trial (or the twist already stood there). Whatever decides win or lose runs
  through the seeker's own die or pick.
- **G10 — Logic over boldness** (same playtest). A stroke the fiction stacks
  against — outnumbered, unprepared, reckless — must earn itself through a
  hazard trial (worst of two dice); sound tactics that remove the hindrance
  work unrolled. Bold words never succeed where bold deeds would not.
- **G11 — Choosing is the seeker's pleasure.** When a scene presents real
  alternatives (task boards, forks, rival requests), the engine lays them out
  as a clean pickable offer — dismissible by simply speaking on; only a
  twist's sealed paths bind. A course once offered and not taken is never
  re-offered by any soul or board; only the seeker may take it up later
  (/quest accept, standing where it was laid).
- **G12 — Effort is the price** (2026-08-03, user decree). A cheaply stated
  move — no method, no care, no detail — is a careless one, and the world
  punishes carelessness: the keeper declares it hindered or lets the scene's
  watchers seize the advantage. Real intention earns clean attempts; nothing
  is given to the idle. The game is a challenge to be tried, not a prompt to
  be filled.
- **G13 — The world levels with the seeker.** Renown (quests seen through —
  won or lost — places walked, souls met) sets the weight of new work: early
  tales lean easy with a real chance of worse; by the end most work is hard.
  A hard task offered early is the seeker's to accept — and theirs to lose.
  No beat of a quest is idle: at most ONE beat per quest passes as a plain
  tick (the ≤1-autoresolve rule); every other beat carries a twist, a clue
  weave, or a drawn trial.
- **G14 — The world is alive and owes no one safety** (the Kenshi lesson).
  On a hidden fuse the world itself strikes — a thief, a beast, a sickness —
  quest or no quest, harder as renown grows, never impossible even for the
  young. Perils wound; three wounds end the tale. Death is real: the game
  never denies it to those who seek it, and never fully shields those who
  don't. Losses are situations, not endings — until the last one.

## Fairness invariants (from the research — see research doc "fair" list)

- **F1 — Telegraph the fuse, hide the bomb.** Every planned backfire is
  preceded by discoverable in-fiction warning signs (two clue channels),
  delivered before the choice. The player may miss them; they must exist.
- **F2 — Outcomes key to visible state.** Which fix works traces to prep,
  items, allies, prior beats — never to secret dice or hidden counters. Blue
  options make preparation visibly buy certainty.
- **F3 — Stakes contract before commitment.** Risk word (safe/risky/desperate)
  and an effect promise are shown per option before picking; only the
  *content* of the outcome is hidden.
- **F4 — Post-hoc explicability.** Failure narration names the cause ("the
  ranger warned the rope was frayed"). Every backfire also pays something:
  information, a new option, a windfall elsewhere.
- **F5 — Bounded damage, hand on the wheel.** Costs land in bounded meters
  (clock segments, grit, wounds 0–3); at most one active complication;
  complications converge on the quest's own finale, never spawn new quests;
  hard failure is possible but only at the end of an escalation ladder
  (quests: desperate twist paths only; the seeker's life: the visible wound
  meter, never a single bare die from full health), and every outcome text
  ends with an open move for the player — save the last.

## Pacing invariants

- **P1** — max one major complication per quest.
- **P2** — no complications in two consecutive quests. The breather is a
  cooldown, never an alternation: a twist-free quest still twists only 2 in 3
  — strict twisted-plain-twisted patterns are themselves a bug (G5). Perils
  keep their own breather: a fresh fuse (several quiet turns) winds after
  every strike.
- **P3** — the twist lands after commitment (~50–70% of the clock), never at
  grant, never as a bolted-on errand.
- **P4** — at most 4 open quests, hard (the four-slot board; a fifth requires
  the seeker to shelve one — their choice, never the engine's). The task
  itself is stated in one clear sentence — mystery lives in the story, not
  the objective.
- **P5** — variety is enforced by draw-without-replacement (shuffle-bags),
  branch-aware like everything else, not by hoping the model varies.

## Architecture invariants (the game's existing philosophy, extended)

- **A1 — Code adjudicates, AI narrates.** Clock ticks, draws, rolls, gates,
  outcome application: code. Premises, option wording, clue text, narration:
  AI. The fate planner is AI-written content inside a code-drawn structure.
- **A2 — The keeper does not know the answer sheet.** Hidden plans come from a
  side LLM call and never enter the keeper's context; the keeper learns an
  outcome only when the engine reveals it for narration.
- **A3 — Everything is a ledger event.** Shapes, ticks, plans (veiled),
  presentations, picks, outcomes ride the session ledger: /tree rewinds them,
  /fork copies them, /ledger and recall see the public ones, repairs can fix
  them. Branch truth beats file mirrors.
- **A4 — Veiled, never lied about.** The GM table may say a fate is sealed for
  play's sake; after resolution it may show the whole answer sheet.
- **A5 — Grounded in laws.** Complications cite the world's laws file; that
  file is player-discoverable, which is what makes "the world works differently
  than you assumed" a fair reason.
