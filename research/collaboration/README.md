# The collaboration corner — the maintainer reviews the maintainer

The playtest audit points the RITE loop at the keeper. This folder points
the same loop at the MAINTAINER's own collaboration craft: how well their
messages steered the AI, what worked, what recurred, what improved.

## THE BOUNDARY (read this first — it is the whole point)

**This folder is OFF-LIMITS to the AI during normal work.** No session may
read, quote, or act on anything under `research/collaboration/` unless the
maintainer explicitly invokes `/collab-review` or points at a file here
themselves. This is not secrecy for its own sake — it is evidence-based:

- MIT (Feb 2026) found that a condensed user profile in a model's memory
  was the single strongest driver of sycophantic agreement, measured over
  two weeks of real daily-life conversations
  ([MIT News](https://news.mit.edu/2026/personalization-features-can-make-llms-more-agreeable-0218)).
- PersistBench (2026) names the two failure modes exactly: **cross-domain
  leakage** (memories injected where they don't belong) and
  **memory-induced sycophancy** (stored context insidiously reinforcing
  the user's biases) ([arXiv](https://arxiv.org/html/2602.01146)).

A standing "the maintainer tends to…" profile in every session would make
the AI more agreeable and less honest — the exact opposite of what this
folder exists to produce. So the coaching history stays here, loaded only
on invocation; the ONLY thing designed for other sessions' eyes is
`handoff.md`, and even that is opt-in (the maintainer points to it when
they want a session to adapt; it is written as mechanical instructions to
the AI, never as judgments about the person).

## How it works (mirrors `research/analysis/audit-workflow.md`)

1. **Invoke** `/collab-review` at the end of a working session (or
   mid-session for the conversation so far). Only the maintainer starts it.
2. **Free notes first** — the AI re-reads the conversation and notes
   concrete moments before classifying (open coding; same discipline as
   the playtest audits). Every finding is anchored to a quoted moment and
   written in SBI form — Situation, Behavior, Impact — observable and
   judgment-free ([CCL's model](https://www.ccl.org/articles/leading-effectively-articles/closing-the-gap-between-intent-vs-impact-sbii/),
   [untools summary](https://untools.co/situation-behavior-impact/)).
3. **Classify** against `taxonomy.md` — strengths (CS-n) and improvables
   (CI-n). The taxonomy is OPEN: unmatched patterns become CI-NEW-n /
   CS-NEW-n and are promoted when they recur.
4. **Trend** against `registry.md`: IMPROVED / RECURRING / NEW / RETIRED,
   with streaks — "where I failed again, where I improved" is the entire
   value of keeping history (track → reflect → improve, the same cycle as
   any deliberate practice log).
5. **Write** the immutable dated review to `reviews/` (never edited after;
   corrections go in the next one — the series is the history). Update
   `registry.md` in place, dated, never silently rewritten. Refresh
   `handoff.md` only when a STABLE pattern changes.
6. **One focus.** Every review ends by naming exactly ONE improvement to
   practice next session — deliberate practice works on one thing at a
   time, not a list of ten.

## Honesty clause

The known failure mode of this workflow is flattery. A review that finds
only strengths, softens a recurrence, or retires a pattern without
evidence is a FAILED review — the MIT finding above is what that failure
looks like at scale. Recurrences are stated plainly, with the streak.

## Files

| File | What it is |
|---|---|
| `taxonomy.md` | the open pattern vocabulary (CS-n strengths, CI-n improvables) |
| `reviews/` | immutable dated reviews, one per invocation — the history |
| `registry.md` | per-pattern trend table (first seen, last seen, status, streak) |
| `handoff.md` | the OPT-IN ≤10-line distillate a session may be pointed to for adaptation |

Committed to git like every other record here (R4 already keeps
`research/` out of player copies); gitignore the folder instead if it ever
starts to feel too personal for the remote.
