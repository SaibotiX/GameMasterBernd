# World Console

A terminal world with an AI game master. You connect, you get greeted by name,
and from there:

- **No command → you chat.** The AI is a being *of its world*: a medieval
  chronicler in a dragon realm, a shipboard intelligence on a star frontier.
  It answers story-bound questions richly, deflects everything else in
  character — and it has **moods**. Courtesy warms it, insults chill it, and
  only in chat does its mood ever show.
- **Commands → the machine acts.** `find -web -text cat` asks the AI to judge
  the request, searches the web, and hands the result back through the AI's
  voice. Pictures and ~10-second video clips open in your local viewer.
- **Everything of consequence is a ledger line.** Mood shifts, granted and
  refused searches, the websearch ban, redemption — one append-only file,
  every state derived from it, every "why" answerable with `ledger`.

Ask for filth and the AI gets **angry**: the websearch is barred — by code, not
by prompt — until you redeem yourself in conversation and the AI writes the
redemption line.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | **The program** (TypeScript, run natively by Node ≥ 23.6 — no build step) |
| `app/config/` | Constitution, worlds, moods, web sources — plain files, hot-reloaded |
| `app/data/` | The ledger (`ledger.jsonl`) and downloaded pictures/clips |
| `AI-Design.md` · `Ledger.md` · `Commands.md` | The three design documents |
| `pi/` | Vendored [pi harness](https://github.com/earendil-works/pi) — its `@earendil-works/pi-ai` package is the AI provider layer |
| `yt-dlp/` | Vendored yt-dlp source — driven as a subprocess for video |
| `selenium/` | Vendored Selenium source — reference only, not used by the MVP (the web adapters speak HTTP APIs directly; a browser adapter is a future workflow) |
| `Archive/` | The previous round: old design notes and the old demo |

## Quickstart

```bash
cd app

# Offline, no account — the scripted "dummy AI" plays every code path:
node src/main.ts --dummy

# Live AI — one-time setup (installs + builds the vendored pi-ai layer):
./setup.sh
./setup.sh --ffmpeg     # optional: static ffmpeg, enables real 10s video clips

# Log in, either way:
export GEMINI_API_KEY=…                              # any provider API key, or…
node ../pi/packages/ai/dist/cli.js login anthropic   # …OAuth with your claude.ai account
node src/main.ts
```

The OAuth login must be run **from the `app/` directory** — it writes
`app/auth.json`, which the game reads (and keeps refreshed). API keys work for
every provider (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, …);
OAuth is available for anthropic, openai-codex, github-copilot, openrouter,
xai and a few others. If the world's configured provider has no credential but
another one does, the game says so and plays through the credentialed provider
instead.

Useful flags: `--world star-frontier` (pick a world), `--model provider/id`
(override the world's model), `--no-open` (print file paths instead of opening
viewers), `--data <dir>` (alternate ledger/download location).

## The commands

```
find -web -text <query>       a short explanation, printed in the terminal
find -web -picture <query>    a fitting picture, downloaded and opened
find -web -video <query>      a ~10s clip from YouTube, downloaded and opened
site -list | site -add <url>  the web sources (MediaWiki-style sites)
ledger [n]                    the last n ledger lines — full traceability
help · exit
```

If no source yields a result, the error appears in chat and you can widen the
net yourself with `site -add` (any MediaWiki-API site: Wikipedia languages,
Fandom wikis, Wikimedia projects). Letting the AI add sources automatically is
a planned next step.

## What this is (and isn't)

This is deliberately a **minimal working skeleton** that showcases one behavior
honestly: a personal, moody, story-bound AI whose theater is prompt-driven but
whose consequences are code-written ledger lines. There are no quests, no XP,
no lore beyond the world files — worlds are plain markdown, so the community
can fill the skeleton with content. The three design documents describe the
exact mechanics:

- **[AI-Design.md](AI-Design.md)** — the AI's three verbs, prompt layers, moods, redemption, live vs dummy
- **[Ledger.md](Ledger.md)** — the append-only ledger: line types, derivation, guarantees
- **[Commands.md](Commands.md)** — the command registry and the websearch workflow, and how to extend both
