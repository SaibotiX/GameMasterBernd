# IA — World Console

The game running inside the stock [pi coding agent](https://github.com/earendil-works/pi): pi contributes the terminal UI, model switching (`/model`), sessions (`/new`, `/resume`, `/fork`, `/tree`, `/compact`, `/export`), and auth (`/login`); this folder turns it into the game — and it is standalone: copy `IA/` anywhere and run pi inside it.

## Layout

| Path | What it is |
|---|---|
| `.pi/extensions/` | pi's loader shims — how pi finds the game when run inside `IA/` |
| `extension/` | the whole engine: prompt takeover, tools, ledger, GM table, world files |
| `config/` | constitution, worlds (+ per-world `*.laws.md`), moods, web sources — plain markdown, hot-reloaded |
| `design/` | the undertakings design: goals & invariants, mechanics spec, research record, build progress |
| `data/world/<world>/<chronicle>/` | one folder per STORY: places, personas, quests, items — and `ledger.md`, the readable game log |
| `data/downloads/` | pictures and video clips the scrying glass fetched |
| `tools/yt-dlp/` | vendored yt-dlp source (git submodule) — drives `find_video` as a subprocess |
| `tools/ffmpeg/` | optional static ffmpeg for ~10 s clips (or install system ffmpeg) |

The authoritative ledger is not a database: it lives as custom entries inside pi's session file (append-only JSONL under `~/.pi/agent/sessions/…`). Every game event is mirrored line-by-line into the story's `data/world/<world>/<chronicle>/ledger.md` (with its `*uN*` number), so players can read the log — and argue from it at the GM table.

## Run

```bash
cd IA                       # or the repo root — both carry loader shims
pi                          # trust the directory once when asked
pi --world star-frontier    # pick a world (default: dragon-realm)
```

`WORLD_CONSOLE_WORLD=star-frontier pi` works too. Talk to the keeper, or invoke the scrying glass directly:

```
/web text basalt              # knowledge from the chronicle sites
/web picture aurora borealis  # image downloaded to data/downloads/
/web video komodo dragon      # ~10 s clip via yt-dlp (slow)
```

Typing `/` lists the commands with their descriptions; after `/web ` the first argument autocompletes (`text` / `picture` / `video`). `/web` is not a raw fetch: the engine refuses it outright while the glass is barred (recorded in the ledger, no LLM call), otherwise it hands the request to the game master, who judges it against the world's theme in character and performs it through the matching tool. `/ledger [n]` shows this sitting's game ledger. `/gm <text>` opens the GM table — out-of-character talk with the engine about the game's state and workings — and `/gm truth <fact>` binds a fact as canon (see below). When a task twists mid-work, a panel above the input lists the open paths: `/pick <n> [your own words]` (or Alt+number, which prefills the pick so you can add words) commits to one — plain typing stays free conversation and never picks for you.

## How it works

- **Prompt takeover** — `before_agent_start` replaces pi's coding prompt each turn with the layered game-master prompt (constitution → world → mood → standing → control protocol) assembled fresh from `config/` (hot reload; broken edits keep the last good config).
- **Tools instead of tags** — the built-in coding tools are stripped; the model gets exactly:
  | tool | purpose |
  |---|---|
  | `find_text` | MediaWiki text search over `config/sites.json` text hosts |
  | `find_picture` | MediaWiki file search (Commons by default); best match downloaded to `data/downloads/` |
  | `find_video` | yt-dlp (vendored source) via YouTube search; ~10 s ffmpeg clip, or shortest video without ffmpeg |
  | `set_mood` | mood shifts; setting the angriest mood makes the engine bar the glass (code-owned invariant) |
  | `grant_redemption` | lifts the bar after sincere amends; no-op unless barred (code-owned invariant) |
  | `record_name` | stores the seeker's name for the standing layer |
  | `set_place` / `chronicle_place` / `update_place` | journey to a place / found a page for a place only spoken of (no travel) / extend the current page |
  | `record_persona` / `move_persona` | chronicle a MAIN soul (at the party's place or any chronicled one) / move them, reason recorded |
  | `grant_quest` / `attempt_quest` / `update_quest` / `redeem_quest` | grant work (giver optional: omitted = the seeker's own self-set task); advance it one real scene of effort at a time (the only way work moves), record `done` once the engine says the work stands complete, collect the reward at the giver (self-set tasks close anywhere) |
  | `add_item` | record loot, pay and gifts in the seeker's items file |
  The old `@mood(...)`/`@redeem` text tags are gone — the app's ledger showed models forget magic text lines exactly when they get theatrical; they do not forget tool calls.
- **The ledger lives in the session** — every game event (`world`, `player_named`, `mood_set`, `websearch_ban`, `redemption`, `search_requested/performed/refused/failed`, `truth`/`truth_retracted`, `chronicle`, `place`/`place_chronicled`, `persona`, `quest`, `item`, and the undertaking events `quest_shape`/`quest_tick`/`fate`/`fate_skipped`/`complication`/`pick`/`outcome`) is a custom entry (`world-console.ledger`) in pi's session file. All state is derived by folding the **current branch** (`sessionManager.getBranch()`), so:
  - `/new` = fresh ledger, `/fork` copies it, `/tree` rewinds it; branches never interfere.
  - `/compact` shrinks the LLM context but never touches ledger entries — derived state is unchanged.
  - **One world per session**: the first event stamps the world; a resumed session keeps its stamped world even if `--world` disagrees (the app's world-mixing bug cannot happen here).
- **The ban is code-enforced** — while barred, a `tool_call` handler blocks every `find_*` lens (recording `search_refused`) and each tool's own execute guard throws as a second layer.
- **The GM table** (`/gm`, alias `/dm`) — an out-of-character channel to the engine, answered by a **separate** LLM call that sees the game state, ledger, recent play and the exact in-character prompt, but lives outside the pi session: table-talk never enters the game's context or the ledger. The one thing that crosses over is a **truth** — a `truth` ledger event feeding the `3½ · established truths` prompt layer that binds the in-character game (and rewinds/forks with the session like everything else). Two ways to bind one, per design: **conviction** — argue at the table; when the engine concedes, or you both settle something new, it binds the fact through its structured reply — and **decree** — `/gm truth <fact>` (or `/dm truth <fact>`), instant, checked first by a guardian LLM call against the constitution. Unresolved disputes end with the engine offering exactly that command. Neither path can bind anything that weakens the constitution or the control protocol — and neither can contradict the record: before any bind, the engine hands the guardian the record (all established truths, the newest ledger and play lines, **plus a code-side keyword search over everything ever said on this branch** for the statement's own words — so even in a long sitting a contradiction older than those windows reaches the judge, and the session file remembers what `/compact` dropped from the LLM's context) and denies the truth if one record line clearly contradicts it, quoting that line ("dragon is 20 m tall" canon blocks a later "dragon is 30 m tall"). Absence of evidence is not contradiction — new facts bind freely; exact re-binds are answered by code alone, no LLM call.
- **Recall & the archive** — table answers are short and plain (a referee's note, not the keeper's voice). For recall questions ("how was the king called?", "what did you say about that dungeon?") the engine runs a code-side search of the **full record** first: it extracts the main words of the question (stemmed, very broad), finds every matching line across all messages and ledger events, and hands the table AI each hit with the line above and below it. Every record line shown anywhere carries its stable `*uN*` number (its position in the append-only session file — also shown by `/ledger`), and the table cites those marks instead of trusting memory.
- **Repairs** — when the game mis-records state (the classic: calling `update_place` instead of `set_place` on a return journey, leaving the footer stale), tell the table: `/gm the footer says X but the story stands at Y — fix it`. The meta-GM verifies the claim against the record and proposes engine actions in its structured reply — set the true place (footer follows), append a correction note to a page, record or relocate a soul, advance a quest (forward only; `rewarded` also grants the recorded reward), or add a missed item. Code validates and executes each one and announces `⟡ engine repairs:` itself — the table can never claim a change in words alone.
- **Amendments** — when a truth is denied for contradiction, the notice includes the session file path and the amend syntax. If the record itself states your fact somewhere — say the keeper once declared the dragon "nineteen and three-quarter meters" at `*u7*` — then `/gm amend_truth <fact> *u7*` (or `/dm amend_truth …`) hands the guardian exactly that entry as proof: it allows the amendment only if the entry genuinely states the fact (meaning an earlier evaluation erred), names any superseded truth, and the engine then records `truth_retracted` + the corrected `truth` (`← *u7*`) in the ledger. This is the **only** way canon can change. Narrated barring without the tool call changes nothing, and the standing layer shows the true state every turn.
- **One chronicle per story** — the first `session_start` stamps a chronicle key into the ledger, and all world files live under `data/world/<world>/<key>/`. So `/new` founds a fresh, empty world-file folder (a new story never inherits another story's quests or items), `/fork` **inherits** its parent's chronicle (the stamp copies with the entries), and stories from before this stamp existed are adopted onto the legacy shared folder. Resuming a sitting resumes its chronicle.
- **In-game archive recall** — every turn, code searches the sitting's full record (the session file keeps everything, even what auto-compaction folded out of the LLM's context) for the player's words and hands the hits to the keeper through a hidden `3¾ · archive recall` prompt layer — trusted over memory, never spoken of aloud. Ask "what was the lord's name?" fifty turns and one compaction later, and the keeper still knows. (The `/gm` table has had the same search since it learned recall.)
- **The open world** — the game master is an unbound presence: ask it what to do and it offers real choices, from heroic errands to plucking a sick farmer's carrots. The world's permanent chronicle lives as plain markdown under `data/world/<world>/<chronicle>/` (`WORLD_CONSOLE_DATA_DIR` overrides for tests): one page per **place** (`places/<slug>.md` — where it lies, look & feeling, a growing visit chronicle) and per **main soul** (`personas/<slug>.md` — who they are, every dealing, where they now dwell), plus `quests.md` and `items.md`. Pages are never deleted, only extended; the same name is always the same page, so returning anywhere reloads its whole history (and the footer follows: `… · <world title> · <place>`). Code owns the anti-exploit rules: a soul dwells where last recorded and moves only via `move_persona` with a reason written to their page; quests advance `[open] → [done] → [rewarded]`, and `redeem_quest` is refused unless the deed is done **and** the giver's soul is at the party's place — the reward then flows into `items.md` automatically. Every world action also lands in the session ledger (`journeyed to…`, `quest granted…`), so `/ledger` and the GM table's archive search see them. One deliberate trade-off: world files are the permanent chronicle — `/tree` rewinds the sitting, not the world.
- **Undertakings** — a granted task is never finished in one prompt: each quest draws a hidden shape (a progress clock of 4/6/8 segments; about half also seal a twist). Work advances only through `attempt_quest` — one real scene of effort per beat — and `update_quest(done)` is **refused by code** until the clock fills. Twisted quests get a **fate plan** woven mid-work by a separate LLM call the keeper never sees (`design/undertakings-*.md` hold the full spec and the research behind it): a complication grounded in the world's **laws file** (`config/worlds/<id>.laws.md` — physics, biology, special mechanics, what tends to go wrong), two warning signs the keeper plants beforehand, and 2–4 paths with honest risk words (safe/risky/desperate) whose outcomes were decided in advance — plus sometimes a marked *blue* path that only appears because the chronicle proves the seeker qualifies (the rope in their items, the smith they met). The seeker picks (`/pick`, Alt+number, panel above the input); code applies the sealed outcome — progress, cost, setback, loot windfall, or (rarely, desperate paths only) the task failing outright `[failed]` — and hands the keeper the reveal *with its why* to narrate. Fairness is code-enforced: at most one twist per quest, none in two consecutive quests, self-set tasks stay plain, four open quests at most, and every backfire must trace to a law or a clue the seeker could have found. At the GM table an unresolved fate is *veiled, never lied about* — once resolved, the table may show the whole answer sheet.
- **Footer** — pi's stock stats line (cost, `(sub)`, context %, model • thinking; rendered by the real `FooterComponent`, so formatting matches stock exactly) with the game line below it (`<voice> · mood: <mood>[ · glass BARRED] · <world title>[ · <place>]`) and no directory line.

## Tests

```bash
node IA/extension/test/unit.ts          # pure logic, no pi, no LLM (network: Wikipedia)
node IA/extension/test/integration.ts   # real pi over RPC; Part A costs no LLM tokens
```

- **unit.ts** — ledger derivation, the ban/redemption invariants, branch isolation, config-loader equivalence with `app/src/config.ts`, prompt layers, search adapter (incl. abort).
- **integration.ts Part A** (crafted session files, no LLM) — banned-branch derivation, leaf-rewind to a pre-ban branch (the `/tree` mechanism), stamped-world-beats-`--world`.
- **integration.ts Part B** (live LLM) — no search possible while barred, redemption flow, search after redemption, name recording, `/compact` shrinks context while the ledger survives, `new_session` starts a fresh ledger.
- **integration.ts Part C** — `/web`: a clean session hands the request to the GM (performed entry recorded), a barred session is refused by the engine with no LLM call; `WC_VIDEO=1` adds the slow end-to-end video download. `test/demo-web.ts` is a watchable demo of the same flows.

Known soft spot: whether the *model* ever attempts `find_text` while barred is model temperament (it is told it is barred and usually refuses in character); the code block behind it shares the exact `banned` check the unit tests cover.

## Notes

- Mood is per session (branch-aware), not global like `data/ledger.jsonl` — a punishment ends with `/new`. If cross-session grudges are ever wanted, add a small global profile file.
- Adding a mood file mid-session updates prompts on the next turn, but the `set_mood` enum refreshes only on restart or `/reload`.
- YouTube sometimes meets `find_video` with a "Sign in to confirm you're not a bot" wall (IP-level — it hits every yt-dlp player client). The engine escalates least-invasive first: **1.** your own Netscape export at `config/youtube-cookies.txt`, if present — you decide exactly which cookies it contains; **2.** otherwise a bare attempt — installing the identity-free [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) plugin (a yt-dlp plugin plus its token server/script; more setup) makes this rung pass without any cookies at all; **3.** only if YouTube still refuses: cookies borrowed **live** from an installed browser (auto-detected; `WORLD_CONSOLE_YT_BROWSER=<browser>` names one), kept for the rest of the run — and every scrying that borrowed them says so in a notification. yt-dlp reads the whole browser cookie store locally but sends only the youtube/google-scoped cookies. If even browser cookies are refused, open youtube.com in that browser once (signing in helps most) and try again.
- `.pi/extensions/usage-limits.ts` is a separate small extension: `/limits` shows which Anthropic usage bucket your requests draw from (plan-limit windows vs. the extra-usage overage lane), read from the `anthropic-ratelimit-*` response headers.
- pi lists resumable sessions per working directory — sessions started from the repo root stay under the root's list, ones started inside `IA/` under its own. Any session file opens directly with `pi --session <path>`.
