# The hub build plan — phases for fresh sessions

Written 2026-08-18. Four phases, each a session-sized round with its own gate, verification and commit boundaries; H1–H3 start only after H0's rulings. The cold-start rule applies: a fresh session needs only CLAUDE.md → `research/hub/` → the owning docs named per phase.

## H0 — rulings and prep (no code; maintainer + one short session) — DONE 2026-08-18

**Gate passed: the five rulings taken 2026-08-18** — direction adopted · worldconsole.eu kept + Hausregel branding · apex re-cut yes · Adsum aboard · ingress promoted in place — plus the same-sitting visibility ruling (every tenant origin public or private, cheaply switchable). The answers live in [README.md](README.md) §The H0 rulings. The prep:

- [x] **R34 landed** in `research/roadmap/01-decisions.md` (2026-08-18) — the draft that stood here adapted and superseded by the entry itself: R17 untouched, Hausregel branding, promotion-in-place ingress, the visibility requirement folded in.
- [x] **Adsum's repo has a real home** (done maintainer-side before the sitting; verified 2026-08-18): `~/Desktop/CurrPC/Programming/adsum`, remote `git@github.com:SaibotiX/adsum.git`, pushed, private (anonymous probe 404s). Beyond the H0 ask, its brand clearance closed at register-index level in its own records — the H2 name-gate is pre-answered (gate line updated below).
- [ ] Flag for the next template session (its repo, not ours): its `records/coverage.md` git-remote row is stale — the remote exists now, the trigger fired. *(Standing until that template session runs.)*
- [x] Coverage row: ○ → ◐ at the design round's wrap; ◐ → ● with R34 (2026-08-18).

## H1 — the hub stands, World Console sole tenant (one session, on the live box)

Work, in commit-sized steps (each green before the next):

1. **Ingress machinery:** `import sites/*.caddy` + tracked `caddy/sites/.keep.caddy` + gitignore line for box-local `sites/*.caddy`; the attachable `ingress` network on the caddy service; `firewall.sh` verified (or minimally extended) to bind the new network's subnet into the RFC-1918 egress block. Gate: `localcheck.sh` green (the rig gains nothing yet — the glob is empty-but-for-keep).
2. **The apex re-cut:** `index.html` becomes the hub page — WC card carrying today's load-bearing sentences verbatim (by-invitation line, R13 disclosure, AI-Act 50(1) sentence), Impressum/Datenschutz links unchanged, hardening headers unchanged; `localcheck.sh`'s words-probe updated only where selectors moved. **Seen-gate (R9): the maintainer sees the rendered page before the round wraps.** Branding ruled (H0): **Hausregel** — archive the dated first-use evidence per R16 (the same box-local set the names round used).
3. **Deploy + prove:** box update per runbook recipe, then from outside: apex 200 + headers + new words; `play.` unchanged (404 sentence, one live door 200); `vault.` unchanged; certs still auto-renewing (`docker compose exec caddy caddy list-certificates` or the logs).
4. **Records:** runbook gains §Tenants (table seeded with World Console itself — the ingress's own resident) + a dated state note; **`/guide-sync` runs** (deploy/ moved: at least guide 00/01/04/10/20 touched; 30 waits for H3); the exits entry (`06-research-log.md` §2026-08-17) gains its one dated sentence (wind-down now evicts tenants — pulls first, per tenant). Wrap commit.

Rollback: every step is a revert (R9); the apex re-cut is the only player-visible change and reverts to today's landing in one commit.

## H2 — Adsum aboard (one session tenant-side + one box sitting; first live run of the contract)

**Gate: H1 wrapped — the rest closed at H0 (2026-08-18):** Adsum's repo moved + remoted, and the name question is answered for this stage in its own records (TMview EU/AT clean in classes 9/42; its R3: the name stands for the friends circle; the professional search stays a filing-time step there).

1. **Tenant-side (its repo, its records):** hostnames `adsum.worldconsole.eu` / `app.adsum.worldconsole.eu` replacing the EDITMEs; `box-site.caddy` created from its current Caddyfile's two site blocks; compose to hub mode (caddy → `local` profile only; ingress external network + `adsum-app` alias); backup EDITMEs → BX11 `…/./borg/adsum` + own passphrase; systemd paths already `/home/deploy/adsum`; landing gains the apex-Impressum link + its own privacy words. Its `localcheck.sh` must stay green solo — hub mode may not break the self-contained rig.
2. **Box-side:** the §B onboarding checklist, verbatim, top to bottom — DNS rows, clone, env, image, fragment cp, up + reload, outside probes (401/401/200 door, uniform 404, landing headers), borg init + hand-run backup + **restore drill**, timers staggered clear of 04:11–05:14, pager topic live (test-fire the alert path once), §Tenants row + state note, apex card flips from `coming` to live. Regression: WC doors from outside. The visibility flip (§A.10) is exercised once here — landing gated + probed 401, flipped back + probed 200 — proving the one-fragment-edit promise on the first live tenant.
3. **Records:** what §B's live run taught lands back in [02-wiring-workflow.md](02-wiring-workflow.md) (dated deltas, not silent edits); runbook state note; `/guide-sync` if any WC-side `deploy/` file moved beyond `sites/` box-locals.

## H3 — the workflow travels (template session + one mother-side records commit)

1. **Template repo:** hub mode per [02-wiring-workflow.md](02-wiring-workflow.md) §D — the phase-fork, the compose stanza, `box-site.caddy`, the contract checklist in "Making it yours"; its own records per its law (own R id citing `WC research/hub/`); its stale coverage row fixed in passing. Verification: its localcheck still green solo; a dry hub-mode render against a scratch compose config (`docker compose config`) proving the external-network stanza parses.
2. **Mother-side:** `deploy/guide/30` gains the "joining an existing box" lane (via `/guide-sync`, stamps advanced); the coverage row flips ●; this folder's README gains a "built — see the runbook" status line. Wrap.

## Standing verification, all phases

The full recipe before any push (unit gate untouched — no `extension/` changes anywhere in this plan); box changes prove from **outside**; every backup change ends in a restore drill; no commit mid-broken. The one recurring trap, named once: **a box-side Caddy reload with a bad fragment takes every tenant down** — `caddy validate --config` (in-container) runs before every reload from H1 on; put it in the runbook §Tenants procedure line itself.
