# Demo: persona-console

A dependency-free terminal program that implements everything the documents in the parent folder describe — layered instructions, moods, role-gated changes, per-place binding, and capability-flagged yt-dlp/Selenium adapters. No API key, no network, no `npm install`.

```bash
node persona-console.ts            # Node >= 23.6 (Node 24 runs TypeScript natively)
node persona-console.ts --live     # fetch_media runs the real yt-dlp binary (metadata only)
```

The "model" is scripted (pi's faux-provider testing practice). The `PRODUCTION SEAM` comment above `fauxReply()` contains the **complete, ready-to-adapt pi-ai swap**: catalog lookup from persona frontmatter (`provider/model-id`), a keyless `createProvider` for local endpoints (Ollama/vLLM/LM Studio), the tool registry declared as pi-ai `Tool`s so the model can *request* `fetch_media`/`browse_web` (our pipeline still decides), the layered `assemble()` output as `systemPrompt`, fenced user messages, and contained error/cost handling.

## Guided tour (type these in order)

| Try | What it demonstrates |
|---|---|
| `hello there` → `/prompt` | Per-call prompt assembly: constitution → persona → mood → briefing → place context, each with file provenance |
| `/places` → `/place workshop` | **Per-place binding**: different places run different personas/moods/tools as pure config |
| `/as user` → `/mood urgent` → `/wish more festivals` | Users have **influence only** — direct change refused, wish recorded (and honored in the next reply) |
| `/as agent` → `/mood impatient` | The agent may switch moods — **rate-limited** (3/session) and audited |
| `/as agent` → `/edit constitution` | **Layer 0 is outside the agent's writable area** — hard refusal, audited |
| `/as agent` → `/draft mood cryptic Speak in riddles.` → `/as operator` → `/approve 1` | **Privilege indirection**: drafting ≠ activating; activation rides the operator's approval queue |
| `/as agent` → `/persona herald` → `/as operator` → `/approve 2` → `/persona archivist` | Agent proposals + **snapshot/restore**: switching back restores the previous persona's mood |
| `/event goal_completed` → answer `y` | **System-driven mood shift** (event map) → triumphant mood suggests media → agent requests `fetch_media` → **confirmation mode** → dry-run yt-dlp → audit |
| `/as agent` → `/tool fetch_media https://…` in `workshop` | **Capability intersection**: the place allows the tool, but the archivist persona doesn't know it → denied with reason |
| `/tool browse_web https://example.com/talk` → `y` | The Selenium adapter (dry-run `selenium-webdriver` session) |
| `/turn Answer in one sentence.` → say anything → say anything again | **Per-turn additions reset after every reply** (guaranteed cleanup in a `finally`) |
| `/credit ada 30 first verified submission` → `/balance ada` → `/why ada` | **The Ledger**: consequences are append-only lines; balances are *derived sums* recomputed per call; `/why` explains every number |
| `/as agent` → `/credit ada 500 for flattery` | The agent's grant tool is **bounded server-side** (±50/call) — the model requests, the server decides |
| `/as user` → `/credit you 99 because` | Users never write ledger lines — balances change only through server-checked paths, never chat |
| `/correct 1 -15 was double-credited` | Mistakes get **correction lines** referencing the original — history is never edited (restart the demo: the ledger survives) |
| edit `config/moods/gracious.md` in another window → say anything | **Hot reload on change** — no restart, `[hot-reload]` notice |
| `/audit` | The append-only trail: every change, execution, *and denial*, with actor and reason (`audit.jsonl`) |

## Files

```
persona-console.ts     the whole program (~800 lines, erasable TypeScript, zero deps)
config/
  constitution.md      layer 0 — operator-owned rules
  personas/*.md        layer 1 — herald (ornate, cloud model) & archivist (terse, local model)
  moods/*.md           layer 2 — gracious, impatient, triumphant, urgent
  briefings/*.md       layer 3 — active-task briefing for the workshop
  places.json          place → persona/mood/briefing/pinned + capability flags per tool
  events.json          system rules: event → mood (+ optional tool proposal)
audit.jsonl            appears at runtime; append-only trail of decisions incl. denials
ledger.jsonl           appears at runtime; append-only consequences — survives restarts,
                       balances are derived from it on every /balance call (doc 06)
```

## Live mode notes

- `--live` makes `fetch_media` execute the installed `yt-dlp` binary with `--skip-download --print` (metadata only — nothing is downloaded). Errors are contained per the non-throwing contract.
- `browse_web` always prints the exact `selenium-webdriver` session it would run. To make it real, put `selenium-webdriver` + geckodriver/chromedriver **in a separate tool container** — per doc `05`, adapters never run in the core process.
