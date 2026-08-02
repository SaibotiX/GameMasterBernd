# 02 — Layered Instructions: Constitution, Personas, Moods, Briefings

The agent's identity and behavior are **an ordered stack of small files**, assembled into the AI's system prompt per call. Each layer has its own **priority**: lower layer number = higher authority and slower change cadence; higher layers add specificity and color but never override what sits below them.

## The layers

```
config/
  constitution.md        # layer 0 — operator-owned rules: allowed action shapes, banned content,
                         #   voluntariness, explainability duties. The agent cannot edit this.
  personas/*.md          # layer 1 — identity: voice, formality, lore, reply policy defaults
                         #   (frontmatter: name, model, judge_model, default_mood, language …)
  moods/*.md             # layer 2 — small tone modifiers (gracious, impatient, cryptic,
                         #   ceremonial, triumphant, urgent …)
  briefings/*.md         # layer 3 — injected while a given task/goal/situation is active
```

| Layer | Priority / cadence | Typical size |
|---|---|---|
| 0 constitution | Highest authority; changes rarely; one owner (the operator) | a page |
| 1 persona | Stable identity; swapped deliberately | half a page + frontmatter |
| 2 mood | Small tone modifier; switches often, even mid-session | a few lines |
| 3 briefing | Situational; lives exactly as long as its task/goal is active | a few lines |

- **Assembly order per call:** constitution → persona → mood → active briefing → place context → per-turn additions. **Per-turn additions reset after every reply** (implemented with a guaranteed cleanup — pi clears its per-turn prompt override in a `finally`), so temporary morphing can never leak into the next turn.
- **Hot-swap:** persona/mood files reload on change or on an operator `/reload`. Switching personas snapshots the previous state and restores it when switched back.
- **Progressive disclosure keeps it bounded:** the stack carries the *active* files only; everything else is an index the agent can pull from on demand.

## Who or what changes what (generalized)

The role names vary by project (sysop, admin, GM, owner…), but the **authority model** is always the same four actors. The principle: *the closer an actor stands to untrusted input, the less direct write access it gets — and everything consequential rides one privileged, audited path.*

| Actor | May change | How |
|---|---|---|
| **Operator** (the human owner/admin) | Anything, anytime — sole writer of layer 0 | Direct privileged commands (`/persona`, `/mood`, `/reload`, file edits) |
| **The agent itself** | May *draft* persona/mood edits (layers 1–2) and *propose* activation | Through the **same privileged command path the operator uses** — audited, rate-limited, revocable. Layer 0 is outside its writable area entirely |
| **Participants** (players, users, guests) | Nothing directly — **influence only** | Wishes, feedback, requests the agent may honor in character; never a config write |
| **The system** (code, schedulers, game/world state, monitors) | Event-driven mood (and briefing) switches | Declared `event → mood` rules in config — e.g. a goal completes → `triumphant`; a deadline nears → `urgent`; an incident opens → `terse`; a VIP arrives → `gracious` |

Notes that make this safe in practice:

- **Drafting ≠ activating.** The agent writing a new mood file changes nothing; activation is a separate, privileged, logged step (pi's "self-modification through privilege indirection": tools write drafts, only commands reload).
- **Every change is a ledger-style event:** who, what, when, why — so any behavior shift is explainable after the fact.
- **System rules are config, not code:** adding a new trigger ("stream goes live → `ceremonial`") is a line in the event map.

## Per-place binding (generalized): different places, different moods

Each **place** — a chat lobby, a support channel, a Discord server, a terminal session, a product surface — names its persona and default mood as **pure config**:

```json
{ "hub":      { "persona": "herald",    "mood": "gracious" },
  "workshop": { "persona": "archivist", "briefing": "summarize-talk" },
  "backstage":{ "persona": "herald",    "mood": "urgent" } }
```

- The same engine runs **differently-behaving instances of one character** — or entirely different characters — per place, with zero code.
- A place can also override capabilities (which tools are allowed there — see `05-selenium-yt-dlp-tools.md`) and reply policy (when the agent speaks at all).
- Mood changes are **per place**: the workshop's agent turning `urgent` near a deadline does not make the hub's agent urgent. Cross-place knowledge travels through shared state (the database), never through shared prompts (`03-context-and-memory.md`).

## Why this design

1. **Nothing hardcoded.** Personality, tone, situational behavior, even which model answers — all editable files, hot-reloadable at runtime.
2. **Priorities make conflicts boring.** "Cryptic mood" can never overrule "banned content" because layer 2 is assembled *after* and *under* layer 0's authority; safety lives at the bottom of the stack, color at the top.
3. **Moods are cheap, personas are stable.** Because a mood is a few lines layered onto an unchanged identity, the system can shift tone constantly (event-driven!) without ever re-writing or re-testing the character.
4. **A prompt alone is not enforcement.** The stack shapes *behavior*; anything with consequences (scores, penalties, config activation, tool execution) is checked server-side on a privileged path. The model requests; the server decides.
