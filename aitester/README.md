# aitester/ — the AI playtesting service

Everything that lets an AI play World Console sittings to find bugs and
exploits lives HERE, cleanly apart from the game (`extension/` at the repo
root) and from the shared analysis method (`analysis/`, which serves human
batches too). It lives in the game's own repo on purpose: the wrapper and
the engine version together, and every batch's `meta.md` pins both to ONE
commit. (v1–v2 history: built inside `analysis/`, then a separate repo —
retired 2026-08-03 because the split broke commit stamping and hid the
sibling-path import.)

The game under test is the real one: `aitester/extension/index.ts` imports
the repo's `extension/` UNTOUCHED and only adds `/ai-state` — a text
rendering of what the TUI already shows a human (standing trials, choice
boards, clocks, wounds), so a headless tester sees what a human sees.
Public state only; nothing veiled is exposed.

## Run a batch

```
# from the repo root:
node aitester/tools/ai-playtest.mjs --batch 2026-08-xx-ai-2 --sittings 6 \
     --world dragon-realm --personas squire,sellsword,scribe,bard,peddler,vigil

node aitester/tools/ai-playtest.mjs --selftest        # pure logic (30 checks)
node aitester/tools/wrapper-smoke.mjs                 # /ai-state over crafted gates (9 checks)
```

Each sitting drops a human-contract folder into `aitester/sessions-in/<batch>/`
(session.jsonl, story/, notes.md, summary.md, meta.md). Auditing uses the
analysis kit — in Claude Code:
`/analyze-sessions aitester/sessions-in/<batch>` (or by hand per
`analysis/audit-workflow.md`). Reports for AI batches land in
`aitester/reports/`, beside the batches they judge.

## The files

| File | What it is |
|---|---|
| `ai-playtester.md` | the design doc: architecture, sitting boundary, exploit deck, limits, prior art — and the Phase-3 ruling |
| `ai-playtester-guide.md` | the tester's system prompt: output contract, TASKS-FIRST directive, note discipline |
| `personas/<world>.md` | world-specific persona cards (dragon-realm: squire, sellsword, scribe, bard, peddler, vigil · star-frontier: cadet, hauler, clerk, trader, climber, voidwalker) — the driver appends exactly one |
| `extension/index.ts` | the wrapper: real game + `/ai-state` headless parity |
| `tools/ai-playtest.mjs` | the driver: spawns pi RPC, runs the tester LLM, enforces the sitting boundary, writes the folders |
| `tools/wrapper-smoke.mjs` | crafted-session checks that `/ai-state` renders gates correctly |
| `sessions-in/` | AI batches (gitignored — recorded play) |
| `reports/` | audit reports for AI batches (tracked) |

## The rules that keep findings valid

- **Exactly two dependencies on the rest of the repo, both deliberate:**
  the wrapper's import of the engine under test (`extension/` — the whole
  point), and the audit method (`analysis/` — shared with human batches).
  Everything else here runs and reads standalone.
- **The engine is never instrumented** — the wrapper only ADDS a read-only
  command; game rules, prompts and tools are byte-identical to human play.
- **The sitting boundary lives in the driver** (2 tasks closed / 3rd task
  granted / 24 turns / death / stall / provider error), never in game code.
- **Fresh everything per sitting**: new pi process, new session, new tester
  conversation (guide + one persona card only) — nothing carries over.
- **Tester notes are leads, never verdicts** — the session record decides.
  Human sittings still cover the TUI-only dress (widgets, overlay, bell).
