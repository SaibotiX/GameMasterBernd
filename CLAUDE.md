# CLAUDE.md

World Console: a terminal story game built as extensions on the pi coding agent. The main `README.md` explains how the engine works; this file is about how to work ON the project without breaking its records.

## Where truth lives

| Place | What it is |
|---|---|
| `README.md` | architecture & how the engine works — kept in sync with the code |
| `config/` | the LIVE game content (constitution, worlds + laws, moods, sites) — hot-loaded into the game prompt; edits change play immediately. Match the register; never leave TODO/meta markers in these files |
| `research/design/` | game-design law: `undertakings-goals.md` (the G/F/P/A registry), mechanics spec, research receipts, build log (with its decisions log), design↔code audit (owns ids D1–D12) |
| `research/analysis/` | the playtest method kit; `research/analysis/reports/` is the immutable quality history |
| `research/roadmap/` | product & distribution: decision registry R1–R8, stage specs (friends web → paid beta → public → Steam), platform/business research log |
| `aitester/` | the AI playtesting harness, its batches and reports |
| `data/`, `*/sessions-in/`, `auth.json` | private play & credentials — gitignored, never committed, never shipped |

## The decision guardrail

Before adopting ANY new research finding, plan, or design change:

1. **Check both decision registries for conflicts** — `research/design/undertakings-goals.md` (plus the decisions log in `research/design/undertakings-build.md`) for game design; `research/roadmap/01-decisions.md` (R1–R8) for product and distribution.
2. **A conflict is never resolved silently.** Mark it in the document where the new material lands — `⚠ DEVIATION (R3): <one line on what deviates and why>` — and surface it to the maintainer for a ruling. Neither adopt nor discard the deviating material before the ruling.
3. **Record rulings IN the registry entry, dated** — "(revised 2026-08-05: …)" or "superseded by R9" — never rewrite an entry silently. New decisions take the next free id; ids are never reused.
4. **File new evidence where it belongs:** game mechanics/feel → `research/design/undertakings-research.md`; platform/legal/business/market → `research/roadmap/06-research-log.md` (dated; ⚠-mark fast-moving facts with their re-verify trigger).
5. **End of session: zero silent deviations** — each one either ruled on, or explicitly listed to the maintainer.

## Committing & pushing (decision R9 — standing authorization, no per-commit asks)

- **The commit is the unit of REVERT.** One commit = one logical change: revertible alone, tree green after it. A ruling with N items lands as ~N commits, each as it goes green — never one round-blob. Entangled fixes that can't be verified apart share one commit; independent fixes never do. Tests, docs and registry lines ride WITH the change they describe.
- **Gate before committing:** `node extension/test/unit.ts` when `extension/` changed (seconds); the full recipe before any push. Never commit or push red.
- **Push at verified checkpoints, not per commit:** after a task-group lands verified · ALWAYS before launching an AI batch (meta.md stamps `git log -1`; never commit mid-batch) · at round/session end (no session ends with unpushed work; a marked `wip:` commit is allowed if truly interrupted) · before anything sweeping.
- **Plan commit boundaries when planning tasks** (say them with the task list), close the round with a wrap commit carrying the build-log/round records. Messages: house narrative register, scoped — `<surface>: <what and why in one breath>`. History-rewriting git (amend-after-push, rebase, force-push, reset) stays ask-first.

## House rules

- Never paste raw session JSONL into context — map first (`node research/analysis/tools/session-map.mjs`), then bounded reads of flagged uN spans (`research/analysis/session-anatomy.md`).
- Audit runs propose; the maintainer rules (`research/analysis/audit-workflow.md` §7). Playtest reports are immutable once written — the next batch gets a new file.
- Player copies and any public surface exclude `research/` and `aitester/` (decision R4).
- `research/collaboration/` is the maintainer's self-review corner: OFF-LIMITS — never read, quote, or act on it unless the maintainer invokes `/collab-review` or points to a file there themselves (rationale inside its README; it is evidence-based, not decorative).
- Verification recipe for engine changes: `node extension/test/unit.ts`, headless RPC smoke, and the pseudo-TTY probe for anything touching widgets/overlays (`research/design/undertakings-build.md`).
