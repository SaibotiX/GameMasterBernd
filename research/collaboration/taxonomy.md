# Collaboration pattern taxonomy — open, like the failure taxonomy

Strengths are CS-n, improvables CI-n. Mined from real sessions the same
way the game's WC- classes were: free notes first, clustering after.
Never force a moment into an ill-fitting class — new patterns become
CS-NEW-n / CI-NEW-n in a review and are promoted here when they recur.
Ids are never reused.

## Strengths (CS) — name them so they don't erode

### CS-1 · Decision infrastructure before the work
Building the process that catches problems before having the problem:
registries, guardrails, immutable records, re-test loops. The reason long
autonomous sessions stay on rails.
- **Spot it:** a conflict gets caught by a written rule instead of memory;
  a session reconstructs full state from the repo alone.

### CS-2 · Delegation with deviation permission
Stating the observation, proposing a mechanism, AND authorizing the
implementer to overrule the mechanism if analysis serves the intent
better ("first analyze if this is even possible… you may do as fits
best"). Includes flagging the flaw in one's own idea.
- **Spot it:** "if your fix is better, do that" attached to a proposal.

### CS-3 · Evidence with the observation
Verbatim quotes, session ids, file paths, "I asked X and got Y" — the
difference between a settleable question and a vibe.
- **Spot it:** a claim arrives with its reproduction.

### CS-4 · Explicit scope bounding
"Everything else we let be" + "keep it tracked" — closing the door on
sprawl while keeping the record open.
- **Spot it:** a ruling names what is NOT being done.

### CS-5 · Asking instead of nodding
Requesting explanation of unfamiliar terms and verification of suspected
problems rather than assuming either way.
- **Spot it:** "what is X?", "can you check?"

## Improvables (CI) — the practice list

### CI-1 · Unnumbered multi-item rulings
Many concerns in flowing prose. Works when the session tracks carefully;
fails silently when it doesn't — and the maintainer cannot verify
completeness either.
- **Spot it:** 3+ decisions/asks in one message without numbering.
- **Practice:** number every item (1…N); the reply should check them off
  by number.

### CI-2 · Mechanism before intent
Specifying HOW in detail (click behavior, exact UI) without stating the
underlying WHAT-FOR, so an impossible mechanism stalls a deliverable
intent.
- **Spot it:** a detailed spec whose goal must be reverse-engineered.
- **Practice:** one intent sentence first, then the mechanism sketch,
  then "or whatever serves the intent."

### CI-3 · Flakiness reported without an instance
"X is prone to errors" with no failing example — forces re-derivation and
leaves the fix unverifiable against the real failure.
- **Spot it:** a reliability complaint with no query/time/message.
- **Practice:** capture ONE concrete failure when it happens (what was
  asked, roughly when, what came back).

### CI-4 · Missing search-path and budget context
"I can't find it" without where-you-looked; "run a batch" without
scale/cost expectations — the session guesses on your behalf.
- **Spot it:** a report of absence or a go-order with no bounds.
- **Practice:** one clause: "I looked in X" / "keep it under Y".
