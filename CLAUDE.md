# CLAUDE.md

World Console: a terminal story game built as extensions on the pi coding agent. The main `README.md` explains how the engine works; this file is about how to work ON the project without breaking its records.

## Where truth lives

| Place | What it is |
|---|---|
| `README.md` | architecture & how the engine works — kept in sync with the code |
| `config/` | the LIVE game content (constitution, worlds + laws, moods, sites) — hot-loaded into the game prompt; edits change play immediately. Match the register; never leave TODO/meta markers in these files |
| `research/design/` | game-design law: `undertakings-goals.md` (the G/F/P/A registry), mechanics spec, research receipts, build log (with its decisions log), design↔code audit (owns ids D1–D12), the pi upgrade rite + coupling register (`pi-upgrades.md`) |
| `research/analysis/` | the playtest method kit; `research/analysis/reports/` is the immutable quality history |
| `research/roadmap/` | product & distribution: decision registry (R1…, open-ended), stage specs (friends web → paid beta → public → Steam), platform/business research log, coverage register (what's answered / what's open) |
| `research/icebox.md` | declined ideas, kept cold (R25): On ice (revival conditions, recurrence counts) and Closed (won't-dos with reasons) — the judge checks it on every new idea |
| `deploy/` | the stage-1 hosting machinery. `deploy/README.md` is the runbook — live ops truth, procedures, dated state notes; `deploy/guide/` is the teaching layer — from-zero explanations, how-tos, reference and the next-project blueprint, each page stamped with the deploy/ commit it was synced against. Where they disagree, the runbook wins. A round that lands changes under `deploy/` outside the guide runs `/guide-sync` (R31) before its wrap |
| `aitester/` | the AI playtesting harness, its batches and reports |
| `data/`, `*/sessions-in/`, `auth.json` | private play & credentials — gitignored, never committed, never shipped |

## The decision guardrail

Before adopting ANY new research finding, plan, or design change:

1. **Check both decision registries for conflicts** — `research/design/undertakings-goals.md` (plus the decisions log in `research/design/undertakings-build.md`) for game design; `research/roadmap/01-decisions.md` (the R registry) for product and distribution.
2. **A conflict is never resolved silently.** Mark it in the document where the new material lands — `⚠ DEVIATION (R3): <one line on what deviates and why>` — and surface it to the maintainer for a ruling. Neither adopt nor discard the deviating material before the ruling.
3. **Record rulings IN the registry entry, dated** — "(revised 2026-08-05: …)" or "superseded by R9" — never rewrite an entry silently. New decisions take the next free id; ids are never reused.
4. **File new evidence where it belongs:** game mechanics/feel → `research/design/undertakings-research.md`; platform/legal/business/market → `research/roadmap/06-research-log.md` (dated; ⚠-mark fast-moving facts with their re-verify trigger).
5. **End of session: zero silent deviations, zero silent unknowns** — every deviation either ruled on or explicitly listed to the maintainer; territory the records don't cover gets a row in the coverage register (`research/roadmap/09-coverage.md`, R15) before the session ends.

## The covenant (decision R26 — roles, binding unprompted)

- **The maintainer is the philosopher:** every idea gets thrown in; the project steers by their rulings. **The session is the judge and gardener:** it answers every idea with a verdict (R25) and a concrete shape — and novelty is never a strike; a direction change is surfaced as a direction change, never quietly blocked, never quietly adopted.
- **Blanks are never filled silently.** An intent gap (half-explained feature, bug, syntax) → a question to the maintainer, never a guess. A design gap → a concrete proposal ("here's how I'd build it — does it stay true to your intent?"), then settle in conversation. The session decides design; the philosopher decides intent and direction; neither decides silently.

## Committing & pushing (decision R9 — standing authorization, no per-commit asks)

- **The commit is the unit of REVERT.** One commit = one logical change: revertible alone, tree green after it. A ruling with N items lands as ~N commits, each as it goes green — never one round-blob. Entangled fixes that can't be verified apart share one commit; independent fixes never do. Tests, docs and registry lines ride WITH the change they describe.
- **Gate before committing:** `node extension/test/unit.ts` when `extension/` changed (seconds); the full recipe before any push. Never commit or push red.
- **Push at verified checkpoints, not per commit:** after a task-group lands verified · ALWAYS before launching an AI batch (meta.md stamps `git log -1`; never commit mid-batch) · at round/session end (no session ends with unpushed work; a marked `wip:` commit is allowed if truly interrupted) · before anything sweeping.
- **Seen before done (R9, revised 2026-08-08):** player-visible or judgment-heavy changes count done only once the maintainer has seen the result (a played turn, a transcript, a screenshot) — offered unprompted before the round wraps and pushes; mechanical changes (test fixes, refactors, records) exempt.
- **Plan commit boundaries when planning tasks** (say them with the task list), close the round with a wrap commit carrying the build-log/round records. Messages: house narrative register, scoped — `<surface>: <what and why in one breath>`. History-rewriting git (amend-after-push, rebase, force-push, reset) stays ask-first.
- **Reverting with keepers:** `/salvage` (R27) — full-range revert proving return to the checkpoint, keepers re-landed oldest-first as adapted `-x` picks, gated per pick, forward-only; the maintainer pastes the hashes to keep.

## Session cut points (decision R10 — the session's own duty)

- **Recommending the end of a session is YOUR job, unprompted.** When a round closes per R9 (wrapped, green, pushed, zero deviations, no open tasks) and the next item is a substantial new round — or you notice real strain (re-reading known files, unsure of your own earlier decisions, heavy compaction behind you) — say so and recommend a fresh session. Never cut mid-round (that's `wip:` + compaction).
- **Before recommending: the cold-start test.** Could a fresh session reconstruct everything from this file + the owning docs alone? A "no" is a records bug — fix the records, then cut. End with a paste-ready opener that POINTS at the owning documents (build log next-step, report, registry) — it never restates their content.
- **The breakdown cut (R10, revised 2026-08-08):** when the conversation talks past itself — the same point clarified repeatedly, corrections piling up — say so plainly, recommend the break, and prep the opener: pointers to the records PLUS the open questions themselves, verbatim; the fresh thread opens with the maintainer answering, not the session guessing.

## Prompt triage (decision R22 — the packed prompt maps into threads first)

- A prompt carrying several separable undertakings gets TRIAGED before any work: inventory every ask → classify → cluster by coupling → judge (R25) → order (rulings, blockers, then dependency) → place (this session / subagents / deferred round). Method: `.claude/commands/triage.md` (`/triage`) — apply it unprompted whenever the shape appears.
- **Every thread earns a verdict before work (R25):** implement · needs-clarification · spike first · park (owning doc + named trigger) · icebox · won't-do · duplicate. Declined ideas live in `research/icebox.md` — checked on every new idea; recurrence is the revival signal. The session's own ideas and mid-session "small tweaks" pass the same judge.
- Coupled topics never split (arguable = together); deferrals and verdicted-away asks need the maintainer's nod; the map is presented before work begins; mid-session arrivals get the same test out loud.

## House rules

- **One truth, one home:** every fact, rule, or workflow has exactly ONE owning document; everything else points to it, never restates it. New material that would duplicate or contradict a standing home is a ⚠ DEVIATION for the maintainer's ruling — two documents must never answer the same question differently.
- Never paste raw session JSONL into context — map first (`node research/analysis/tools/session-map.mjs`), then bounded reads of flagged uN spans (`research/analysis/session-anatomy.md`).
- Audit runs propose; the maintainer rules (`research/analysis/audit-workflow.md` §7). Playtest reports are immutable once written — the next batch gets a new file.
- Player copies and any public surface exclude `research/` and `aitester/` (decision R4).
- `research/collaboration/` is the maintainer's self-review corner: OFF-LIMITS — never read, quote, or act on it unless the maintainer invokes `/collab-review` or points to a file there themselves (rationale inside its README; it is evidence-based, not decorative).
- Verification recipe for engine changes: `node extension/test/unit.ts`, headless RPC smoke, and the pseudo-TTY probe (`bash extension/test/tty-probe.sh`) for anything touching widgets/overlays (`research/design/undertakings-build.md`). A pi version change triggers the full upgrade rite: `research/design/pi-upgrades.md`.
- Standing law re-earns its place: `/audit-guardrails` (R28) sweeps triggers, ⚠ facts and contradictions on command — proposals only, the maintainer rules. Every round wrap asks out loud: did this round fire any standing Revisit-when trigger?
