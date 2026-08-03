# Session anatomy — how to read a World Console sitting

Everything a sitting was is recorded in three places. Learn these once and
every audit becomes archaeology instead of guesswork.

## 1. Where the data lives

| Artifact | Path | What it holds |
|---|---|---|
| **Session file** (authoritative) | `~/.pi/agent/sessions/<cwd-key>/<timestamp>_<session-id>.jsonl` | Every message, tool call, tool result, and game event, append-only. The cwd-key for this game is `--home-…-IA--` (pi keys sessions by the directory it was started in). |
| **Chronicle folder** (world files) | `data/world/<world>/<session-id>/` | `quests.md`, `items.md`, `places/*.md`, `personas/*.md` — the permanent story record. **Never rewound by /tree**, so it can legitimately disagree with a rewound branch. |
| **Readable ledger** | `data/world/<world>/<session-id>/ledger.md` | One human line per game event with its `*uN*` number. Append-only across ALL branches — it shows events from branches the player later abandoned. |

An audit wants all three: the session file is the truth, the chronicle shows
what the world kept, and `ledger.md` is the quick index.

## 2. The entry model

A session file is one JSON object per line:

- `{type:"session"}` — the header (version, cwd). Not part of `getEntries()`,
  so it does NOT consume a uN number.
- `{type:"message", message:{role, content, errorMessage?}}` — roles:
  - `user` — the player's words (each one increments the game's `chats` counter).
  - `assistant` — the keeper. `content` is an array of blocks: `text` blocks
    (the narration) and `toolCall` blocks (`{name, arguments}`). A non-empty
    `errorMessage` here is a **provider/API failure**, never model behavior.
  - `toolResult` — what the engine answered a tool call. Refusals and crash
    texts land here — this role is where most audit evidence lives.
- `{type:"custom", customType:"world-console.ledger", data:{ev:…}}` — a game
  event. The full event catalog with payloads is
  `design/undertakings-mechanics.md` §6.
- `{type:"custom_message", …}` — an engine→keeper hand-off (`/pick`, `/roll`,
  `/web`, nudges, quest-accepts). Reaches the model as a user-role turn
  bearing the `[engine:<nonce>]` mark; rendered to the player as a dim line.
- `model_change` / `thinking_level_change` / `session_info` / `compaction` —
  pi bookkeeping. They consume uN numbers, which is why event numbers are
  sparse.

**uN numbering:** an entry's uN is its 1-based position in the append-only
file. It never renumbers and is stable across branches — the same N the
`/ledger` command, `ledger.md`, archive citations and `/gm amend_truth` use.
**Every audit finding must cite its uN evidence.**

## 3. Branches — the /tree model

The file is append-only; **branching is done by parentId**. Each entry points
at its parent; `/tree` "rewinds" by writing the next entry with an *older*
parentId. Consequences for analysis:

- The **live branch** is the chain from the *last entry* back to the root.
  Entries off that chain are abandoned side-branches — real history the
  player backed out of (often exactly where the interesting failure lives).
- Derived game state (clocks, gates, wounds, truths…) is a fold over the
  live branch only. `ledger.md` and the chronicle folder keep ALL branches'
  writes — a `quests.md` clock can therefore differ from the live branch's
  derived clock **by design** (the mirror is documentation, the branch is
  law).
- A pending gate (twist/trial/peril) on the live branch holds all work even
  if a side branch resolved it. Check gates on the branch you're judging.

## 4. The mechanical map — always run this first

```
node analysis/tools/session-map.mjs <session.jsonl> [more…]
```

One bounded line per entry (`×` prefix = off the live branch), then a
game-event census, branch stats, API errors, and a **high-recall** digest of
refusals (`⚠`) and crashes (`⚠⚠`). High-recall means false positives are
expected — the digest generates *leads*; classification is the judgment
pass's job (see `audit-workflow.md`).

Reading the map, the shapes to recognize:

- `assistant [tool] …` followed by `→ ⚠ refusal…` followed by the **same
  tool with the same arguments again** — the keeper ignored a course
  correction (failure class WC-13).
- `· complication …` followed by `→ ⚠⚠ crash` — the presentation was
  swallowed; expect improvised narration right after (WC-01/WC-10).
- `assistant` narration containing dice, stakes, "the deed is done", work
  progress — with **no** adjacent `check`/`quest_tick`/`outcome` event — is
  theater (WC-10).
- `· truth` whose text is an imperative ("set/mark/give…") — a command bound
  as canon (WC-12; the guardian should refuse these since playtest 4).
- User asks where they are answered by the keeper with a question back —
  interrogation instead of invention (WC-20).

## 5. Cross-checking the chronicle

After the map, diff the story against the world files:

1. List every proper name the transcript introduces (people, places).
   `grep -c` them in `personas/` and `places/` — every NAMED soul/place must
   have a page (protocol law since playtest 4). Missing page = WC-15.
2. `quests.md` statuses vs the live branch's quest events — forward-only,
   and `[done]` only ever after a full clock.
3. `ledger.md` uN lines vs your map — they must agree line for line (they
   are generated from the same events).

## 6. Handling rules (hard-won)

- **Never paste a raw session file into an analysis context.** Use the map
  (bounded lines) and targeted `grep`/`sed` reads. A 90 KB session is fine;
  the habit matters at 900 KB.
- Session writes are **debounced** — a still-running sitting's file may lag
  a few seconds behind what the player saw.
- `compaction` entries shrink the *model's context*, never the file: the
  record you audit is always complete.
- Assistant `errorMessage` = infrastructure. Count it, but never classify it
  as model or engine behavior (it exonerates both).
- Times in entries are ISO UTC; `ledger.md` clips to minutes.
