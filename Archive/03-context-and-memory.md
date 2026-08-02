# 03 — Contexts and Memory: Many Places, Per-User Records, Freeze/Thaw

One shared blob of everything does not scale past a handful of users. The agent's working memory is therefore deliberately **split**, and long-term memory lives in **tiers**.

## Per-place core context

Each place where the agent is present has its **own conversation context**: that place's recent transcript, its pinned state (active tasks/goals, rules digest, status summaries), and its persona/mood. A task-focused place carries task context; a social place carries social context.

**Cross-place knowledge travels through the *database*, not through prompt context.** If something completes in one place, the agent in another place learns it by *reading state*, not by sharing a transcript. This keeps every prompt small, prevents context bleed between places, and means adding a hundredth place costs the same as the second.

## Per-user memory

Every user has a memory record the agent maintains:

- profile facts, notable deeds, running performance, preferences;
- the agent's **disposition** toward them — favor/displeasure as a *data value*, which can improve again (redemption is a feature; the exact change rules stay deliberately open).

An **always-available index** (one line per user) tells the agent who exists; the **full record loads on demand** when it actually deals with that user. Disposition may color tone — but consequences (scores, penalties, privileges) only ever flow through server-checked paths, never from a mood or a grudge.

**Input fencing (safety):** user messages enter the prompt as speaker-tagged *data* (`<msg user="ada" t="…">…</msg>`), never as instructions; identities are asserted by the server, so impersonation attempts render as visibly quoted user text.

## Freeze/Thaw: remembering everything without an ever-growing prompt

| Tier | What lives here | Where |
|---|---|---|
| **Hot** | Always in the prompt: rules digest, active tasks, recent transcript window, user index | assembled per call |
| **Warm** | Summaries: compacted older history per place, per-user digests | files/DB, loaded when relevant |
| **Frozen** | Everything, verbatim: full transcripts, all submissions, all ledger events | database |

- **Freezing** happens continuously: when a place's history outgrows its window, an AI pass summarizes the old span into Warm (iteratively — each new summary builds on the previous one) and the verbatim text stays Frozen in the database. **Nothing is deleted**; it just leaves the working context.
- **Thawing** is trigger-driven: certain actions make the system check Frozen storage and pull matching material back into context. Triggers: a user's name comes up → their record loads; a task/topic is referenced → its history loads; the agent explicitly searches ("what did ada submit for the tower task?") via a lookup tool over the database — full-text search first, semantic/embedding search as an upgrade.
- **Practical note:** this is a solved pattern in the pi ecosystem — existing memory extensions (e.g. `pi-hermes-memory`: SQLite full-text search + auto-consolidation; `pi-memory`: semantic search over logs) implement exactly this hot/warm/frozen shape and serve as reference implementations or direct dependencies. Their caveat: they assume a single user, so multi-user products adapt the *pattern* (per-place, per-user partitions) more than the plug-in.

## How this connects to the other pieces

- The **instruction layers** (`02`) say who the agent *is*; the context system says what it currently *knows*. Both are assembled per call, in that order.
- **Mood shifts don't touch memory**: switching `gracious → urgent` changes layer 2 only; transcripts, pinned state, and user records ride along unchanged.
- **Tool results** (e.g. a yt-dlp-fetched transcript, a Selenium-fetched page — see `05`) enter context as *fenced data*, get used, and then freeze like everything else: stored verbatim, summarized into Warm, thawed on demand.
