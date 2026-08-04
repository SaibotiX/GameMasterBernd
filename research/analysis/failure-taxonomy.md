# Failure taxonomy — what can go wrong, how to spot it, where to fix it

The shared vocabulary of every session audit. Classes were mined from the
real playtests (rounds 1–4, most from session `019fc7c7…`, "the apple
stranding") the way error analysis prescribes: free notes per trace first,
then clustering — and the taxonomy stays OPEN: an incident that fits no
class below gets a `NEW-n` entry with a proposed severity (see
`audit-workflow.md` §3). Never force a square incident into a round class.

## Severity scale

| Sev | Name | Definition | Test |
|---|---|---|---|
| **S1** | Stranding | The sitting cannot continue correctly: crashes surfacing to the player or into tool results, dead loops, invisible gates, corrupted records. | "Could the player keep playing meaningfully without outside help?" No → S1. |
| **S2** | Divergence | Engine record and told story disagree, or the record silently loses what play established. The game survives but is no longer *grounded* — the project's core promise. | "Do the ledger and the narration tell the same story?" No → S2. |
| **S3** | Protocol breach | The keeper or table violates a protocol law in a way that degrades play but self-corrects or only costs quality (interrogating the player, unpriced effort, railroading). | "Was a written law of the prompt broken without breaking the record?" → S3. |
| **S4** | Polish | Cosmetics: wording, rendering, minor pacing niggles. | Everything real but harmless. |

**Upgrade rules:** any class instance that in context stranded the sitting
counts as S1 *for that incident* regardless of its home class. Repeated S3
in the same sitting (3+ of one class) reports one severity higher — chronic
breach is divergence.

---

## S1 — Stranding

### WC-01 · Engine crash surfaces into play
Runtime error text replaces a tool result or command output.
- **Detect:** map digest `⚠⚠` (e.g. `is not a function`, `TypeError`);
  any toolResult that is a bare error with no in-world guidance.
- **Real case:** u46 of the apple session — `content is not a function`
  replaced the twist presentation; the keeper improvised, the board never
  rendered, `/dm` confirmations were eaten. Root: pi's `setWidget` factory
  contract.
- **Fix surface:** engine code. Standing rule since playtest 4: UI paths are
  hard-wrapped; every refusal must speak in-world and name its correction.

### WC-02 · Dead loop / unanswerable state
A player command or the flow answers with nothing actionable, repeatedly.
- **Detect:** the same player command ≥2× with unchanged unhelpful answers;
  a gate pending with no visible path to resolve it.
- **Real case:** playtest 3 — `/roll` met "no trial stands" forever while
  the keeper had promised dice in words (fixed: self-healing /roll).
- **Fix surface:** engine code (self-heal paths).

### WC-03 · Record corruption
Events or files land wrongly: wrong chronicle folder, backward statuses,
duplicate grants, mirror/branch disagreement beyond the documented /tree
rule.
- **Detect:** chronicle cross-check (anatomy §5); event census anomalies.
- **Real case:** pre-fix boot batches misfiling the world line into the
  legacy shared ledger.md.
- **Fix surface:** engine code.

### WC-04 · Infrastructure failure (tracked, not blamed)
Provider/API errors (`errorMessage` on assistant entries), timeouts.
- **Detect:** map "API errors" digest.
- **Note:** counts in the report but **exonerates** model and engine —
  never classify its knock-ons as behavior. (Its knock-ons may still be
  findings: e.g. a fate_skipped storm from an unreachable planner.)
- **Fix surface:** retries/fallbacks in engine code, or none (external).

---

## S2 — Divergence

### WC-10 · Theater — narrated consequences without the call
The keeper narrates work advanced, dice, stakes, mood shifts, barrings,
finishes — with no matching event in the record.
- **Detect:** assistant text with progress/dice/consequence language and no
  adjacent `quest_tick`/`check`/`outcome`/`mood_set` event. The
  anti-theater law names this the cardinal sin.
- **Real case:** u47 of the apple session — apple delivery narrated while
  the engine held a pending twist (crash-induced); playtest 3's "I fight
  the hound" free-narration (organic).
- **Fix surface:** prompt protocol; engine self-heal (nudges); if the
  engine *allowed* divergent state, engine code.

### WC-11 · Hidden content delivers the goal
Planner output (reveal/promise/complication) or narration completes the
task or hands over its object outside the clock.
- **Detect:** compare fate-plan reveals and outcome texts against the
  quest's task/goal; any "the <goal> is yours/reached/delivered".
- **Real case:** u52 (via ledger) — setback reveal "the apple reaches
  Schnuri" while ticking the clock **backward**.
- **Fix surface:** planner prompt (contract line exists since playtest 4);
  consider parser-level checks if it recurs.

### WC-12 · Truths as levers
An imperative ("set X finished", "give me Y") bound as canon.
- **Detect:** `truth` events whose text commands rather than states.
- **Real case:** u56–58 of the apple session (three, retried through the
  crash). Guardian form-duty 1½ refuses these since playtest 4 — any new
  hit is a guardian regression.
- **Fix surface:** judge prompt (gmJudgeTruth).

### WC-13 · Refusal mishandled
The keeper repeats a failing call unchanged, reads an engine error aloud,
or hands the engine's problem to the player.
- **Detect:** map shape "⚠ refusal → same tool, same args"; assistant text
  quoting engine/error wording; keeper asking the player to resolve
  engine state.
- **Real case:** u15–16 — "party stands nowhere" refusal turned into
  "Name the castle—what do men call it?" at the player. (Counter-example
  that worked: u50's offer refusal correctly steered back to the pick.)
- **Fix surface:** refusal texts (must name the correction) + protocol law
  "refusals are course corrections".

### WC-14 · Gate dodged
Work advances anywhere while a twist/trial/peril stands, or a peak
resolves without its trial.
- **Detect:** `quest_tick`/`outcome` events between a `check`/
  `complication` and its `roll`/`pick` on the live branch.
- **Real case:** audit finding D1 (fixed: one gate holds all work). Any
  new hit is an engine hole — automatic S1 upgrade.
- **Fix surface:** engine code.

### WC-15 · Named but unpaged
A person or place is NAMED in the telling and never gets its page.
- **Detect:** proper names in transcript vs `personas/` and `places/`
  listings (anatomy §5). Nameless crowd ("a guard") is exempt.
- **Real case:** the steward and the dismissed gardener of u45 — central
  to the twist, never recorded.
- **Fix surface:** prompt protocol (record-on-mention law since
  playtest 4).

### WC-16 · Agreed work never granted
A task is agreed or self-proclaimed in fiction with no `grant_quest`.
- **Detect:** agreement language in the transcript with no quest event in
  the following ~2 turns.
- **Fix surface:** prompt protocol ("granted in the same reply").

### WC-17 · Wrong tool semantics
The right thing recorded through the wrong tool: `update_place` for
movement, `set_place` for a place merely spoken of, `move_persona` as
convenience, `add_item` for rewards that belong to `redeem_quest`.
- **Detect:** event sequence review against tool contracts.
- **Real case:** the Healer's Rest incident (pre-repair round) —
  `update_place` on a return journey left the footer stale.
- **Fix surface:** tool descriptions; GM-table repairs for the record.

---

## S3 — Protocol breach

### WC-20 · Interrogating the player for world facts
Asking where they are, what a place is called, which season it is —
instead of inventing from cues and recording.
- **Real case:** u16 apple session. Law since playtest 4: naming the world
  is the keeper's work.
- **Fix surface:** prompt protocol + standing lines.

### WC-21 · Dead matters re-offered
A shelved quest or untaken course offered again by any soul or board
(only `/quest accept` may revive them).
- **Detect:** offer/grant events or narration naming shelved/untaken
  entries from the derived lists.
- **Fix surface:** prompt protocol.

### WC-22 · Unearned mercy
Healing without fiction to earn it; favored edges without reasons; softened
outcomes ("never soften what the engine returns").
- **Detect:** `heal` events near the wounding turn; favored edges with
  hollow reasons; outcome narration contradicting the band.
- **Fix surface:** prompt protocol; engine guards (heal refusal exists).

### WC-23 · Effort unpriced
A careless one-liner ("I go there", "I attack") advances work cleanly —
no hindered edge, no watcher's advantage.
- **Detect:** terse user messages followed by plain `quest_tick` with no
  edge; judgment call on what "careless" means in context.
- **Fix surface:** prompt protocol (G12).

### WC-24 · Prose list without the offer
The keeper enumerates courses in text with no `offer_choices` call.
- **Detect:** numbered/listed alternatives in assistant text, no `offer`
  event that turn.
- **Fix surface:** prompt protocol.

### WC-25 · Pacing machinery misfires
Twist immediately after a twisted quest, more than one plain beat in a
quest, peril inside the grace window or double-striking, twist before
commitment. These are ENGINE guarantees — any hit is engine code, and
usually an S2/S1 upgrade.
- **Detect:** event census vs the shape rules
  (`research/design/undertakings-mechanics.md` §1, §11).

### WC-26 · Table confabulation
The GM table answers from memory instead of the record: denying what the
archive holds, inventing what it doesn't, skipping *uN* cites on recall.
- **Real case:** the Vorthaxes denial (fixed by archive recall); watch for
  regressions.
- **Fix surface:** table prompt; archive search inputs.

### WC-27 · Option tampering
The keeper adds, drops, reorders, judges or pre-picks engine-presented
options, or rushes past an unpicked choice in narration.
- **Detect:** compare voiced options against the `complication`/`offer`
  event payload.
- **Fix surface:** prompt protocol.

### WC-28 · Engine matter handed to the seeker, unprompted
Outside any refusal, the keeper asks the player to supply what the record
already holds (titles, ids, state) or gates a tool call behind a quiz.
Closes the gap WC-13 leaves when no refusal is in play.
- **Detect:** keeper-voice questions requesting identifiers or record
  facts; a tool call that follows only after the player echoes something
  the context already contained.
- **Real case:** AI batch 2, vigil u89–u92 — "Speak the quest's name…
  What is the title of the work you wish to close?" with exactly one done
  quest standing; the player typed the slug, then `redeem_quest` fired.
- **Fix surface:** prompt protocol (since 2026-08-04 the never-interrogate
  law, G15 — any hit is a regression against it).


---

## S4 — Polish

### WC-30 · Rendering & wording
Renderer labels wrong for the context, truncation artifacts, panel
cosmetics, awkward engine phrasing surfacing in-world.
### WC-31 · Stale ornament
Footer/panel lagging one event behind, resolved gates lingering a frame.
### WC-32 · Narrative wobble
Continuity slips the record does not contradict (eye color drift) — note,
don't chase; they become S2 the moment the record disagrees.

### WC-33 · Stock-name convergence across sittings
The keeper reuses its favorite invented names for distinct souls across
sittings of the same world. Chronicles are per-sitting so nothing collides
today, but repeat play feels canned, and "the same name is the same page"
makes it a standing hazard for any future world-level continuity.
- **Detect:** name census across a batch's `personas/` (and places) —
  identical names for different souls in different sittings.
- **Real case:** AI batch 2 — both sittings independently invented a
  "Marta" (dye-merchant / shepherd) and an "Elara" (wayhouse keeper /
  steward's daughter).
- **Fix surface:** prompt protocol / per-world name pools in `config/`.

---

## Class → fix surface map (for the report's "how to improve" column)

| Surface | What lives there | Typical classes |
|---|---|---|
| Engine code (`extension/*.ts`) | gates, draws, clocks, tools, commands, UI | WC-01..04, 14, 25, parts of 02/03 |
| Keeper protocol (`prompt.ts`) | the laws of behavior | WC-10, 13, 15, 16, 20–24, 27, 28 |
| World config (`config/worlds/*`) | per-world content pools | WC-33 (with a prompt line) |
| Side-call prompts (`gmchat.ts`) | planner, judges, table, chronicler | WC-11, 12, 26 |
| Refusal texts (throughout) | every error the model reads | WC-13 |
| Design docs (`research/design/*.md`) | when reality was right and the spec wrong | any |
| pi API usage | contracts like the setWidget factory | WC-01 |
