# pi + Selenium + yt-dlp — Moods, Layered Instructions, and Web/Media Tools

**Self-contained summary.** This folder explains, with zero assumed prior knowledge, how we use the **pi agent harness** to give an AI character switchable *moods* and layered *instructions*, and how that composes with outward-facing **Selenium** (browser automation) and **yt-dlp** (media retrieval) tool mechanics. It was distilled from the Bernd project's design set (`Bernd/design/00–07`), but everything here is written **generalized** so future threads and other projects can adopt it directly: "agent" instead of one character, "place" instead of one game's lobbies, "operator" instead of one product's sysop.

## The whole idea in one paragraph

An agent's behavior is not one big prompt — it is an **ordered stack of small files, each with its own priority**: an operator-owned *constitution* (layer 0), a *persona* (layer 1), a *mood* (layer 2), and *active briefings* (layer 3), assembled fresh per call together with place context and per-turn additions that are guaranteed to reset. Every layer is a hot-reloadable file; **who may change which layer is role-gated** (operator: anything; the agent itself: draft + propose through an audited privileged path; users: influence only; the system: event-driven mood shifts). Different *places* bind different personas and moods as pure config. The agent reaches the outside world only through declared tools — Selenium for browsing, yt-dlp for media — which sit behind **capability flags, sandboxed adapters, confirmation mode, and an audit log**. The instruction stack shapes *when the agent wants* a tool; config decides *whether it may*; the hook pipeline decides *each call*. And whenever anything of value changes hands, it lands in an **append-only Ledger**: balances are derived sums, every number has a stored reason — mood and drama are theater; consequences come only from ledger lines written by server-checked paths.

## The documents

| File | Contents |
|---|---|
| [`01-pi-harness.md`](01-pi-harness.md) | What pi is (packages, ecosystem) and which of its parts and practices we build on |
| [`02-instruction-layers.md`](02-instruction-layers.md) | The layered instruction system: layers & priorities, assembly order, hot-swap, **who/what changes what (generalized)**, **per-place binding (generalized)** |
| [`03-context-and-memory.md`](03-context-and-memory.md) | Per-place contexts, per-user memory & disposition, and the Hot/Warm/Frozen (Freeze/Thaw) memory tiers |
| [`04-models-and-providers.md`](04-models-and-providers.md) | The provider layer: model-per-purpose as config, local/self-hosted models, bring-your-own-key |
| [`05-selenium-yt-dlp-tools.md`](05-selenium-yt-dlp-tools.md) | The web/media tool mechanics: adapters, capability flags, confirmation, audit, sandboxing — and how moods interact with tools |
| [`06-ledger.md`](06-ledger.md) | The Ledger: append-only consequences, derived balances, correction lines — theater vs. consequences, with example code |
| [`demo/`](demo/) | A runnable terminal program showcasing all of the above (no API key, no network needed) |

## The showcase program

```bash
cd demo
node persona-console.ts          # Node >= 23.6 (Node 24 runs TypeScript natively)
node persona-console.ts --live   # real yt-dlp metadata calls instead of dry-run
```

See [`demo/README.md`](demo/README.md) for a guided tour. The demo implements the full loop in one dependency-free TypeScript file: config tree with frontmatter, per-call prompt assembly, hot reload, role-gated changes with approval queue, event-driven mood shifts, per-turn additions with guaranteed cleanup, the capability-flagged yt-dlp/Selenium adapters with confirmation + audit trail, and an append-only ledger with derived balances (`/credit`, `/why`, `/correct`).

## Why TypeScript

The languages were chosen so the pieces stay true to each other:

- **pi is a TypeScript / Node ≥ 22 monorepo**, and its `@earendil-works/pi-ai` package is our LLM provider layer — depending on it means living in TypeScript.
- **Selenium does not bind the language**, but its `selenium-webdriver` npm bindings are first-class — browser automation stays *in-language* with the rest of the stack.
- **yt-dlp is Python**, but it is consumed as a **subprocess CLI**, which any language drives equally well. We never import it; we spawn it. That arm's-length relationship is also exactly the security posture we want (separate process → separate container), so the language boundary doubles as the sandbox boundary.
- The Bernd build backlog (Batch 0) already fixes TypeScript for the server; one language across harness, server, and browser automation beats two.

**Rule of thumb for future projects:** if you build on pi, write TypeScript; drive Selenium through `selenium-webdriver` (npm); treat yt-dlp (and any Python-native tool) as a sandboxed subprocess, never a library.

## Reference checkouts

The parent folder (`Bernd/`) contains vendored source checkouts for deep reference: `pi/` (the harness monorepo), `selenium/` (upstream Selenium), `yt-dlp/` (upstream yt-dlp). They are reading material, not build dependencies — real projects depend on the npm packages / installed CLI instead.
