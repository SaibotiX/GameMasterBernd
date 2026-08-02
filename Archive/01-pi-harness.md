# 01 — The pi Harness: What It Is and What We Take From It

**pi** ("Pi Agent Harness", [`earendil-works/pi`](https://github.com/earendil-works/pi), MIT, by Mario Zechner) is a TypeScript / Node ≥ 22 monorepo containing a self-extensible coding agent *and* the general-purpose machinery underneath it. We do not use pi as a coding agent — we use it as a **pattern donor and dependency** for building our own AI characters.

## Packages, and how we use each

| Package | What it is | How we use it |
|---|---|---|
| `@earendil-works/pi-ai` | Unified multi-provider LLM API (Anthropic, OpenAI, Google, Mistral, Bedrock, ~39 providers), model catalog with pricing, auth, streaming | **Depend on it.** This is our entire provider layer — see `04-models-and-providers.md` |
| `@earendil-works/pi-agent-core` | The agent loop: tool calling, state, sessions (JSONL stores), compaction | **Depend on or imitate.** A chat loop with declared tools is exactly this shape |
| `@earendil-works/pi-coding-agent` | The `pi` CLI: extensions, skills, prompts, themes | **Imitate its patterns, never expose its tools.** Its bash/edit/write tools are the opposite of what a multi-user product may hand a model |
| `@earendil-works/pi-tui` | Dependency-free ANSI terminal UI | Optional: local operator console; its 10-method `Terminal` interface is a clean seam for remote UIs |
| `pi-protocol` / `-client` / `-server` | Transport-neutral protocol for remote multi-session serving | Design source for transport layers (auth, frame limits, snapshot semantics) |

There is also a **package registry** (pi.dev/packages, 5,000+ extensions, `pi install npm:<name>`). Three finds matter for our topics:

- **`pi-web-access`** — web search, URL fetching, PDF extraction, YouTube video understanding. May replace hand-rolled Selenium/yt-dlp adapters for many use cases (see `05-selenium-yt-dlp-tools.md`).
- **`pi-hermes-memory`** — SQLite full-text search + auto-consolidation; a reference implementation of the Hot/Warm/Frozen memory shape (see `03-context-and-memory.md`).
- **`pi-memory`** — semantic (embedding) search over logs; the planned upgrade path for memory retrieval.

Registry caveats: third-party npm code running next to user data — vet the source, pin exact versions, prefer vendoring small ones. Most registry extensions assume pi's single-user coding context; treat them as *patterns* more than plug-ins.

## The practices we build on

These are the pi mechanics that make the mood/instruction system of `02-instruction-layers.md` work. Each is proven in pi's own codebase:

1. **Models are data, not code.** Provider *wire protocol* and *vendor* are separate open string unions; every model is a config record (id, api, cost, context window, compat flags) in a user-editable `models.json` that reloads without restart. Values support `$ENV` interpolation.
2. **Layered prompt assembly with leak-proof per-turn overrides.** The system prompt is a pipeline of parts; a hook may override it *per turn*, and the override is cleared in a `finally` after every run — temporary morphing can never contaminate the next turn.
3. **Presets with snapshot-and-restore.** "Modes" are plain preset files; activating one snapshots the previous state, deactivating restores it. This is the persona switcher.
4. **Self-modification through privilege indirection.** Model-callable *tools* deliberately lack session-control powers; only *commands* (the privileged, user-initiated path) can activate changes. An agent that wants to change itself writes a draft, then the activation rides the command path — auditable, rate-limitable, revocable.
5. **Progressive disclosure.** The prompt carries only names + descriptions + file paths; full documents load on demand. Keeps the prompt bounded no matter how much config exists.
6. **File formats:** Markdown + YAML frontmatter for anything humans edit (personas, moods, briefings), JSON/HJSON for machine config, code only for behavior. Discovery is convention-based, collisions are diagnostics, every resource carries provenance (path, scope, origin).
7. **Hot reload as a first-class operation.** One `/reload` re-reads everything; some files reload on every use automatically.
8. **Non-throwing contracts at async seams.** "Must not throw or reject; return a safe fallback" — one bad model call kills one reply, never the process.
9. **Blocking hooks are the policy seam.** Hooks can block tool calls (`{block: true, reason}`), transform input, and rewrite provider payloads — moderation, rate limits, approval queues, and tool confirmation all live here, invisible to the AI pipeline.
10. **Trust gates for locally-supplied code/config**, **cost accounting in the types** (every response carries token usage + computed cost), and **deterministic testing** via a scripted fake provider — no real API calls or keys in tests.

## The one structural difference to remember

pi's native unit is *one user ↔ one agent session*. A multi-user product is *many users ↔ one persona in one shared context* — closer to pi's queue/steer machinery (which has a "one-at-a-time" fairness mode) than to its plain chat loop. Private one-on-one contexts map to pi sessions almost 1:1; shared places need our own orchestration on top.
