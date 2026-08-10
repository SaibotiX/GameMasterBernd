# The pi upgrade rite — living on a 0.x engine

Created 2026-08-07, the day pi 0.84.0 (released 2026-08-06) killed the boot: the stock footer stopped asking `modelRuntime.isUsingOAuth()` and started asking `modelRuntime.isUsingSubscription()`, our hand-built session shim knew only the old question, and every render frame died with an uncaughtException before the first prompt. This document owns **how this project rides on pi**: the register of couplings, the upgrade workflow, and the principles behind both. The verification recipe itself stays where it lives (root `CLAUDE.md` → build log); this doc is why and when to run it.

## The ground truths

1. **pi is version 0.x.** Under [semver](https://semver.org/), major version zero means *"anything MAY change at any time; the public API SHOULD NOT be considered stable."* Every pi bump is a potential breaking release, however innocent the number looks. Treat each one as major until the recipe says otherwise.
2. **We depend past the documented edge in a few known places** — and [Hyrum's Law](https://www.hyrumslaw.com/) says that is how it always goes: *with enough users, every observable behavior gets depended on, contract or no contract.* We are the somebody: the footer shim feeds pi's own `FooterComponent` a hand-built session object, which is exactly where 0.84.0 bit.
3. **The armor goes at the boundary, not through the codebase.** Game modules (ledger, prompt, worlds) never learn pi's shapes; the pi-facing seam in `extension/index.ts` translates and absorbs. When drift lands, it lands in the shim — one file, one fix.
4. **The changelog is trustworthy — read it first.** pi ships `CHANGELOG.md` in the package with an explicit Breaking Changes section; 0.84.0's list named the exact method before we went looking. The crash is the receipt; the changelog is the map.

## The register of couplings

The live truth is the code — re-derive it any day with
`grep -n "pi\.\|ctx\." extension/index.ts .pi/extensions/*.ts` and the spawn lines in `extension/test/integration.ts`, `aitester/tools/*.mjs`. What belongs HERE is the tier each coupling sits in and which recipe leg guards it:

| Tier | Coupling | Where | Guard |
|---|---|---|---|
| 1 · documented extension API | `pi.register*`, `pi.on(…)`, `pi.setActiveTools`, `ctx.ui.*`, `ctx.sessionManager`, `SettingsManager`, pi-ai `StringEnum`, pi-tui `Text`/`truncateToWidth` | `extension/*.ts`, `.pi/extensions/usage-limits.ts` | changelog watch + unit/integration |
| 2 · public export, internal contract — **the known soft spots** | `FooterComponent` fed a hand-built `sessionLike` (the 0.84.0 wound; degrade guard active — drift shows a ⚠ marker, play continues) | `extension/index.ts` §footer | **tty-probe** + the marker itself |
| 2 | `ctx.ui.setWidget` factory contract (`(ui, theme) => Component` — a bare object poisons tool results; learned in playtest 4) | `extension/index.ts` widgets | tty-probe + hard-wrapped widget paths |
| 3 · external process | RPC line protocol — substring matches on event names, `message_end` authoritative, never the deltas (which is why 0.84.0's `message_update` slimming cost nothing) | `extension/test/integration.ts`, `aitester/tools/*` | integration + wrapper-smoke |
| 3 | the app server spawns `pi` as a full-screen TUI in a PTY (node-pty, `encoding:null`), leans on repaint-on-SIGWINCH for client reattach, and the web probes assert the footer's `mood:` mark through the stream | `deploy/image/appserver/server.js`, `deploy/image/appserver-probe.mjs`, `deploy/image/ws-probe.mjs` | deploy verify legs 3–4 (`deploy/image/verify.sh`) |
| 2 | the image pre-bakes `fdfind`/`rg` because pi's tools-manager tries `systemBinaryNames` on PATH before downloading from GitHub (undocumented internal; if the names drift, boots silently stall on downloads again) | `deploy/image/Dockerfile` | verify leg 2 going slow/red is the tell |
| 2 | gmchat's side-call facade: pi-ai `builtinModels` over pi's own `auth.json` (hand-built CredentialStore) + `Models.complete` honoring the PASSED model's `baseUrl` — laneModel's gateway routing rides this; only a per-credential `auth.baseUrl` (Copilot-style OAuth) outranks it | `extension/gmchat.ts` | unit (laneModel) + integration Part B; a side-call 401/misroute on the lane is the tell |
| 2 | the player gate (R30): `CustomEditor` subclass whose own `onSubmit` ACCESSOR catches `setCustomEditorComponent`'s post-factory assignment (pi wires the default editor's handler onto custom editors after the factory returns), plus an `actionHandlers` Map whose `set` refuses the workshop's copied keys — if pi stops assigning onSubmit or stops copying handlers, the gate silently gates nothing | `extension/index.ts` PlayerEditor | tty-probe player leg (blocked `/model` must draw the notice) + unit (playerGate) |
| 2 | the player popup filter (R30): wraps the composed `AutocompleteProvider` via `addAutocompleteProvider`, re-deriving pi's own isSlashCommand position test (bare-name command items, `beforePrefix` empty, no path separator) — if item values grow a leading slash or the position logic moves, the popup shows all or hides all | `extension/index.ts` §player chrome | tty-probe player leg (popup content) + unit (filterPlayerSuggestions) |
| 2 · test-only | unit.ts imports pi's `dist/core/slash-commands.js` TABLE as a file (resolved through the pinned binary on PATH) and holds it equal to R30's `PI_BUILTIN_COMMANDS` — an upgrade growing or shrinking pi's built-in set turns unit red BEFORE a stale block list serves a friend | `extension/test/unit.ts`, `extension/player.ts` | unit (the drift check is the guard) |

A new coupling to pi — any import past the documented API, any hand-built object handed to a pi class — gets a row here in the same commit that introduces it.

## The rite

Trigger: a deliberate upgrade, or a breakage that reveals one already happened. Same steps; breakage enters at step 3 with the stack in hand (the topmost pi frame + our frame name the coupling).

1. **Upgrades are sittings, not accidents.** Choose the moment; never mid-round, never before a batch. Note the span: `npm ls -g @earendil-works/pi-coding-agent` before and after.
2. **Read the span's Breaking Changes** — `~/.nvm/versions/node/*/lib/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md` — and check every named API against the register above (and the live grep when in doubt).
3. **Run the recipe** (root `CLAUDE.md` house rule): `node extension/test/unit.ts` → `bash extension/test/tty-probe.sh` → `node extension/test/integration.ts` → `node aitester/tools/wrapper-smoke.mjs`. The probe exists because RPC smoke cannot see interactive-only surfaces — the footer crash lived exclusively in the real TUI boot.
4. **Fix at the boundary.** Extend the shim, never spread pi's new shape inward. Anything that renders every frame keeps a degrade guard: broken stock UI becomes a ⚠ marker, never a dead game.
5. **Prove the detector.** Once per breakage class: reproduce against the pre-fix tree (`git stash` → probe FAILs → `git stash pop`). A test that has never failed is decoration.
6. **Record.** One dated line in the build log's decisions log (old→new version, what moved, what was ruled); new couplings get their register row; then commit/push per R9.

## Receipts — the principles and where they come from

- [Semantic Versioning 2.0.0](https://semver.org/) — §4: major version zero offers no stability promise. The whole rite follows from taking that sentence seriously.
- [Hyrum's Law](https://www.hyrumslaw.com/) — why "but it's a public export" is no defense: observable behavior becomes contract, and our shim depends on behavior pi never promised.
- [Anti-corruption layer (Microsoft Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) — the pattern the footer seam implements: a translating layer so an outside system's model never leaks into ours.
- Clean Code ch. 8 "Boundaries" (Robert C. Martin; [summary](https://www.codingblocks.net/podcast/clean-code-programming-around-boundaries/)) — wrap what you don't own; write *learning tests* that exercise the third-party code exactly as you use it, and rerun them on every upgrade. The tty-probe is a learning test wearing a bash coat.
- [Contract Test (Martin Fowler's bliki)](https://martinfowler.com/bliki/ContractTest.html) — the formal name for probe + integration: consumer-side tests run against the real dependency to catch contract drift the moment it ships.
- [Dependabot / dependency-update practice (GitHub docs)](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates) — the industry's version of the rite: changelog review + green tests gate every update, cooldown before adopting fresh releases. We run it by hand; automation is worth revisiting only if pi upgrades become frequent.

## Open to the maintainer (proposals, not law)

- **The pin policy.** Proposal: *pin by record* — the dev machine upgrades only through the rite, and each upgrade's build-log line IS the pin (global npm installs never move on their own, so discipline, not tooling, is the actual lock). A stricter alternative — refusing every upgrade until a chosen sitting — buys little beyond what step 1 already gives. Un-ruled; standing practice until then is the rite itself.
- **The stage-1 container pins exactly.** When the Dockerfile lands (roadmap [02](../roadmap/02-friends-web-service.md) item 2), it installs `@earendil-works/pi-coding-agent@<exact version>` — the box must never meet a pi surprise mid-service. Carried as the coverage-register trigger ([09](../roadmap/09-coverage.md)); rides into the Dockerfile commit when built.
