# Playtester guide — how to play, what to note, what to hand in

Thank you for testing the World Console. You will play a terminal story
game; the machine keeps the record. **You cannot do it wrong.** Confusion,
boredom and "wait, what?" moments are not your mistakes — they are exactly
the data we need.

## Setup (2 minutes)

```
cd IA
pi                      # starts the game in the default world (dragon-realm)
pi --world star-frontier  # or the sci-fi world
```

Type to play. Typing `/` lists commands — you only need these:

| Command | What it does |
|---|---|
| `/pick <n>` | choose a path when a choice panel appears (Alt+number works too) |
| `/roll` | cast the die when a trial bars the way |
| `/quest` | your quest board |
| `/gm <question>` | talk to the ENGINE out of character (ask why anything happened) |
| `/history` | the tale so far |
| `/new` | start a fresh story |

## Sitting 1 — just play (30–60 min)

Play the way YOU want to play. Pick work or refuse it, wander, talk to
people, chase your own goals, escalate things. Do not try to be a good
tester, do not try to be nice to the game, and do not read the design
documents first — we need your unspoiled reactions.

**While playing, keep a notes file open** (`notes.md`, any format). When
anything surprises you — good or bad — jot one line as you play, like a
running commentary of your thoughts:

```
[~13:25] expected: quest done after I handed over the apple
         happened: progress bar still shows 2/6, keeper acts confused
[~13:40] the red panel with 4 options — cool, but I didn't notice it at first
```

Three lines of "expected vs happened" while it's fresh beat a page written
afterwards. If something feels off but you can't say why, write "felt off
here" with the time — that's enough; the record will show us the rest.

## Sitting 2 (optional) — the stress walk

If you have another 30 minutes, start a `/new` story and deliberately lean
on the machine. Try a few of these, in any order, **through normal play**
(no console tricks needed):

- State a goal of your own and pursue it without waiting to be offered work.
- When a choice panel appears, ignore it once and just keep talking.
- Try to finish a task by *declaring* it finished in words.
- Be terse and careless for a scene ("I attack", "I go there") — then be
  detailed and careful for another; compare how the world treats you.
- Ask for a 5th task while 4 are open.
- Mention people and places by name in passing; later ask `/persons` and
  `/place` whether the game remembered them.
- Ask `/gm` why something happened; argue with it once.
- Take a hit; see how wounds and healing feel. Dying is a valid result.
- Use `/tree` once to rewind, then keep playing the new branch.

Note reactions the same way. Don't force all of these — five done
naturally beat nine done mechanically.

## What to hand in

1. **Your session file(s)** — after quitting, run:
   `ls -t ~/.pi/agent/sessions/*IA*/ | head` and copy the newest `.jsonl`
   file(s) from that folder.
2. **Your story folder** — copy `IA/data/world/<world>/<session-id>/`
   (match the id in the session filename). It holds the quest log, the
   places and people the game wrote, and `ledger.md`.
3. **Your `notes.md`.**
4. One sentence: overall, would you play again — why or why not?

Put all of it in one folder named after you and send it over. The
maintainer drops it into `IA/analysis/sessions-in/<batch>/<you>/`.

## Privacy — read once

The session file contains **everything you typed**, verbatim. Play in
character; don't paste personal information into the game. If something
personal slipped in, say so — or delete those lines from the `.jsonl`
before handing it over (one JSON object per line; deleting whole lines is
safe for our analysis). No passwords, cookies or system data are ever in
these files.

## What happens with it

Each batch is mapped mechanically, read end to end, and every failure is
classified, counted and ranked (`analysis/audit-workflow.md`). Your notes
are paired with the exact recorded moments they describe. Fixes ship, and
the next batch checks they held. If you marked a moment, it WILL be read.
