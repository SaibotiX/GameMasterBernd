---
description: Audit World Console playtest sessions — map, classify, count, and write the ranked findings report
---

Audit the World Console playtest sessions given as: $ARGUMENTS

(If no paths were given, ask which batch under `research/analysis/sessions-in/`
(human play) or `aitester/sessions-in/` (AI play) to audit, or take every
`.jsonl` under the newest batch folder there.)

Follow `research/analysis/audit-workflow.md` EXACTLY. In short:

1. **Read the kit first**: `research/analysis/audit-workflow.md`,
   `research/analysis/failure-taxonomy.md`, `research/analysis/session-anatomy.md`,
   `research/analysis/report-template.md`. They are the method; do not improvise
   past them.
2. **Mechanical map**: run `node research/analysis/tools/session-map.mjs <files>`
   per session. Never paste raw session JSONL into context — work from the
   map plus targeted bounded reads of flagged uN spans. Cross-check each
   session's chronicle folder (named souls/places vs pages, quest statuses
   vs events).
3. **Per-session open coding**: free notes with uN spans, one session at a
   time. With more than two sessions, fan out one subagent per session so
   no session's conclusions prime another's; each returns its notes list.
   Pair the tester's notes file (experience) with the record (cause).
   Assistant `errorMessage` spans are infrastructure (WC-04) — count, but
   exonerate model and engine for their knock-ons.
4. **Aggregate**: cluster notes into taxonomy classes; unmatched incidents
   become NEW-n classes with proposed severity. Apply upgrade rules. Count
   BOTH sessions-affected and total incidents per class.
5. **Verify**: re-open one cited span per S1/S2 class against the raw
   record; drop findings that die under verification.
6. **Report**: write `research/analysis/reports/<YYYY-MM-DD>-<batch>.md` per the
   template (for an AI batch from `aitester/sessions-in/`, write to
   `aitester/reports/` instead) — summary table sorted Severity →
   Sessions affected → Incidents; one concrete proposed fix per class with
   its fix surface; status NEW/KNOWN/REGRESSION against earlier reports in
   `research/analysis/reports/` and `aitester/reports/`; a short "what went right"
   section.

Hard rules: every finding cites uN evidence; do NOT modify engine code,
prompts, or design docs in this run — the report proposes, the maintainer
rules. End by telling the maintainer the top three rows of the summary
table and which single fix buys the most.
