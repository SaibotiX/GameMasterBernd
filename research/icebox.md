# The icebox — declined ideas, kept cold, never lost (R25)

Created 2026-08-08 (decision R25). Two kinds of no live here: **On ice** — declined for now, revivable when its condition fires — and **Closed** — won't-dos, kept so the reasoning isn't re-litigated. Parked TASKS never land here: a park verdict files into its owning document (roadmap §Now, build-log next-step, coverage row) with a named trigger. The icebox holds only what was DECLINED.

**How it works (binding):**

- The judge (R25, `/triage` step 5) checks this file on every new idea: a returning idea increments its entry's recurrence count instead of getting a fresh entry — independent resurfacing is the strongest revival signal there is.
- Full review at stage boundaries, and riding every `/audit-guardrails` sweep (R28): each On-ice entry either revives (its condition fired), stays (condition named and still live), or — after surviving two reviews untouched — moves to Closed or gets re-argued on the spot. The icebox stays small or it stops being true.
- Reviving an idea is a normal triage entry: it re-enters as an ask and gets judged fresh, with its icebox context in hand.
- Entries are one block each; depth lives in the documents the entry points at.

**Entry format:** `### <name> · <category> · iced <date> · recurrence <n>` — then one line each: the idea · what prompted it · why not now · **revive when:** the condition.

## On ice

### BYO credential doors + the browser vault (R11) · infrastructure · iced 2026-08-08 · recurrence 0
The multi-provider login: own-API-key and OpenRouter-PKCE doors, custody in the player's browser vault (IndexedDB ciphertext, WebCrypto device key, passkey-PRF/Argon2id wrap, tmpfs injection, rotation sync-back, structural wipe) — R11's whole door-and-vault architecture.
Prompted by: R11 designed it 2026-08-05; the maintainer iced it 2026-08-08 — the private beta serves the house lane only (R11/R12 revised).
Why not now: two auth architectures for an invited-friends audience is double the build and support surface for zero added players — the house lane already onboards everyone, and the vault plus door-table upkeep were the checklist's heaviest items.
**Revive when:** a friend asks to play on their own key or model choice · house-lane spend strains the monthly cap · stage-2 auth/billing design re-runs the door table (R5/R11's standing trigger) — whichever fires first; R11 revives as the prepared shape, not from scratch. *(2026-08-10: revival also restores `/limits` to the player command surface — R30 gates it off the house lane, where the gateway strips its headers anyway.)*

### Automated guardrail-freshness runs · infrastructure · iced 2026-08-08 · recurrence 0
Cron- or hook-driven `/audit-guardrails` sweeps, firing without the maintainer invoking them.
Prompted by: the R28 design round — "checked automatically" was half the original ask.
Why not now: the on-command sweep plus the round-wrap trigger question cover the need while sessions run frequently; harness cron is machinery without a demonstrated miss.
**Revive when:** a fired Revisit-when trigger goes unnoticed across two consecutive rounds (lane two failed), or sessions go dormant for months.

### Downloads auto-pruning (the disk watch's enforcement arm) · infrastructure · iced 2026-08-09 · recurrence 0
The reaper's disk watch enforcing the per-volume quota itself: auto-pruning `data/downloads/` over a cap instead of only alarming (02 item 12's "disk quota per volume" clause taken to its enforcement end).
Prompted by: the shipper round built the watch `du`-based and alarm-only; the enforcement arm was proposed alongside and rode to the philosopher, who ruled alarm-only fine (2026-08-09).
Why not now: it deletes player-visible files on a machine's judgment; one friend on a 4 GB box leaves no pressure, downloads are re-fetchable but their loss would still surprise, and the alarm already names the moment a human should look.
**Revive when:** any disk alarm actually fires (the 5 GiB line) · two friends sit over the 2 GiB warn line at once (manual pruning becoming a chore) · or stage-2 sizing re-opens per-volume budgets.

### LiteLLM as the house gateway · infrastructure · iced 2026-08-09 · recurrence 0
Running LiteLLM (plus the Postgres its virtual keys require) as the lane's gateway instead of the adopted own proxy — R12's "LiteLLM-style" made literal.
Prompted by: the house-lane round's item-1 spike weighed both candidates against the real API (`deploy/gateway-spike/`, receipts on the map item).
Why not now: its virtual keys mandate a Postgres service; its cost tables and admin API would sit between the org key and the ledger's own metering; two more services on a 4 GB box buy nothing the ~200-line own proxy didn't just prove — passthrough, caching, streaming, budgets, all green. The spike's LiteLLM harness (compose + config) stays aboard, so a revival is a run, not a build.
**Revive when:** a second PROVIDER (not model) enters the house lane (multi-provider routing is LiteLLM's real value — the aggregator question, 06 §2026-08-08) · virtual-key administration outgrows the own proxy (key rotation/team features becoming real work) · the own proxy fails a receipt the spike can't explain.

## Closed

*(nothing yet — won't-dos land here with their one-line reasons)*
