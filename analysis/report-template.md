# Report template — copy for each batch: `reports/<YYYY-MM-DD>-<batch>.md`

Rules baked into the shape: summary sorted by **Severity → Sessions
affected → Incidents**; every finding cites uN evidence; every S1/S2 was
re-verified against the raw record; one concrete proposed fix per class.

---

```markdown
# Session audit — <batch name>, <date>

## Environment
| | |
|---|---|
| Sessions analyzed | N (list ids or tester names) |
| Total player turns | N |
| pi version | x.y.z |
| Extension commit | <hash> — <one-line description> |
| Model(s) | provider/id |
| Infrastructure failures (WC-04) | N incidents in N sessions (excluded from behavior findings) |

## Verdict in one paragraph
<What kind of batch was this? What is the single most damaging class, and
what one fix buys the most? Is anything fixed-last-round recurring?>

## Summary — sorted by Severity, then Sessions affected, then Incidents

| Class | Name | Sev | Sessions affected | Incidents | Status | Fix surface |
|---|---|---|---|---|---|---|
| WC-xx | … | S1 | 3/4 | 11 | NEW / KNOWN / REGRESSION | engine code |
| NEW-1 | … (proposed Sx) | S2 | 2/4 | 3 | NEW CLASS | prompt |
| … | | | | | | |

Status legend: NEW = first seen · KNOWN = open from a prior report ·
REGRESSION = was fixed, recurred (link the fixing round) · WONTFIX = ruled
a non-issue by the maintainer (link the ruling).

## Findings

### WC-xx · <name> — S<n> · <sessions>/<total> sessions · <k> incidents
- **What happened:** <one honest paragraph, written for someone who did
  not read the sessions.>
- **Evidence:** session <id> u<a>–u<b> ("<short quote>"); session <id>
  u<c> …  <every incident, or the 3 clearest plus a count>
- **Player experience:** <what the tester saw/felt — from their notes.>
- **Root cause:** <engine / prompt / side-call / pi API / design — be
  specific: file and mechanism when known.>
- **Proposed fix:** <one concrete change. If it is a design decision
  rather than a bug, say so and pose the question for the ruling.>
- **Verification:** <how we'll know it's gone: unit test, smoke,
  TTY probe, or a targeted scenario for the next batch's testers.>

<repeat per class, S1 first>

## New classes discovered
| Id | Proposed name | Proposed sev | Definition (one line) | Promote to taxonomy? |
|---|---|---|---|---|

## What went RIGHT (keep short, keep it)
<Machinery that fired correctly under pressure — the self-heals, refusals
that steered, gates that held. This is how we notice a fix earning its
keep, and what must not be broken by the next round.>

## Per-session appendix
### <session id / tester>
- Duration, turns, world, renown reached, quests touched, deaths.
- Map digest highlights (⚠/⚠⚠ lines that mattered).
- Notes-to-record pairings (tester note ↔ uN span).
```

---

Immutability: never edit a shipped report — corrections go in the next
one. The report series is the project's quality history.
