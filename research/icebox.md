# The icebox — declined ideas, kept cold, never lost (R25)

Created 2026-08-08 (decision R25). Two kinds of no live here: **On ice** — declined for now, revivable when its condition fires — and **Closed** — won't-dos, kept so the reasoning isn't re-litigated. Parked TASKS never land here: a park verdict files into its owning document (roadmap §Now, build-log next-step, coverage row) with a named trigger. The icebox holds only what was DECLINED.

**How it works (binding):**

- The judge (R25, `/triage` step 5) checks this file on every new idea: a returning idea increments its entry's recurrence count instead of getting a fresh entry — independent resurfacing is the strongest revival signal there is.
- Full review at stage boundaries, and riding every `/audit-guardrails` sweep (R28): each On-ice entry either revives (its condition fired), stays (condition named and still live), or — after surviving two reviews untouched — moves to Closed or gets re-argued on the spot. The icebox stays small or it stops being true.
- Reviving an idea is a normal triage entry: it re-enters as an ask and gets judged fresh, with its icebox context in hand.
- Entries are one block each; depth lives in the documents the entry points at.

**Entry format:** `### <name> · <category> · iced <date> · recurrence <n>` — then one line each: the idea · what prompted it · why not now · **revive when:** the condition.

## On ice

### Automated guardrail-freshness runs · infrastructure · iced 2026-08-08 · recurrence 0
Cron- or hook-driven `/audit-guardrails` sweeps, firing without the maintainer invoking them.
Prompted by: the R28 design round — "checked automatically" was half the original ask.
Why not now: the on-command sweep plus the round-wrap trigger question cover the need while sessions run frequently; harness cron is machinery without a demonstrated miss.
**Revive when:** a fired Revisit-when trigger goes unnoticed across two consecutive rounds (lane two failed), or sessions go dormant for months.

## Closed

*(nothing yet — won't-dos land here with their one-line reasons)*
