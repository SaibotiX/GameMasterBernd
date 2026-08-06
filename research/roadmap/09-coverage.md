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
| Auth doors & credential custody | ● | R5/R11 · door table in [06](06-research-log.md) | ⚠ R11 ruling pending (door constraint) · door-table re-run at login-build week |
| House lane & ledger | ● | R12 · [02](02-friends-web-service.md) | ⚠ R12 ruling pending (funding vehicle) · Gemini EEA-paid-tier fact (06, 2026-08-06) feeds the model mix |
| Session recording & consent | ● | R13 · [06](06-research-log.md) 2026-08-05 | deletion dry-run before the first friend (02 checklist 9) |
| Stage-1 page | ● | R14 · [08](08-stage1-web-ui.md) | build |
| Licensing & copyright | ● | R3/R4 · [04](04-licensing-and-ip.md) | LICENSE line into the friend intro (02 checklist 11) |
| Hosting provider | ● | R18 · [06](06-research-log.md) §2026-08-06 hosting | purchase + AVV (02 item 1) · re-compare the field at renewal |
| Domain, TLD, registrar | ● | R17 · [06](06-research-log.md) §2026-08-06 name's ground | buy worldconsole.eu at INWX (02 item 1) · premium-tier check at the cart · .com expiry watch late Oct 2026 |
| Game & studio name | ● | R16 · [06](06-research-log.md) §§ name's ground + trademark | dated public use + first-use archive start with the page (R16) |
| Trademark & registrations | ◐ | [06](06-research-log.md) §2026-08-06 trademark | €0 now · professional search + EUTM 41+9 with SME voucher at stage 2→3 · Italian-mark check before filing |
| Company form & Gewerbe (AT) | ● | R21 · [06](06-research-log.md) §2026-08-06 founding & tax | registration only pre-stage-2 (03 gate) · re-confirm the branch at registration |
| Tax & VAT | ◐ | same section | tripwires: profit €730 · SVS €6,613.20 · EU-digital €10,000 · Familienbeihilfe limit (R21) · any ALG episode · January re-verify of indexed values · VAT path finalizes with the stage-2 payments ruling |
| Payment processor & rails | ◐ | [06](06-research-log.md) §2026-08-06 payments · Stripe standing per [03](03-public-launch.md) | ruling deliberately deferred to the stage-2 build (maintainer, 2026-08-07): Stripe direct vs Stripe-MoR · €10 pack floor · Widerrufsbutton (in force 2026-10-01) in the checkout |
| Consumer-law build-list | ◐ | same section | build with the shop: button wording, § 18 checkboxes, unused-credit refunds, gross prices, no ODR link |
| Impressum & website duties | ● | R19 · [06](06-research-log.md) §2026-08-06 compliance gaps | page live before the first friend (maintainer fills in the address) · ⚠ address re-ruled before stage-3 public |
| Privacy papers beyond R13 | ◐ | same section | VVZ · threshold assessment · DPA collection · breach runbook — stage-1 build items |
| AI Act (Art. 50, live 2026-08-02) | ◐ | same section | disclosure sentence + text marking with the R14 build · ⚠ AT authority designation watch |
| Age policy | ● | R20 | 18+ assertion into invite-acceptance (stage-1 build) + the purchase flow (stage 2) · revisit at stage-3 planning |
| Accessibility (EAA/BaFG) | ⊘ | compliance section | trigger: ≥10 persons or >€2 M — or stage 4 |
| Product liability (PLD 2024/2853) | ⊘ | compliance section | trigger: public availability past 2026-12-09 |
| DSA duties | ◐ | [03](03-public-launch.md) + compliance section | Art. 11/12/14/16 land at stage-2 build |
| Steam | ● | R7/R8 · [07](07-steam-launch.md) | re-verify all policy facts at stage-4 planning |
| Offline copies | ● | [05](05-offline-distribution.md) | on demand |
| Security hardening & backups | ◐ | [02](02-friends-web-service.md) + compliance-section proposals | land the proposals in the stage-1 build |
| Ops runbooks (support · breach · deletion) | ◐ | [03](03-public-launch.md) §support · compliance §breach · R13 deletion | write with the stage-1 build; exercise per the exit gates |
| Insurance (IT-Betriebshaftpflicht) | ○ | one line in the founding & tax section | quote at stage 2–3 |
| Marketing, community, store presence | ○ | only [07](07-steam-launch.md)'s wishlist notes exist | stage-3 planning round |
| Mail on the domain | ◐ | hosting section (Migadu proposed) | ruling still open (not covered by R18, 2026-08-07) · needed for the published privacy/support contact before the first friend |
| Upstream engine dependency (pi, 0.x) | ◐ | [pi-upgrades.md](../design/pi-upgrades.md) — the rite + coupling register | pin-policy ruling open (§open there) · stage-1 Dockerfile pins the exact pi version (02 item 2) |
