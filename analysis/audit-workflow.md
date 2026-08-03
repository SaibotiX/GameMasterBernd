# The audit workflow — many sessions in, one prioritized report out

How a batch of playtest sessions becomes a ranked list of what to fix.
Built on the standard error-analysis method for LLM systems — free notes per
trace ("open coding"), then clustering into the taxonomy ("axial coding"),
with a human reviewing the clusters — and on RITE-style iteration: fix
between batches, then re-test the same ground.

**One-prompt invocation:** run `/analyze-sessions <paths|folder>` in Claude
Code from the repo root (the command lives in `.claude/commands/analyze-sessions.md`
and walks the agent through exactly this file). Or paste the prompt from §6.

---

## 0. Intake

- Testers hand in per `playtester-guide.md`: session `.jsonl`, their
  chronicle folder, `ledger.md`, and their notes file.
- Drop each batch under `analysis/sessions-in/<batch-name>/<tester>/…`
  (gitignored — sessions are private play).
- AI batches arrive ready-made: the driver (`aitester/tools/ai-playtest.mjs`)
  writes the same contract into `aitester/sessions-in/<batch>/ai-<persona>-<n>/`,
  with the environment line already in each sitting's `meta.md`.
- Record the environment once per batch: pi version (`pi --version`),
  extension commit (`git log -1 --format=%h`), model used. Findings without
  an environment line are unactionable later.

## 1. Mechanical map (code, deterministic — always first)

```
node analysis/tools/session-map.mjs sessions-in/<batch>/**/*.jsonl
```

Per session this yields: the uN-numbered entry map (× = off the live
branch), a game-event census, branch stats, API errors, and a high-recall
`⚠`/`⚠⚠` digest of refusals and crashes. The digest generates **leads, not
verdicts** — false positives are expected and fine.

Then the chronicle cross-check per `session-anatomy.md` §5 (named entities
vs pages, statuses vs events, mirror vs branch).

## 2. Per-session judgment pass (open coding)

Read each mapped session end to end — the map plus targeted reads of the
raw entries where the map flags something. Write **free notes**: every
moment where play went wrong, felt wrong, or only worked by luck, each with
its uN span, a one-line description, and what the player experienced.
Rules:

- Note first, classify later. Do not reach for the taxonomy while noting —
  premature classification is how novel failures get squeezed into old
  boxes.
- The tester's own notes file is evidence of *experience* ("I was
  confused here") — pair it with the record's evidence of *cause*.
- An incident with an assistant `errorMessage` in its span is
  infrastructure (WC-04) — the model and engine are exonerated for its
  knock-ons, but the knock-ons themselves may still be findings.
- Sessions are independent: when more than two are in the batch, analyze
  them in parallel (subagents), one session per analyst, each returning
  its notes list. Never let one session's conclusions prime another's
  notes.

## 3. Aggregation (axial coding)

Pool all notes and cluster:

1. Map each note to a taxonomy class (`failure-taxonomy.md`). A note that
   fits nothing becomes `NEW-1`, `NEW-2`, … with a proposed severity and a
   one-line definition — new classes are a *success* of the process, not a
   failure of the taxonomy. Promote recurring NEW classes into the
   taxonomy file afterwards.
2. Apply the upgrade rules (anything that stranded its sitting → S1 for
   that incident; 3+ same-class S3 in one sitting → one severity higher).
3. Count TWO numbers per class — they answer different questions:
   - **Sessions affected** (breadth): in how many sittings did it appear?
   - **Incidents** (depth): total occurrences across the batch.
4. **Verify before reporting:** for every class with S1/S2 findings,
   re-open one cited uN span and confirm the record actually shows what
   the note claims. A finding that dies under verification is dropped, not
   softened. Findings must be reproducible from the record by a stranger.

## 4. The report

Write `analysis/reports/<YYYY-MM-DD>-<batch>.md` following
`report-template.md` (for an AI batch: `aitester/reports/<YYYY-MM-DD>-<batch>.md`,
beside the batches it judges). The summary table is sorted by **Severity, then
Sessions affected, then Incidents** — the top row is always the next thing
to fix. Every class row carries its fix surface (taxonomy's map) and a
concrete proposed change.

## 5. The fix loop (RITE)

1. Top rows → rulings by the maintainer (some findings are decisions, not
   bugs — route those to `design/` docs first, code second, exactly like
   the audit round did).
2. Fixes land with the standing verification recipe: unit suite
   (`node extension/test/unit.ts`), headless RPC smoke, and the pseudo-TTY
   probe for anything touching widgets/overlays. Update
   `design/undertakings-build.md` (the tracker) per round.
3. **Re-test the same ground next batch**: give at least one tester the
   scenario that broke ("set yourself a fetch task, then escalate the
   story mid-quest") and check the class's count went to zero. A fixed
   class that recurs reopens harder (its detection signature was wrong or
   the fix was partial).
4. Keep reports immutable once written — the next batch gets a new file;
   the sequence of reports IS the quality history.

## 6. The one-prompt template (paste into Claude Code, run from the repo root)

```
Audit these playtest sessions of the World Console pi extension:
<paths or analysis/sessions-in/<batch>/>

Follow analysis/audit-workflow.md exactly: mechanical map first
(analysis/tools/session-map.mjs), then an independent open-coding pass per
session (subagents when more than two), then aggregate per
analysis/failure-taxonomy.md with both counts (sessions affected +
incidents), verify every S1/S2 citation against the raw record, and write
the report to analysis/reports/<today>-<batch>.md per
analysis/report-template.md. Sort by Severity, then Sessions affected,
then Incidents. Cite uN evidence for every finding. Propose one concrete
fix per class with its fix surface. Do not modify engine code in this run.
```

## 7. Ground rules (the method's non-negotiables)

- **Human in the loop:** the maintainer personally skims at least one full
  session per batch, raw, before accepting the report — clustering can be
  delegated; taste cannot. (This is the field's strongest finding about
  LLM-assisted error analysis.)
- **Evidence or it didn't happen:** every finding cites uN spans; every
  S1/S2 was re-verified. The report never says "the AI tends to…" without
  counted instances.
- **Counts drive priority, severity caps it:** a daily S3 outranks a
  once-ever S3, but never outranks an S1.
- **The taxonomy is open:** NEW classes are welcome; forcing incidents
  into ill-fitting classes corrupts the counts that drive priority.
- **Never blame weather on the pilot:** infrastructure failures (WC-04)
  are counted and excluded from behavior conclusions.

Sources for the method: Hamel Husain's evals FAQ on
[error analysis](https://hamel.dev/blog/posts/evals-faq/why-is-error-analysis-so-important-in-llm-evals-and-how-is-it-performed.html)
and [what to automate](https://hamel.dev/blog/posts/evals-faq/what-parts-of-evals-can-be-automated-with-llms.html);
the [RITE method](https://en.wikipedia.org/wiki/RITE_Method);
playtest-instruction practice per
[Schell Games' playtest-questions guide](https://schellgames.com/blog/the-definitive-guide-to-playtest-questions-for-video-game-playtesters)
and [Game Developer's five tips](https://www.gamedeveloper.com/design/best-practices-five-tips-for-better-playtesting).
