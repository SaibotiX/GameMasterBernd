# 06 — The Ledger: Append-Only Consequences

Everything in `02` (personas, moods, briefings) shapes how the agent *talks*. None of it may decide what anyone *gains or loses*. That split — **mood and drama are theater; consequences come from the Ledger** — needs one more piece of machinery:

> The **Ledger** is the product's accounting book. It is a single list of records, each saying: *"at time T, user X gained or lost amount Y of thing Z, because R."* The list is **append-only**: the system only ever adds new lines at the end — no line is ever edited or deleted. If a mistake happens, we don't erase it; we add a *correction line*.

Why build it this way:

- **Every balance is derived.** A user's XP (or credit, or reputation) is not a number we overwrite; it is the *sum of their ledger lines*. The displayed value is just a cached total that can always be recomputed.
- **Everything is explainable.** "Why do I have 340 XP?" has an exact answer: these lines, these reasons. The agent can narrate any user's history straight from it — and disputes are resolvable by looking.
- **Nothing is corruptible quietly.** A bug or an exploited AI can only ever *add* traceable lines, never silently rewrite history.
- **"A consequence comes from the Ledger" means:** mood and drama are theater, but you only actually lose or gain something when a ledger line is written — and lines are written only by server-checked code paths, never by chat.

Technically it is one database table (`ledger`) plus append-only siblings (`messages`, `verdicts`).

## Generalized: this fits any consequence system

The pattern is not game-specific. XP, prepaid AI credits, billing, reputation, quotas, rate budgets — anything where "how much does X have, and why?" must have a defensible answer is a ledger `kind`. Adding a new currency is *data* (a new `kind` value), not schema. Corrections are compensating entries, exactly as in double-entry accounting.

## How it composes with the other pieces

- **Instruction layers (`02`):** the constitution imposes the *duty* to explain; the ledger makes explanation *structural* — the reason field is mandatory at write time, not reconstructed later.
- **Who changes what, extended to value:** the operator may write any line; **the agent gets bounded, server-checked tools** (`credit` / `penalize`, capped per call by the stakes that were stated up front) — it *requests*, the server validates and writes; users never write, they earn; the system writes through task/verdict pipelines. Every path is audited.
- **Audit log vs. Ledger:** two append-only records with different jobs. The *audit log* captures every decision including denials ("agent asked to credit 500 → denied: over bound"); the *ledger* captures only what actually changed a balance. Read together, they answer both "what happened?" and "what was attempted?".
- **Tools (`05`):** a yt-dlp fetch or Selenium browse never touches a balance either — if a fetched submission earns something, that's a *verdict* followed by a *ledger line*, each with its stored reason.

## Example code (the whole shape)

```ts
interface LedgerLine {
  id: number;                 // monotonically increasing — appended, never edited
  t: string;                  // at time T …
  user: string;               // … user X …
  kind: string;               // … of thing Z ("xp" | "gold" | "credit" | …, open set)
  amount: number;             // … gained or lost amount Y …
  reason: string;             // … because R (mandatory — no line without a reason)
  actor: string;              // which server-checked path wrote it
  corrects?: number;          // corrections reference the mistake; history stays intact
}

// Every balance is derived — summed on demand, cached at most, never authoritative elsewhere:
const balance = (lines: LedgerLine[], user: string, kind: string): number =>
  lines.filter(l => l.user === user && l.kind === kind)
       .reduce((sum, l) => sum + l.amount, 0);

// "Why do I have 40 XP?" — the exact answer, straight from the record:
const why = (lines: LedgerLine[], user: string): string[] =>
  lines.filter(l => l.user === user)
       .map(l => `#${l.id} ${l.amount >= 0 ? "+" : ""}${l.amount} ${l.kind} — ${l.reason}`);

// A mistake? Never edit — append a compensating line:
append({ id: next(), t: now(), user: "ada", kind: "xp", amount: -15,
         reason: "correction: #41 was double-credited", actor: "operator", corrects: 41 });
```

**Runnable version:** the demo (`demo/persona-console.ts`) implements this against an append-only `ledger.jsonl` that survives restarts — `/credit`, `/penalize` (operator free; agent bounded to ±50 per call; users refused), `/balance` (derived sum, recomputed on every call), `/why` (the lines and reasons), `/correct` (compensating lines only).
