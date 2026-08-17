# The coverage register — what's answered, what's open (R15)

Created 2026-08-06 on the maintainer's instruction (decision R15). The guardrail's sibling: **zero silent unknowns** — the corner you find yourself in one day is always a question nobody wrote down. Every product-side domain this project will eventually meet has a row; the row **points** at the owning record and never restates it (one truth, one home).

**How to use (binding, per R15 and the root CLAUDE.md):**

- A session touching product/distribution territory checks this register the way it already checks the decision registries.
- New territory — a domain, duty, or question no record covers, surfaced anywhere (conversation, research, play, the news) — gets a row **before the session ends**, marked ○ with its trigger.
- Statuses: **●** owned (a standing decision/spec answers it) · **◐** evidence landed, ruling or build still open · **○** open, no evidence yet · **⊘** not yet relevant, trigger named.
- When a ruling lands, the row flips to ● and points at the R entry. Rows are one line; depth lives in the owning doc.

Game-design law is deliberately **not** mirrored here — [`research/design/undertakings-goals.md`](../design/undertakings-goals.md) (G/F/P/A) and the build log's decisions log own that side.

| Domain | St | Truth lives | Open edge / next trigger |
|---|---|---|---|
| Distribution architecture & stages | ● | R1–R2, R6 · [02](02-friends-web-service.md)–[08](08-stage1-web-ui.md) | stage gates inside each spec |
| Auth doors & credential custody | ● | R5/R11 (revised 2026-08-08: on ice) · icebox entry · door table in [06](06-research-log.md) | doors + vault iced, house lane only — revival conditions in the icebox; the 2026-08-05 ⚠ ruling-request dissolved with the doors |
| House lane & ledger | ● | R12 · R29 · [02](02-friends-web-service.md) item 8 · `deploy/host/gateway/` | LIVE, round closed 2026-08-09 (drain test + the played turn green); open: telemetry tunes the grant/estimate numbers · the side-call spend question RULED 2026-08-09: tag-and-subtract adopted and built the same day — side calls ride the gateway's /side prefix (laneModel), their ledger rows carry `side:true` under the same caps, reconcile names and subtracts them (localcheck holds all three receipts) · the fix's lane eyeball ran green 2026-08-09 (/gm + /history long behaved on the lane) · Gemini EEA/under-18 facts re-verified 2026-08-08 |
| Session recording & consent | ● | R13 · [06](06-research-log.md) 2026-08-05 | deletion dry-run green 2026-08-09 (words round, runbook §deletion — probe erased end to end on production) · consent flow live (consents gate) |
| Stage-1 page | ● | R14 · [08](08-stage1-web-ui.md) · R30 | build · player mode ruled 2026-08-10 (R30): the terminal chrome inside the page is curated for friends — game footer line only, quiet startup + banner, 15-command surface; the maintainer's console unchanged |
| Licensing & copyright | ● | R3/R4 · [04](04-licensing-and-ip.md) | done 2026-08-09 — the friend intro carries the LICENSE line (words round) |
| In-game media sourcing (the glass's legality) | ● | R24 · [06](06-research-log.md) §2026-08-07 real video | catalogue complaints → the revival shapes (06 §) · ⚠ Commons rate limits changeable — re-verify at stage-1 build |
| In-game voice (TTS) | ◐ | [06](06-research-log.md) §2026-08-08 the voice | evidence landed, park proposed (trigger: 08 page build, or a friend asks) — adopt/spike ruling with the maintainer; licenses re-verified at adoption |
| Hosting provider | ● | R18 · [06](06-research-log.md) §2026-08-06 hosting | purchase + AVV done 2026-08-08 · re-compare the field at renewal |
| Domain, TLD, registrar | ● | R17 · [06](06-research-log.md) §2026-08-06 name's ground | worldconsole.eu bought 2026-08-08 · .com expiry watch late Oct 2026 |
| Game & studio name | ● | R16 · [06](06-research-log.md) §§ name's ground + trademark | dated public use live + first-use set archived box-local 2026-08-09; web-archive save stopped by ruling (receipt: 06 §2026-08-09) |
| Trademark & registrations | ◐ | [06](06-research-log.md) §2026-08-06 trademark | €0 now · professional search + EUTM 41+9 with SME voucher at stage 2→3 · Italian-mark check before filing |
| Company form & Gewerbe (AT) | ● | R21 · [06](06-research-log.md) §2026-08-06 founding & tax | registration only pre-stage-2 (03 gate) · re-confirm the branch at registration |
| Tax & VAT | ◐ | same section | tripwires: profit €730 · SVS €6,613.20 · EU-digital €10,000 · Familienbeihilfe limit (R21) · any ALG episode · January re-verify of indexed values · VAT path finalizes with the stage-2 payments ruling |
| Payment processor & rails | ◐ | [06](06-research-log.md) §2026-08-06 payments · Stripe standing per [03](03-public-launch.md) | ruling deliberately deferred to the stage-2 build (maintainer, 2026-08-07): Stripe direct vs Stripe-MoR · €10 pack floor · Widerrufsbutton (in force 2026-10-01) in the checkout |
| Consumer-law build-list | ◐ | same section | build with the shop: button wording, § 18 checkboxes, unused-credit refunds, gross prices, no ODR link |
| Impressum & website duties | ● | R19 · [06](06-research-log.md) §2026-08-06 compliance gaps | live whole 2026-08-09 — address env set on the box, render verified · ⚠ address re-ruled before stage-3 public |
| Privacy papers beyond R13 | ● | [10-privacy-papers.md](10-privacy-papers.md) (built 2026-08-09) | payments rows at the stage-2 build · threshold re-run at stage 3 |
| AI Act (Art. 50, live 2026-08-02) | ● | [10-privacy-papers.md](10-privacy-papers.md) §5 · 06 §compliance | 50(1) sentence live ×3, 50(2) marking landed (words round) · ⚠ AT authority designation watch · the "placing on the market" question decides 50(2)'s formal start (06) |
| Age policy | ● | R20 | 18+ assertion rides invite-acceptance since 2026-08-09 (consents gate, words round) · the purchase flow adds its own (stage 2) · revisit at stage-3 planning |
| Accessibility (EAA/BaFG) | ⊘ | compliance section | trigger: ≥10 persons or >€2 M — or stage 4 |
| Product liability (PLD 2024/2853) | ⊘ | compliance section | trigger: public availability past 2026-12-09 |
| DSA duties | ◐ | [03](03-public-launch.md) + compliance section | Art. 11/12/14/16 land at stage-2 build |
| Steam | ● | R7/R8 · [07](07-steam-launch.md) | re-verify all policy facts at stage-4 planning |
| Offline copies | ● | [05](05-offline-distribution.md) | on demand |
| Security hardening & backups | ● | [02](02-friends-web-service.md) + compliance-section proposals · built in `deploy/` | box-side execution done, first deploy 2026-08-08 (TLS live, hardening + firewall standing) · backup round done 2026-08-10 — the borg lane nightly to the BX11 (≤28-day prune binding §deletion), the restore gate green on the real repo, R18's pull leg proven (runbook §Backups + backups-round state note) · the pager lands 2026-08-10 (runbook §the pager): unit failures ring the ntfy topic, the backup's success is the nightly heartbeat · open edge: no watcher independent of the box — the heartbeat's silence is the box-down signal; revisit at the stage-2 gates or on the first missed heartbeat · restore re-proven per the stage-2 gates |
| Ops runbooks (support · breach · deletion) | ◐ | [03](03-public-launch.md) §support · compliance §breach · R13 deletion | write with the stage-1 build; exercise per the exit gates |
| Insurance (IT-Betriebshaftpflicht) | ○ | one line in the founding & tax section | quote at stage 2–3 |
| Marketing, community, store presence | ○ | only [07](07-steam-launch.md)'s wishlist notes exist | stage-3 planning round |
| Mail on the domain | ◐ | hosting section (Migadu proposed) | stage 1 runs on the maintainer's personal gmail for every contact duty — Impressum, ACME, privacy-note/support (nod 2026-08-08) · Migadu stays the stage-2 shape |
| Upstream engine dependency (pi, 0.x) | ◐ | [pi-upgrades.md](../design/pi-upgrades.md) — the rite + coupling register | pin-policy ruling open (§open there) · Dockerfile pin landed (0.84.1, `deploy/image/`, 2026-08-08) |
| Ops teaching layer (the deploy guide) | ● | `deploy/guide/` — explanations · how-tos · reference · blueprint; live ops truth stays `deploy/README.md` (the runbook wins on conflict) · freshness: R31 (`/guide-sync`) | landed 2026-08-17, pages synced at `4ba34eb` · freshness workflow landed 2026-08-17 (R31 — deploy-touching rounds run `/guide-sync` at the wrap) · the external minimal template built and verified 2026-08-17: its own repo outside this one at `~/Desktop/CurrPC/Programming/Example_Web_Server_Project`, localcheck green end to end twice on the dev machine (guide 30's header is the pointer) |
