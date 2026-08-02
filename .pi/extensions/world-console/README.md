# World Console — pi extension (full port)

The game running inside the stock [pi coding agent](https://github.com/earendil-works/pi): pi contributes the terminal UI, model switching (`/model`), sessions (`/new`, `/resume`, `/fork`, `/tree`, `/compact`, `/export`), and auth (`/login`); this extension turns it into the game.

## Run

```bash
cd <repo root>
pi                          # trust the project once when asked
pi --world star-frontier    # pick a world (default: dragon-realm)
```

`WORLD_CONSOLE_WORLD=star-frontier pi` works too. Talk to the keeper, or invoke the scrying glass directly:

```
/web text basalt              # knowledge from the chronicle sites
/web picture aurora borealis  # image downloaded to app/data/downloads/
/web video komodo dragon      # ~10 s clip via yt-dlp (slow)
```

Typing `/` lists the commands with their descriptions; after `/web ` the first argument autocompletes (`text` / `picture` / `video`). `/web` is not a raw fetch: the engine refuses it outright while the glass is barred (recorded in the ledger, no LLM call), otherwise it hands the request to the game master, who judges it against the world's theme in character and performs it through the matching tool. `/ledger [n]` shows this sitting's game ledger.

## How it works

- **Prompt takeover** — `before_agent_start` replaces pi's coding prompt each turn with the layered game-master prompt (constitution → world → mood → standing → control protocol) assembled fresh from `app/config/` (hot reload; broken edits keep the last good config).
- **Tools instead of tags** — the built-in coding tools are stripped; the model gets exactly:
  | tool | purpose |
  |---|---|
  | `find_text` | MediaWiki text search over `app/config/sites.json` text hosts |
  | `find_picture` | MediaWiki file search (Commons by default); best match downloaded to `app/data/downloads/` |
  | `find_video` | yt-dlp (vendored source) via YouTube search; ~10 s ffmpeg clip, or shortest video without ffmpeg |
  | `set_mood` | mood shifts; setting the angriest mood makes the engine bar the glass (code-owned invariant) |
  | `grant_redemption` | lifts the bar after sincere amends; no-op unless barred (code-owned invariant) |
  | `record_name` | stores the seeker's name for the standing layer |
  The old `@mood(...)`/`@redeem` text tags are gone — the app's ledger showed models forget magic text lines exactly when they get theatrical; they do not forget tool calls.
- **The ledger lives in the session** — every game event (`world`, `player_named`, `mood_set`, `websearch_ban`, `redemption`, `search_requested/performed/refused/failed`) is a custom entry (`world-console.ledger`) in pi's session file. All state is derived by folding the **current branch** (`sessionManager.getBranch()`), so:
  - `/new` = fresh ledger, `/fork` copies it, `/tree` rewinds it; branches never interfere.
  - `/compact` shrinks the LLM context but never touches ledger entries — derived state is unchanged.
  - **One world per session**: the first event stamps the world; a resumed session keeps its stamped world even if `--world` disagrees (the app's world-mixing bug cannot happen here).
- **The ban is code-enforced** — while barred, a `tool_call` handler blocks every `find_*` lens (recording `search_refused`) and each tool's own execute guard throws as a second layer. Narrated barring without the tool call changes nothing, and the standing layer shows the true state every turn.
- **Footer** — pi's stock stats line (cost, `(sub)`, context %, model • thinking; rendered by the real `FooterComponent`, so formatting matches stock exactly) with the game line below it (`<voice> · mood: <mood>[ · glass BARRED] · <world title>`) and no directory line.

## Tests

```bash
node .pi/extensions/world-console/test/unit.ts          # pure logic, no pi, no LLM (network: Wikipedia)
node .pi/extensions/world-console/test/integration.ts   # real pi over RPC; Part A costs no LLM tokens
```

- **unit.ts** — ledger derivation, the ban/redemption invariants, branch isolation, config-loader equivalence with `app/src/config.ts`, prompt layers, search adapter (incl. abort).
- **integration.ts Part A** (crafted session files, no LLM) — banned-branch derivation, leaf-rewind to a pre-ban branch (the `/tree` mechanism), stamped-world-beats-`--world`.
- **integration.ts Part B** (live LLM) — no search possible while barred, redemption flow, search after redemption, name recording, `/compact` shrinks context while the ledger survives, `new_session` starts a fresh ledger.
- **integration.ts Part C** — `/web`: a clean session hands the request to the GM (performed entry recorded), a barred session is refused by the engine with no LLM call; `WC_VIDEO=1` adds the slow end-to-end video download. `test/demo-web.ts` is a watchable demo of the same flows.

Known soft spot: whether the *model* ever attempts `find_text` while barred is model temperament (it is told it is barred and usually refuses in character); the code block behind it shares the exact `banned` check the unit tests cover.

## Notes

- Mood is per session (branch-aware), not global like `app/data/ledger.jsonl` — a punishment ends with `/new`. If cross-session grudges are ever wanted, add a small global profile file.
- Adding a mood file mid-session updates prompts on the next turn, but the `set_mood` enum refreshes only on restart or `/reload`.
- `../usage-limits.ts` is a separate small extension: `/limits` shows which Anthropic usage bucket your requests draw from (plan-limit windows vs. the extra-usage overage lane), read from the `anthropic-ratelimit-*` response headers.
