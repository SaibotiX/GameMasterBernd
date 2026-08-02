# Commands

The line discipline is one rule: **a line whose first word is a command name
runs that command; every other line is chat with the AI.** Implementation:
`app/src/commands.ts` (the registry) and `app/src/websearch.ts` (the search
workflow).

## 1. The registry

A command is one object:

```ts
{ name, usage, summary, run(ctx, args) }
```

`ctx` hands it everything with authority: the config, the ledger, the AI, the
video tooling, and the two output voices (`aiSays` — in character, recorded as
chat; `system` — out-of-fiction machinery notes). **Adding a command is adding
one entry to the `COMMANDS` array** — parsing, `help`, and dispatch come for
free. That is the whole extensibility story, on purpose.

Shipped commands:

| Command | Does |
|---|---|
| `find -web (-text \| -picture \| -video) <query>` | the websearch workflow below |
| `site -list` / `site -add <url> [-picture]` | inspect / widen the web sources |
| `ledger [n]` | print the last n ledger lines |
| `help` | usage of everything |
| `exit` | leave (also Ctrl-D) |

## 2. The websearch workflow

Every `find` runs the same five stations; the AI is consulted where judgment
helps, code decides where consequences live:

```
1  ban gate        code      banned? → in-character refusal, search_refused line, stop
2  AI verdict      AI        in_theme / off_theme / harmful + a refined SEARCH KEY + spoken line
                             harmful → code sets angriest mood + websearch_ban → stop
                             off_theme → refusal in character → stop
3  adapter         code      the actual web work (below), using the refined key
                             nothing found → error in chat + hint to `site -add` → stop
4  AI check        AI        does the result match the request? spoken hand-over (doubt is said aloud)
5  hand-over       code      text → printed; picture/video → opened via xdg-open; search_performed line
```

Stage 2 exists twice over: the judgment ("does a cat picture belong in a
dragon realm?") and the translation — the AI turns fiction-flavored requests
into a plain modern search key, because that string leaves the fiction and
meets a real search engine. Stage 4 closes the honesty loop: the AI only ever
presents results that actually exist, and its doubt is recorded
(`search_performed.verified`).

## 3. The adapters

| Kind | Source | How |
|---|---|---|
| `-text` | `sites.text`, in order | MediaWiki API: `opensearch` for the best title, then `extracts` for a plain-text intro |
| `-picture` | `sites.picture`, in order | MediaWiki file-namespace search (Commons by default), best jpeg/png/webp ≥ 400px, downloaded to `data/downloads/` |
| `-video` | YouTube via vendored yt-dlp | probe `ytsearch`, pick a hit, cut `*0-10s` with ffmpeg (`setup.sh --ffmpeg`); without ffmpeg: shortest hit ≤ 90s, widening toward shorts |

Adapters are plain functions (`app/src/adapters/*.ts`) with no AI inside —
swapping one, or adding a fourth kind, touches one file plus one branch in the
workflow. yt-dlp stays an arm's-length subprocess with typed, allowlisted
arguments; nothing web-fetched is ever executed.

## 4. The site list

`config/sites.json` holds two ordered lists (text, picture). Sources are tried
top to bottom; the first hit wins. `site -add` accepts any public https host,
writes the file, and records a `site_added` ledger line — but only
MediaWiki-API sites (Wikipedia languages, Fandom wikis, Wikimedia projects)
will actually answer. When nothing answers, the failure lands in chat with the
`site -add` hint — exactly the moment a player can widen the net.

## 5. Extending — the intended seams

- **New command**: one entry in `COMMANDS`.
- **New search kind**: adapter file + a branch in `runFind` + the flag in `find`.
- **New source type** (non-MediaWiki, or a Selenium-driven browser for
  JS-heavy sites): a second adapter behind the same `SiteEntry` list.
- **New workflow step** (e.g. AI proposes a source itself when all fail —
  the planned automation of `site -add`): a stage in `runFind`, ledgered like
  the others.
- **Different rules per world**: worlds already gate theme via the AI verdict;
  harder per-world capability flags (e.g. "no video in this world") would be
  world frontmatter read at stage 1.
