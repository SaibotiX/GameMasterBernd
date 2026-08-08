# Stage 1 — the web client: three panes around the terminal

The page a friend sees when their secret link opens. Decision R14 fixes the shape; this document is the owning spec for the layout and its interaction rules. It sits **on top of** R1, never against it: the game itself stays the streamed terminal, as-is, no rewrite — this page is the frame around that stream, built from the file surfaces the game already writes. Checked before writing (2026-08-05): the streaming architecture was specified in [02-friends-web-service.md](02-friends-web-service.md), but no page layout existed anywhere in the roadmap or design papers — this spec is new law, not a revision.

Grounding facts from the 2026-08-05 codebase sweep (receipts in the sweep summary, [06-research-log.md](06-research-log.md)):

- The game's ceremony layer is **TTY-only**: all six `ctx.ui.custom` overlays (dice ceremony, quest window), the four-slot board's dress, and the game footer vanish over RPC (`custom()` returns `undefined`, `setFooter()` no-ops, component factories are ignored) — the aitester's `/ai-state` extension exists precisely because of this. A web frontend that drove pi over RPC would have to rebuild the entire ceremony layer. So: **xterm.js streams the real TUI**, and the page adds only what the terminal cannot do.
- What the terminal cannot do is **show the chronicle and the scrying glass's catches**. The engine writes plain markdown under `data/world/<world>/<chronicle>/` (places, personas, quests, items, `ledger.md`, `record.md`, `chronicler.md`) and drops media into `data/downloads/` (`pic-*.jpg`, `clip-*.webm`/`.ogv` — Commons containers per R24) — today `find_picture`/`find_video` only announce the saved file path as text. In local play the player opens these by hand; the web client renders them in place. **The file panes are not a debug view — they are the half of the game the terminal has always pointed at.**
- **Nothing the panes serve is secret.** Design invariant A5 makes the laws file player-discoverable ("a seeker can learn every one of them in play"); F2 keys outcomes to visible state. What *is* secret — sealed fate plans (A2/A4) and the engine nonce — lives only in veiled session-file entries under `~/.pi/agent/`, which the panes never serve. The secrecy boundary is respected by scope, not by filtering.

## The layout

```
┌─ status strip ─────────────────────────────────────────────────────────────┐
│  World Console · <world title> · <rounds/limits note> · ● connected        │
├──────────────────────────────────────────────┬─────────────────────────────┤
│                                              │  tabs: ledger.md · fords.md │
│   THE TERMINAL  (xterm.js — the game)        │ ┌─────────────────────────┐ │
│                                              │ │  VIEWER                 │ │
│   keeper's telling, four-slot board,         │ │  rendered markdown,     │ │
│   dice ceremony, footer — the full TUI,      │ │  pictures, clips        │ │
│   exactly as on the dev machine              │ │                         │ │
│                                              │ ├─────────────────────────┤ │
│                                              │ │  FILE MANAGER           │ │
│                                              │ │  ▸ config/              │ │
│                                              │ │  ▾ data/world/…/        │ │
│                                              │ │  ▸ data/downloads/      │ │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

- The **terminal pane** anchors top-left with a small page margin, roughly two thirds of the width — sized so the TUI keeps ≥ 100 columns at a comfortable font. It is the main window; everything else defers to it.
- The **right column** splits horizontally: the **viewer** takes the upper two thirds, the **file manager** the bottom third. The manager is deliberately the small one — it is a launcher, not a workspace.
- One thin **status strip** on top: world title, the connection dot, and (funded path, decision R12) the rounds note. Nothing else. No menus, no toolbars — the game's own commands (`/quest`, `/ledger`, `/gm`…) remain the interface to the game.

## What the file panes serve

The panes expose the **game folder only**: `config/` (constitution, worlds, laws, moods — readable per A5) and `data/` (the chronicle folders and `downloads/`). Read-only in v1: the terminal is how the player acts on the world; the panes are how they read it. One exclusion, enforced in the file API, not the client: anything outside the game folder — `~/.pi/agent/` (sessions, `auth.json`) is simply never mounted into the file server's root. (The `youtube-cookies.txt` exclusion died with R24 — no such file exists anymore; nothing in the game tree is credential material.)

Player *editing* of `config/` (a live surface in local play — hot-reloaded into the prompt) is a deliberate later choice, not v1: it adds a class of self-broken games to support, and the single-seeker fiction loses nothing by waiting.

## Interaction laws

1. **One click opens.** A file in the manager opens in the viewer and becomes the active tab. No double-click, no context menus.
2. **Tabs remember.** Open files stay as tabs (dedup by path; close with ×; middle-click closes). The tab row is the "quickly reopen" surface — no separate recent-files UI.
3. **Everything hot-reloads.** A server-side watcher (chokidar over `config/` + `data/`) pushes change events over the WebSocket: the tree updates in place, an open tab re-renders on write, `ledger.md` follows its tail when the reader is already at the bottom (append-only mirror; `record.md` is regenerated wholesale and re-renders wholesale). New files appear in the tree with a quiet badge — a new place page surfacing mid-story is the world growing, and the UI should let that be *noticed*, never insisted on.
4. **The scrying glass shows its catch.** When a `pic-*`/`clip-*` lands in `data/downloads/`, the viewer auto-opens it in a tab (`<img>` / `<video controls>`) — the fiction says the glass *shows* the seeker, and now it actually does. Markdown files never auto-open (text steals attention; a badge suffices). A small setting turns media auto-open off.
5. **The terminal owns the keyboard.** Focus defaults to the terminal and returns to it after any pane interaction; space-to-cast in the dice overlay and typed play must never be swallowed by the page. Alt+number is browser-sensitive (Firefox on Linux switches tabs) — the `/pick` and `/roll` command paths remain the guaranteed route, per the 02 checklist. The panes are mouse-territory; the terminal is keyboard-territory.
6. **Rendered markdown by default** (the chronicle is prose and should read like it), with a raw-text toggle as a nice-to-have, not v1 scope.

## The login screen

*(2026-08-08, R11 revised: for now **one door** — play on the house (R12). The sign-in and API-key doors are on ice with the vault — `research/icebox.md`; the paragraph below stays their prepared face.)*

One screen before the terminal, three doors, no account database (stage 1 has no accounts — the secret link is the identity): **sign in with a provider** (the pi OAuth flows), **paste an API key**, or **play on the house** (decision R12's funded path, plainly labeled with what it is and its cap). Below the doors, the session-recording disclosure and the "don't type personal details" line (decision R13). Mechanics, custody, and injection are owned by [02-friends-web-service.md](02-friends-web-service.md) §Auth — this screen is only their face.

## Implementation shape

One small **app server per container**, replacing bare ttyd (which serves only its own full-page terminal and cannot carry file APIs): node-pty spawning `pi` + xterm.js attach over WebSocket, static file serving for the two pane roots, the watcher channel, and the session-lifecycle hooks that 02's auth injection and telemetry shipper need (connect → inject, disconnect/idle-stop → wipe and seal). This is the "small node-pty + xterm.js server" alternative 02 already named, promoted to the pick because the panes need a server anyway; ttyd remains the fallback if the app server stalls — the game is playable in a bare terminal page on day one, panes or not. R1 is untouched either way: same streamed TUI, no engine changes, everything runs inside the per-friend container (the file API can never cross the security boundary because it lives inside it).

Component picks, all boring on purpose: xterm.js (+ fit addon, webgl renderer, visual bell), chokidar, marked/markdown-it for rendering, no framework the panes don't earn — this is one page with three regions, not an app platform.

**Smoothness acceptance (what 4.5's "least friction" means, testable):** click-to-open < 100 ms perceived; write-to-rerender < 500 ms on the VPS; tab switch instant; terminal input latency unchanged by pane activity (watcher events must not contend with the PTY stream — separate WS channels or message priority).

## Evaluated against alternatives (and what was rejected)

- **Terminal-only page (bare ttyd)** — rejected as the *end state*: it hides the chronicle and the glass's media, the game's proudest artifacts ("a chronicle you can reread" is the Steam-stage pitch). Kept as the day-one fallback.
- **Full IDE-in-browser (code-server / VS Code web)** — rejected: an edit-capable IDE around a read-mostly story surface is the wrong register, heavyweight, and hands players edit powers v1 deliberately withholds.
- **A richer web-native game UI over RPC** — rejected for stage 1 by the sweep's load-bearing fact (the ceremony layer dies over RPC; rebuilding it is a rewrite R1 forbids). If a native client is ever wanted, that is a new decision against R1, taken then.
- **More panes** (quest board, dice history, map…) — rejected: every candidate already lives inside the TUI as a game surface (`/quest`, `/history`, the board, the overlay). Duplicating them web-side would split one truth into two homes and drift. The panes exist only for what the terminal *cannot* show: files and media.
- **Simpler than three panes?** Considered (a slide-over drawer instead of the right column) — rejected: the chronicle deserves permanence beside the play, not behind a click; and the fixed layout is the *more* flexible base for later adjustment, which is the stated point of keeping the UI minimal.

## Narrow screens

Desktop-first, unapologetically (02 already flags the phone on-screen-keyboard experience as poor). Below ~1000 px the right column collapses behind a single toggle button on the status strip; the terminal always wins the space.
