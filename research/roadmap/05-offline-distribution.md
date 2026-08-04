# Offline distribution — the fallback channel

The web service (stage 1+) is the primary channel, but the local-copy path stays researched, specified, and ready. It exists for: friends who want the game on their own machine (own model choice, privacy, no dependence on our server), our own dev copies, and the **prepared exit** if hosting policy or economics ever break (decision R1's revisit clause).

## The trimmed player copy

What ships, always built by whitelist — never by zipping the live working folder (which risks `auth.json`, personal `data/` worlds, and the R&D):

| Included | Excluded |
|---|---|
| `README.md` | `research/` — the R&D papers: game design, playtest kit, this plan |
| `.pi/` (loader shims) | `aitester/` — AI-playtester service |
| `extension/` (engine) | `data/` — always fresh for the recipient |
| `config/` (worlds, laws, moods, sites) | any `auth.json`, `.env`, credentials |
| `tools/yt-dlp/` (submodule checkout) | |
| `LICENSES/` + the all-rights notice | |

`git archive` (or a short whitelist script) makes the wrong-contents mistake impossible. A per-recipient watermark line (e.g. in a config comment) is the cheap traceability upgrade if copies ever spread beyond the trusted circle.

## Channels, by effort

1. **Private GitHub repo, invited collaborators** — revocable per person, updates via `git pull`, visible who has access. Clone needs `--recurse-submodules` (yt-dlp). Best for technical friends.
2. **Zip via private link** (Drive etc.) — simplest; pair with the notice file.
3. **itch.io restricted page** — draft/secret-link or restricted mode with password + per-person download keys; gives a real game-page feel and per-key revocation. The natural home if a *free local* edition ever accompanies the public web launch.

## The portable one-click bundle (researched, shelf-ready)

For non-technical friends on their own machines: one zip per OS ≈ ~100 MB.

```
world-console-<os>/
  pi(.exe)            ← pi standalone binary (Bun-compiled, from GitHub releases)
  play.sh / play.bat  ← cd to this folder, run ./pi
  <trimmed player copy as above>
  LICENSES/           ← pi MIT text (required when redistributing), yt-dlp Unlicense (courtesy)
```

First run: trust prompt → `/login` with the player's own account → play. The login is the one step no packaging can remove — and per R5 it is also the feature that keeps each player paying their own way.

**Known caveats (verified in research, to re-test before first use):**
- Confirm once that the standalone pi binary loads our `.ts` extensions exactly like the npm install; fallback is a three-line installer script (`npm i -g @earendil-works/pi-coding-agent`).
- `find_video` needs `python3` on the host (`extension/mediasearch.ts` execs `python3 -m yt_dlp`); near-universal on Linux/macOS, usually absent on Windows. Either document video as optional or make mediasearch prefer a dropped-in official yt-dlp standalone binary (small code change) — that removes Python entirely.
- ffmpeg: leave the 420 MB static build out; use a system install when present (only distributing ffmpeg binaries would raise its license questions — see [04-licensing-and-ip.md](04-licensing-and-ip.md)).
- Windows is untested territory for the game itself; expect SmartScreen warnings on unsigned binaries; one smoke test before any Windows friend gets a zip.
- **Updates must never replace `data/`** — a tester's entire world lives there. Update instructions (or a tiny script) replace program files only. (The web service solves this by construction; here it is a documented manual rule.)

## Explicitly rejected (kept for the record)

Single-exe compilation, obfuscation, bytenode, Node SEA — researched and rejected in decision R1: they fight pi's folder-based design, can't protect prose, and Node SEA even embeds source readable. The protection strategy is hosting (primary) and law + trust + traceability (this channel), not technical concealment.
