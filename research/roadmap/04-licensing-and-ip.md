# Licensing & IP — the legal layer across all stages

Decision R3 in short: all rights reserved now, open source a real later option, MIT ruled out. This file holds the full reasoning and the concrete actions per stage.

## Where we stand today

- **No LICENSE file ⇒ full default copyright.** Under copyright law the work is protected from creation; nobody may copy, modify, or redistribute without permission — visibility (even a public GitHub page) grants no usage rights. This is already the strongest *legal* position available.
- **Done 2026-08-04** — `LICENSE` at the repo root states it explicitly:

  > © 2026 Tobias Maier. All rights reserved. Personal play by invitation is welcome. Please don't redistribute the game or its files.

  (Remaining at stage 1: one line in the friend intro. The lawyer-written equivalent, if ever wanted: PolyForm Noncommercial 1.0.0.)

## The one-way door

Closed → open: always possible, any day, one commit. Open → closed: impossible for everything already shipped — Aseprite relicensed from GPL to a proprietary source-visible EULA in 2016 and sells fine at $20, but its GPL past is forked forever as LibreSprite. Consequence: the open-source decision is taken **at a chosen launch moment or not at all**, never casually, never "just to get eyes."

## The ladder of postures (and when each fits)

| Posture | What it means | Fits |
|---|---|---|
| Private, all rights reserved | current state; invited access only | stages 0–1 |
| **Public source, no rights granted** | repo public, explicit all-rights notice (or PolyForm NC). Eyeballs, bug reports, "read how it works" marketing — zero copy rights. The Aseprite-adjacent move | optional at stage 2–3, as trust/marketing |
| **Copyleft open source (GPLv3 / AGPL)** | real open source; forks welcome but every copy must stay open, credited, source provided. Kills silent commercial rebrands. **AGPL matters specifically for us:** our future is a hosted service, and AGPL is the license that also binds anyone *hosting* the game as a service to publish their changes | the "let it live" endgame |
| Permissive (MIT/Apache) | anyone may do anything, including the closed commercial rebrand | **ruled out** (R3) |

Notes that survive any choice:
- **We are never bound by our own license.** As sole copyright holder we can always dual-license, sell official builds (Mindustry: GPLv3 and $9.99 on Steam, 94 % positive at thousands of reviews), or run the paid service.
- **Sole-holder status is worth protecting:** the moment outside PRs merge, relicensing needs every contributor's consent. If contributions ever open up while selling remains plausible → DCO at minimum, lightweight CLA preferred.
- **Split licensing stays available:** engine code under GPL, worlds/laws/moods prose and the `research/design/` papers under CC BY-NC or plain reserved — the id-Software pattern (engine free, content proprietary), matching where this game's value actually sits. Decide only at the open-sourcing moment.
- **R4 stands regardless:** `research/` and `aitester/` are a separate publication decision from the game itself.

## What no license can do

A license controls copying of *expression* (files, prose, code). It cannot protect the *idea* — "AI game-master with code-enforced fairness in a terminal" is copyable from a screenshot by anyone sufficiently motivated, and every public stage exposes the idea by definition. The researched conclusion: for games the working moat is execution cadence, polish, community, the accumulated content corpus, and the brand — not secrecy and not the license. (Cheap early move: secure the eventual name's domain; the name and brand stay ours under any code license.)

## Third-party stack compliance

| Component | License | Our duties |
|---|---|---|
| pi (`@earendil-works/pi-coding-agent`) | MIT | include copyright + license text **when redistributing** (bundles, images we hand out). Merely *hosting* it triggers nothing — MIT has no network clause |
| yt-dlp (vendored submodule) | Unlicense (public domain) | none; shipping its text alongside is courtesy |
| ffmpeg (system or static) | LGPL/GPL depending on build | fine to use and host; only if we ever *distribute* ffmpeg binaries do the build's terms matter (offline bundle case — see [05-offline-distribution.md](05-offline-distribution.md)) |
| Model output / provider terms | — | as stage 2–3 operator we answer for usage-policy compliance of traffic under our org key |

## Leakage reality (accepted residuals)

Hosted, the engine + corpus + papers never leave the server. What still escapes: fragments of prompts via determined social engineering of the keeper (AI Dungeon's prompts leaked this way; dampen, accept), and world content revealed turn by turn through play — which is the product working. No action beyond not pretending otherwise.
