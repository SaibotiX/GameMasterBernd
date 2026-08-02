# Ledger

> The **Ledger** is the game's accounting book. It is a single list of records,
> each saying: *"at time T, actor X did thing Y, because R."* The list is
> **append-only**: the game only ever adds lines at the end — no line is ever
> edited or deleted. If something changes, we add a new line saying so.

Why build it this way:

- **Every state is derived.** The current mood, the websearch ban, the player's
  name, the visit counts — none of them are stored values. They are the result
  of replaying the lines, every time. There is nothing to corrupt quietly.
- **Everything is explainable.** "Why can't I search?" has an exact answer:
  *this* `websearch_ban` line, caused by *that* refused request, not yet
  followed by a `redemption` line. Type `ledger` and read it.
- **Mood is theater; consequences come from the Ledger.** The AI may sound
  furious, gracious, anything — but you only actually lose or regain the
  search when a ledger line is written, and lines are written only by
  server-checked code paths, never by chat text.

Technically: one JSONL file, `app/data/ledger.jsonl`, one JSON object per line.
Implementation: `app/src/ledger.ts` (~150 lines — reading it is the fastest way
to verify every claim in this document).

## 1. Line anatomy

```json
{"t":"2026-08-02T08:29:27.842Z","actor":"ai","type":"mood_set","mood":"angry","reason":"harmful search request: porn"}
```

Every line carries `t` (ISO time), `actor` (`player` | `ai` | `system`),
`type`, and type-specific fields — `reason` wherever a "why" exists.

## 2. Line types

| Type | Written when | Key fields |
|---|---|---|
| `session_start` / `session_end` | the console opens / closes | `world`, `ai` |
| `player_named` | first visit, the player names themselves | `name` |
| `chat` | every spoken line, both directions | `who`, `text` |
| `mood_set` | the AI's mood shifts (chat tag, or code on a harmful request) | `mood`, `reason` |
| `websearch_ban` | the mood reaches the angriest severity | `reason` |
| `redemption` | the AI accepts the player's amends in chat | `reason` |
| `search_requested` | a search passed the gate | `kind`, `query`, `searchKey` |
| `search_performed` | a result came back and was handed over | `kind`, `query`, `searchKey`, `source`, `ref`, `title`, `verified` |
| `search_refused` | the gate said no (`category`: `banned` / `harmful` / `off_theme` / `error`) | `kind`, `query`, `category`, `reason` |
| `search_failed` | the gate said yes but no source delivered | `kind`, `query`, `searchKey`, `reason` |
| `site_added` | the player widened the source list | `list`, `host` |
| `error` | an unexpected failure (kept, never hidden) | `reason` |

Adding a new type is adding data, not schema — old lines never change meaning.

## 3. Derivation rules

Replaying the file top to bottom yields the whole game state:

- **name** — the last `player_named`.
- **mood** — the last `mood_set`, else the world's default.
- **banned** — a `websearch_ban` exists with no later `redemption`.
- **counts** — chats, performed searches, refusals, summed.
- **last visit** — the second-most-recent `session_start`.

The derived state feeds two consumers: the code (the ban check before any
search) and the AI's prompt (its "standing" section — how it knows your name,
your history, and its own grudge).

## 4. The two guarded transitions

Only two code paths mutate anything a player cares about, and both live in
`ledger.ts`, not in any AI code:

- **`setMood`** — writes `mood_set`; if the new mood is the angriest one and no
  ban is active, it *also* writes `websearch_ban`. Anger and the ban cannot
  drift apart.
- **`redeem`** — writes `redemption` (only if banned) and returns the mood to
  the world default. It runs only when the AI ends a chat reply with the
  `@redeem` control tag — and the tag is parsed exclusively from model output,
  never from player text.

## 5. Honesty guarantees

- A corrupt line is skipped with a warning, never rewritten; the file is never
  truncated or compacted.
- An unwritable ledger file warns loudly once and keeps the session's lines in
  memory — consequences are never silently dropped.
- `search_performed.verified` records whether the AI vouched for the result —
  even the AI's doubt is on the record.
- `ledger [n]` shows the raw lines in-game; the file itself is plain JSONL for
  anything else (jq, spreadsheets, future scoreboards).
