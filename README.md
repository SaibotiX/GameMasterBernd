# World Console

A terminal world with an AI game master, running inside the stock
[pi coding agent](https://github.com/earendil-works/pi). The whole game lives
in **[`IA/`](IA/README.md)** — a standalone folder you can copy anywhere and
run pi inside:

```bash
cd IA        # or stay at the repo root — both carry pi loader shims
pi
```

What you get: a moody, story-bound game master with an open world — places,
souls, quests and items chronicled as plain markdown per story; a websearch
"scrying glass" (text, pictures, ~10 s video clips) with a code-enforced ban
for filth; an out-of-character GM table (`/gm`) for questions, disputes, bound
truths and engine repairs; and an append-only ledger from which every state is
derived — mirrored per story into a readable `ledger.md`.
**[IA/README.md](IA/README.md)** documents all of it.

## Repository layout

| Path | What it is |
|---|---|
| `IA/` | **The game** — pi extension, config, data, tools (incl. the vendored yt-dlp submodule at `IA/tools/yt-dlp/`); standalone |
| `.pi/extensions/` | loader shims so pi finds the game from the repo root too |
| `Archive/` | Everything retired: the first round's notes and demo, the app-REPL round (`Archive/app-repl/`), and the reference checkouts of [pi](https://github.com/earendil-works/pi) and Selenium |

The game runs on the **globally installed** pi CLI; the archived `Archive/pi`
checkout is documentation reference only.

## History

The game began as a standalone Node REPL (`app/`), then was rebuilt as a pi
extension and finally consolidated into `IA/`. The retired REPL lives on in git
history, and its design documents in
**[Archive/app-repl/AI-Design.md](Archive/app-repl/AI-Design.md)**,
**[Archive/app-repl/Ledger.md](Archive/app-repl/Ledger.md)** and
**[Archive/app-repl/Commands.md](Archive/app-repl/Commands.md)** — they
describe the original mechanics (mood theater, ledger derivation, websearch
workflow) that the extension inherited and extended.
