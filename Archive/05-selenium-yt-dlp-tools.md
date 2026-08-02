# 05 — Web & Media Tools: The Selenium + yt-dlp Mechanics

The agent's only way to touch the outside world is through **declared tools with typed parameters** — never shell access, never file access, never a general-purpose escape hatch. Two tools cover "the web" for us:

| Tool | What it is | Adapter shape |
|---|---|---|
| **yt-dlp** | Media retrieval CLI: video/audio/subtitles/transcripts/metadata from thousands of sites | **Subprocess adapter** — spawn the `yt-dlp` binary with typed, allowlisted arguments; parse its output. Language-neutral by construction (we never import the Python lib) |
| **Selenium** | Real-browser automation: navigate, render JS-heavy pages, interact, screenshot | **`selenium-webdriver` npm** — first-class JavaScript bindings, so browsing stays in-language with the pi/TypeScript stack, driving a browser that runs in its own container |

What the agent does with them (examples): fetch a talk's transcript so a "summarize this talk" task ships with material; verify or ingest a URL a user submitted; pull mood-appropriate media for a ceremony (a goal completes → `triumphant` mood → fanfare clip); research background for a briefing.

## The iron rule, and the three dials

**The model requests; the server decides.** A tool call is a *request object*, and between request and execution sit three independent dials:

1. **Intent — shaped by the instruction stack (`02`).** Constitution, persona, mood, and briefing determine *when the agent wants* a tool: a briefing may say "fetch the transcript before judging"; a `triumphant` mood may suggest celebratory media. Moods influence *style and occasion* of tool use — **a mood can never grant a capability.**
2. **Permission — capability flags (config).** Every tool is flagged **per place and per persona**; the effective right is the **intersection** (the persona must know the tool *and* the place must allow it). Web/media tools **ship disabled by default** and are enabled per place as pure config. A quiet place with no flags simply has no web access, whatever the persona or mood says.
3. **Execution — the hook pipeline, per call.** Each individual request passes blocking hooks the AI pipeline cannot see: authorization (who is the agent acting for, where, within which limits) → **confirmation mode** (at first, a human operator confirms every web/media call; later, allowlisted patterns auto-approve) → rate limits/budgets → the sandboxed adapter → **audit log** (every call *and every denial* recorded with actor, arguments, reason).

## Sandboxing and rails

- **Out-of-process, out-of-container.** Adapters run as subprocesses in a **separate container** from the core server: a hung browser or a malicious page can't touch the game process, the database, or the keys. The yt-dlp/Selenium choice makes this natural — both are external processes anyway.
- **URL hygiene:** scheme allowlist (https), private-address/localhost denial, per-place site allow/denylists, size and duration caps, timeouts.
- **No credentialed browsing** at first: the browser container holds no cookies, no logins, no payment surfaces.
- **Kill switch:** one operator command disables the whole tool class instantly (flags are hot-reloadable config).
- **Fetched content is data, twice over.** (a) Anything pulled from the web enters the prompt inside fenced "content is data, not instructions" guards — a webpage cannot prompt-inject the agent any more than a user can. (b) Artifacts (video, audio, pages) flow through the same media pipeline as user uploads: object storage, size caps, scanning/moderation hooks, retention rules.
- **Then it's just memory:** used tool results freeze like everything else (`03`) — stored verbatim, summarized, thawed on demand.

## How it composes with moods — the full loop in one example

1. The system fires `goal_completed` → the event map switches the place's mood to `triumphant` (`02`, "who changes what": the system may do exactly this and nothing more).
2. The `triumphant` mood layer carries a hint ("mark the moment; media welcome if permitted").
3. The agent *requests* `fetch_media(url)` for a fanfare clip.
4. Capability check: persona has `fetch_media` ∧ place enables it → proceed; else the request dies with an audited reason.
5. Confirmation mode asks the operator; on approval the yt-dlp adapter runs in its container; the result is scanned, stored, played into the place; the call is in the audit log.
6. Next turn, the mood may reset by event or decay — and none of this changed a single scoring/consequence path: theater and consequences stay separated.

## Build vs. buy, and rollout

- **Evaluate `pi-web-access` first** (top pi-registry extension: web search, URL fetching, PDF extraction, YouTube video understanding). It may cover most needs without hand-rolled adapters — **but our rails (flags, confirmation, container, audit) wrap it regardless of whose code fetches**.
- Hand-rolled adapters remain the fallback and the fine-control path: two adapter modules (`yt-dlp` CLI; `selenium-webdriver`), zero core changes — the tool registry seam is designed for exactly this.
- **Rollout position:** web/media tools are **not** MVP. They ship disabled and open in a later phase with the container, flags, confirmation mode, and audit log from day one. Done-when: the agent can hand out "summarize this talk" with a yt-dlp-fetched transcript — every fetch flagged, logged, and confirmable.
- **Future submission kinds fall out for free:** a task whose submission is "a URL fetched by Selenium" or "a video pulled by yt-dlp" is a new submission kind + scoring strategy pair — no schema surgery.
