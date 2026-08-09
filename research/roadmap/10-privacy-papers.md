# The privacy papers — the standing GDPR & AI-Act records (stage 1)

Written 2026-08-09 in the words round, on the maintainer's ruling that the
"before the first friend" papers fold into that round. Evidence lives in
[06-research-log.md](06-research-log.md) §2026-08-06 compliance gaps and
§2026-08-08 the house key — this file never re-argues it; it IS the papers
those sections said to keep. The player-facing words live on
worldconsole.eu (landing, `datenschutz.html`, `impressum.html`) and in
`deploy/friend-intro.md`; this file is the internal side. Update at every
stage gate; the stage-2 build adds the payments rows.

## 1 · VVZ — Verzeichnis von Verarbeitungstätigkeiten (Art. 30)

Controller: Tobias Maier (address per the Impressum's box-set value ·
tobias.maier45@gmail.com). No DPO (Art. 37 criteria not met), no EU
representative (established in Austria).

**A — Play-session recording & research corpus (R13).**
Purpose: debugging and design analysis of World Console (the
ranked-findings playtest loop). Basis: consent at invite-acceptance,
Art. 6(1)(a). Subjects: invited players, 18+ (R20). Data: full session
transcripts (everything typed and answered, timestamps, per-turn cost
stamps, session ids), the world/chronicle files play creates, player
handle. Recipients: none; the maintainer alone reads. Processors: netcup
GmbH (hosting, EU/Vienna, AVV concluded 2026-08-08) · Anthropic (model
API — per-turn content; no training on API I/O; deleted within 30 days at
most, R29). Transfer: Anthropic, USA — EU standard contractual clauses
(their auto-incorporated DPA). Deletion: beta life + 12 months at most;
within a month on withdrawal; per-player deletion runbook in
`deploy/README.md`. Security: per-friend containers (read-only image,
caps dropped), 0700 root-only store, tmpfs credentials (R11's wipe),
box hardening per the runbook; encrypted off-box backup rides item 13.

**B — Invites, consent register & support mail.**
Purpose: onboarding, proof of consent (Art. 7(1)), support. Basis:
Art. 6(1)(b)/(f). Data: name/handle, contact channel, the consent rows
(`deploy/host/consents.md`, box-local: date · channel · the two yeses ·
note version), correspondence. Processor: Google (Gmail) when mail is
the channel — the nodded stage-1 shape (2026-08-08); Google is
DPF-certified (verified 2026-08-08); Migadu is the stage-2 shape.
Deletion: consent rows are kept, marked withdrawn, as long as any
recording is retained, and deleted with the corpus.

**C — Server logs (technical).**
Purpose: operations and security. Basis: Art. 6(1)(f). Data: journald
lifecycle and error lines (connects, disconnects, spawns — never play
content), the gateway's spend ledger (handle, model, token counts,
micro-USD — never play content; the billing truth, R12, kept for the
beta's life). Retention otherwise: journald's own rotation. Recipients:
none.

**D — Payments (stage 2, placeholder).** Grows with the shop: Stripe
dual-role (processor for business services, independent controller for
payments/fraud — 06 §payments), added to this VVZ at the stage-2 build.

## 2 · DPIA threshold assessment (one page, dated 2026-08-09)

Not on the DSB's DSFA-V blacklist; against WP248's nine criteria the
processing touches ~2 (evaluation-adjacent research analysis; innovative
tech in the LLM API) and misses the rest: no systematic covert
monitoring (recording is the loudly disclosed point, consented), no
special categories sought (free text could carry anything — the
minimization ask stands, the corpus is never mined for it), invite-scale
subjects (single digits), no matching, no vulnerable groups (18+, R20),
no automated decisions with legal effect, no rights-blocking.
**Verdict: DPIA not mandatory at stage 1.** Re-run this page when any
trigger fires: public signups (stage 3) · anyone under 18 · analytics
or tracking added · scale beyond the invited circle · any use of the
corpus beyond debugging/design. (⚠ standing note from 06: read the
DSFA-V annex verbatim at the stage-3 re-run — RIS served 503 on the
research day.)

## 3 · DPA / AVV collection

| Processor | Role | Paper | State |
|---|---|---|---|
| netcup GmbH | hosting (box, Vienna) | click-AVV in the CCP | concluded 2026-08-08 (R18) |
| Anthropic | model API (house lane, R29) | DPA auto-incorporated in the Commercial Terms; SCCs for the US transfer | standing since the org account (2026-08-09) |
| Google (Gmail) | mail channel (stage-1 nod) | consumer terms — the known wart; DPF-certified | accepted 2026-08-08 until Migadu (stage 2) |
| Hetzner (Storage Box) | backup target (item 13) | AVV concluded electronically in the account | concluded at order 2026-08-09 (BX11 Falkenstein; the borg lane built on it 2026-08-10) |

Re-verify the provider table at every stage gate (06 §compliance, the
⚠ fast-moving flags; DPF watch C-703/25 P stands).

## 4 · Breach runbook (Art. 33/34)

1. Contain, then write the facts down the same day: what leaked, when,
   whose data, how far (the internal log is kept regardless of severity,
   with the fix).
2. Risk to rights? → DSB within **72 h** (webform or dsb@dsb.gv.at;
   partial-then-supplement is allowed).
3. High risk (the transcript store or a session volume leaks) → tell the
   affected players plainly, same channel as their invite.
4. The deletion and backup runbooks (`deploy/README.md`) are the
   containment tools; netcup and the provider consoles are 2FA'd.

## 5 · AI Act (Reg 2024/1689, Art. 50 — applicable since 2026-08-02)

- **Role:** downstream **provider of the AI system** (the game integrates
  GPAI via API and offers it under our name — Commission Art.-50
  guidelines, 2026-07-20). Annex III checked: not high-risk; no Art. 5
  practice. Art. 4 literacy: solo operator, informed (this file + 06).
- **Art. 50(1) — say it's AI:** the sentence "You are playing with an AI
  game master — an AI system generates the story text" stands in three
  places: the landing page, the page's first-run notice, and the privacy
  note. At latest at first interaction — satisfied before it.
- **Art. 50(2) — machine-readable marking, the technique note:** robust
  text watermarking does not exist for our shape; per the Code of
  Practice's metadata/provenance route (2026-06-10, assessed adequate)
  the marking is: `<meta name="ai-generated" content="true">` on the
  play page (the surface that streams generated story text), and an
  `x-ai-generated: true` response header on every served chronicle file
  (`data/world/**` — AI-written prose). Deliberately NOT marked:
  `data/downloads/` (Wikimedia Commons media, not generated) and
  `config/` (human-written law). Human-readable notice accompanies the
  machine marking everywhere (50(1) above). Adopted without signing the
  CoP — the 2026-08-06 proposal (3), ruled 2026-08-09.
- **Open question, kept honest:** whether an invited, free, closed beta
  is "placing on the market" at all (06 records it) — compliance is
  built regardless; the question decides only whether 50(2) formally
  binds at stage 1 or 2.
- **⚠ Watch:** Austria has designated no market-surveillance authority
  yet (KI-Servicestelle at RTR is advisory) — re-check the
  Durchführungsgesetz at each stage gate.

## 6 · Hardening state (the per-stage gap list's tail)

HSTS + CSP/nosniff/frame/referrer headers on the root site — landed with
the landing ground (words round) · SSH keys-only, no swap, no core
dumps, DOCKER-USER firewall — standing since first deploy (runbook) ·
2FA on registrar/VPS/provider consoles — maintainer's errand, asserted
2026-08-08 with the purchases · unattended-upgrades + monthly dependency
pass — box routine (runbook §updates) · restore test — item 13's round,
gates the first invite (ruled 2026-08-09).
