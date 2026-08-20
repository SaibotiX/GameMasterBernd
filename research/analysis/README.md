# research/analysis/ — the playtest telemetry kit

Turn recorded sittings into a ranked, evidence-cited list of what to fix.
Every GameMaster Bernd session is a complete trace (every word, tool call,
refusal and game event, uN-numbered) — this kit is the discipline for
mining batches of them.

## The pipeline at a glance

```
testers play  ──►  sessions-in/<batch>/<tester>/     (jsonl + story folder + notes)
                     │
                     ▼  node tools/session-map.mjs         (mechanical map: leads)
                     ▼  per-session open coding             (free notes + uN evidence)
                     ▼  aggregate per failure-taxonomy.md   (classes, 2 counts, verify)
                     ▼
             reports/<date>-<batch>.md   — sorted Severity → Sessions → Incidents
                     │
                     ▼  rulings → research/design/ docs → fixes → unit + smoke + TTY probe
                     ▼  next batch re-tests the same ground (RITE)
```

## The files

| File | Read it when |
|---|---|
| [`session-anatomy.md`](session-anatomy.md) | you need to READ a session: where data lives, entry model, uN numbers, /tree branches, the mechanical map, cross-checks |
| [`failure-taxonomy.md`](failure-taxonomy.md) | you need to CLASSIFY: severity scale S1–S4, classes WC-01…WC-32 with detection signatures, real examples and fix surfaces; open NEW-class rule |
| [`audit-workflow.md`](audit-workflow.md) | you run an audit: the 7-stage method, counting and sorting rules, the one-prompt template, the fix loop, ground rules |
| [`report-template.md`](report-template.md) | you write the findings file |
| [`playtester-guide.md`](playtester-guide.md) | you hand a tester the game — give them THIS file and nothing else |
| `tools/session-map.mjs` | always — the deterministic first pass over any session |

## Quick start (maintainer)

```
# hosted sittings first ride in from the store (R13's shipper):
research/analysis/tools/pull-sessions.sh 2026-08-xx-first-batch

# one command, whole batch — from the repo root in Claude Code:
/analyze-sessions research/analysis/sessions-in/2026-08-xx-first-batch/

# AI batches (played by aitester/) use the same kit and contract:
/analyze-sessions aitester/sessions-in/<batch>/

# or by hand, following audit-workflow.md:
node research/analysis/tools/session-map.mjs research/analysis/sessions-in/<batch>/**/*.jsonl
```

Reports land in `reports/` (tracked — they are the project's quality
history); reports for AI batches land in `aitester/reports/`, beside the
batches they judge. Both `sessions-in/` folders are **gitignored**:
sessions are private play. Hosted testers (the friends web service,
roadmap stage 1) hand in only their notes: their sessions arrive via the
shipper (R13) — `tools/pull-sessions.sh <batch>` pulls the store's
mirror and lands each session as `sessions-in/<batch>/<player>/<sid>/`
(`session.jsonl` + `story/` + a manifest-written `meta.md`, hashes
verified on landing) — the same contract from there on.

## The three rules that make it work

1. **Evidence or it didn't happen** — every finding cites uN spans and
   S1/S2 findings are re-verified against the raw record before reporting.
2. **Severity caps, counts rank** — the report is sorted Severity →
   Sessions affected → Incidents, so the top row is always the next fix.
3. **The taxonomy stays open** — unmatched incidents become NEW classes;
   forcing them into old boxes corrupts the counts that drive priority.
