# gateway-spike — map item 1's proving ground

The house lane needs a gateway: pi speaks anthropic-messages at it with a
per-friend VIRTUAL key, it speaks at api.anthropic.com with the ORG key (R29),
and its meter is the billing source of truth (02 §house lane). R12 named a
"LiteLLM-style" SHAPE, not a dependency — this spike runs both candidates
through one probe and lets receipts decide:

| | Candidate A: LiteLLM | Candidate B: own proxy |
|---|---|---|
| pieces on the box | LiteLLM (Python) **+ Postgres** (virtual keys require it) | one node process (~200 lines — adopted, now living at `deploy/host/gateway/gateway.js`), spend as JSONL |
| metering | its cost tables, its DB | our price table (R29's re-verified numbers), our file — the same rows the ledger (item 3) needs anyway |
| org-key custody | inside its container/env + admin API surface | env of one process, no admin surface |

## Run

```bash
cp .env.example .env          # paste the house key from the password manager
./run.sh own                  # candidate B
./run.sh litellm              # candidate A (docker; first boot takes minutes)
```

A full run costs about **one cent** upstream (one ~5k-token cache write plus
tiny turns, Haiku prices). Legs: turn flows · streaming intact ·
`cache_control` passes with a cache hit on the receipt · exhausted budget
refuses cleanly · **pi itself** through the gateway via the 3-line override in
`pi-project/.pi/extensions/gateway.ts` (that file is the real shape item 2
lands in the game's own `.pi/extensions/`).

## Where results land

The shape decision annotates map item 1 (`deploy/README.md` §next round) and
the round's state note carries the receipt summary at wrap — build receipts
live in the runbook, as every round before. The probe grows into localcheck's
gateway leg in item 2. `usage.jsonl` and `.env` are gitignored; the org key
never enters git, an image layer, or a transcript.
