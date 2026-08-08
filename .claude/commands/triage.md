---
description: Map a packed multi-topic prompt into ordered threads before any work — every thread judged (implement / clarify / spike / park / icebox / won't-do), coupled topics stay together, blockers jump the queue, deferrals get the maintainer's nod
---

Triage the maintainer's prompt given as: $ARGUMENTS

(If no prompt was given, triage the maintainer's most recent message.
Apply this workflow UNPROMPTED whenever a prompt carries several
separable undertakings — the maintainer packs thoughts as they arrive;
that capture format is correct and stays. Mapping it is this side's
duty: decision R22.)

The prompt is a capture, not a work order. Before ANY work:

1. **Read what the prompt says to read** (its preamble files) — the map
   needs the standing law in view.

2. **Inventory** — list every distinct ask as its own lettered item:
   numbered tasks, sub-questions, rulings handed down, asides buried
   mid-item, trailing thoughts. The maintainer's numbering is evidence,
   not truth: one number can hide two asks; three numbers can be one
   architecture. Nothing goes unlisted — an unlisted aside is a silent
   drop.

3. **Classify each item**: RULING (already decided — record it in its
   registry, dated) · BLOCKER (broken tree or tooling — nothing
   verifies until it is fixed) · QUESTION (wants an answer or a
   confirmation back) · RESEARCH (evidence to gather — filed per
   CLAUDE.md: design → `undertakings-research.md`, product/legal/market
   → `06-research-log.md`) · DESIGN (spec or docs revision) · BUILD
   (code).

4. **Cluster into threads — the coupling test.** Two items share a
   thread when any of: the maintainer marked the connection
   ("Connection: 1) + 2)" is law) · one's output is the other's input
   (research → design → build on one subject) · they touch the same
   surface or would amend the same registry entries — designed apart,
   two documents could answer one question differently. TIE-BREAKER:
   arguable coupling stays TOGETHER — architecture is designed in sight
   of what its siblings do; context is bought back by placement, never
   by splitting coupled work.

5. **Judge each thread — the verdict (R25).** Before ordering or
   placement, every thread and standalone item earns its verdict:
   **implement** (now or a planned round) · **needs-clarification**
   (bounce to the maintainer — nothing is judged while intent is
   ambiguous; R26's gate) · **spike first** (a timeboxed experiment
   when promising but unproven) · **park** (a real future task → its
   owning document, with a named trigger — never the icebox) ·
   **icebox** (declined but revivable → `research/icebox.md`, with a
   revival condition) · **won't-do** (closed, one-line reason → the
   icebox's Closed section) · **duplicate** (fold into its standing
   entry, recurrence +1). The judge's questions, in order, plain
   words and no scores: intent clear? · conflict with standing law
   (both registries — the ⚠ machinery run early)? · core-pillar or
   stage fit — or a NEW DIRECTION, surfaced as exactly that, never a
   silent strike? · need demonstrated by play/build evidence, or
   speculative (YAGNI)? · impact against effort, in words? · does
   deferring kill it? · resurfaced before (check the icebox —
   recurrence is the revival signal)? The verdict line names a
   category — core / enhancement / exotic / infrastructure — exotic
   is a value class, not a smell. Easy calls cost one line, never
   ceremony; the session's own ideas pass the same judge.

6. **Order**: rulings first (instant to record, and they gate work
   downstream) · blockers next (a broken gate blocks every thread that
   must verify) · then threads in dependency order.

7. **Place each thread**:
   - **This session** — the coupled core the maintainer is here to
     steer, whatever needs their back-and-forth, and the blockers.
   - **Subagents, this session** — bounded sweeps and research with a
     defined report shape; the main context receives conclusions,
     never file dumps.
   - **A deferred round** — substantial work independent of the core.
     Park it in its owning document FIRST (build-log next-step, §Now
     next-list, or a coverage-register row) so the R10 opener has
     something to point at. Deferral changes what the maintainer gets
     today — it needs their nod.

8. **Present the map, then work**: the threads with their items,
   kinds and VERDICTS, the order, the placement, the commit
   boundaries (R9 wants them said with the task list), every QUESTION
   found, and any ⚠ DEVIATION the registries raise against an item.
   If a thread is being deferred or verdicted away (park / icebox /
   won't-do), or a coupling call was genuinely close, get the
   maintainer's go before starting; otherwise state the map and begin.
   A single-thread prompt is said in one line — triage that finds
   nothing costs a paragraph, not a ceremony.

9. **Mid-session arrivals** get the same test, immediately: coupled to
   a live thread → absorbed, said out loud; independent → parked on the
   deferred list, said out loud. Never silently absorbed, never
   silently dropped — and "just this small tweak" is an arrival like
   any other: it gets its one-line verdict before it gets code.

Hard rules: the map adopts nothing — the decision guardrail runs inside
each thread as it executes. Every QUESTION in the prompt is answered in
its thread's report; none evaporate. Light scoping reads (a file's
headline, a register row) are fair game before the map; heavy research
is itself an item and goes in a thread. Session close is unchanged law:
R9 wrap, R10 cut, every deferred thread holding an owner and an opener,
unknowns → `09-coverage.md`.
