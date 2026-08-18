# The hub build plan — phases for fresh sessions

Written 2026-08-18. Four phases, each a session-sized round with its own gate, verification and commit boundaries; H1–H3 start only after H0's rulings. The cold-start rule applies: a fresh session needs only CLAUDE.md → `research/hub/` → the owning docs named per phase.

## H0 — rulings and prep (no code; maintainer + one short session)

**Gate: the five rulings in [README.md](README.md) §Open rulings.** Then:

- **The R entry lands** in `research/roadmap/01-decisions.md` (next free id — R34 as of 2026-08-18). Draft to adapt at ruling time:
  > **R34 — The hub: one box, many doors.** The stage-1 box and worldconsole.eu become the shared home of the maintainer's small projects: apex = hub page, one subdomain family per tenant, one ingress Caddy (World Console's, promoted in place), tenants on a dedicated ingress network under the hardened anchor, per-tenant backups on the existing Storage Box. World Console keeps priority — tenants are evictable guests. Design + workflow: `research/hub/`. Touches, deliberately: R18's single-purpose rationale (widened, letter intact), the 2026-08-17 exits picture (cancelling the basket now evicts every tenant — dated note there at H1), guide 30's rent-a-box default (second lane at H3). R17 untouched **[or: revised, if the second-domain option was chosen]**. Rejected: a box per project (~€11/mo each), PaaS layer, path-based mounting, wildcard TLS — reasons in `research/hub/01-architecture.md`.
- **Adsum's repo gets a real home before anything deploys** (maintainer's machine, ~10 min): move `~/Downloads/ISA` → `~/Desktop/CurrPC/Programming/Adsum` (or the name of choice), create a **private** GitHub repo, `git remote add origin … && git push -u origin master`. Today it is one disk failure from gone.
- Flag for the next template session (its repo, not ours): its `records/coverage.md` git-remote row is stale — the remote exists now, the trigger fired.
- Coverage row here flips ○ → ◐ (evidence + plan landed, rulings open) at this round's wrap; ◐ → ● when R34 lands.

## H1 — the hub stands, World Console sole tenant (one session, on the live box)

Work, in commit-sized steps (each green before the next):

1. **Ingress machinery:** `import sites/*.caddy` + tracked `caddy/sites/.keep.caddy` + gitignore line for box-local `sites/*.caddy`; the attachable `ingress` network on the caddy service; `firewall.sh` verified (or minimally extended) to bind the new network's subnet into the RFC-1918 egress block. Gate: `localcheck.sh` green (the rig gains nothing yet — the glob is empty-but-for-keep).
2. **The apex re-cut:** `index.html` becomes the hub page — WC card carrying today's load-bearing sentences verbatim (by-invitation line, R13 disclosure, AI-Act 50(1) sentence), Impressum/Datenschutz links unchanged, hardening headers unchanged; `localcheck.sh`'s words-probe updated only where selectors moved. **Seen-gate (R9): the maintainer sees the rendered page before the round wraps.** Branding per H0's ruling; if Hausregel — archive the dated first-use evidence per R16 (the same box-local set the names round used).
3. **Deploy + prove:** box update per runbook recipe, then from outside: apex 200 + headers + new words; `play.` unchanged (404 sentence, one live door 200); `vault.` unchanged; certs still auto-renewing (`docker compose exec caddy caddy list-certificates` or the logs).
4. **Records:** runbook gains §Tenants (table seeded with World Console itself — the ingress's own resident) + a dated state note; **`/guide-sync` runs** (deploy/ moved: at least guide 00/01/04/10/20 touched; 30 waits for H3); the exits entry (`06-research-log.md` §2026-08-17) gains its one dated sentence (wind-down now evicts tenants — pulls first, per tenant). Wrap commit.

Rollback: every step is a revert (R9); the apex re-cut is the only player-visible change and reverts to today's landing in one commit.

## H2 — Adsum aboard (one session tenant-side + one box sitting; first live run of the contract)

**Gate: H1 wrapped; Adsum repo moved + remoted (H0); the "adsum" name question answered enough to show it on a subdomain** — its EU/AT TMview check is still open in its own records; the maintainer may rule the quiet friends-stage exposure acceptable meanwhile, or run the check first (it was only ever blocked by the dev box's network).

1. **Tenant-side (its repo, its records):** hostnames `adsum.worldconsole.eu` / `app.adsum.worldconsole.eu` replacing the EDITMEs; `box-site.caddy` created from its current Caddyfile's two site blocks; compose to hub mode (caddy → `local` profile only; ingress external network + `adsum-app` alias); backup EDITMEs → BX11 `…/./borg/adsum` + own passphrase; systemd paths already `/home/deploy/adsum`; landing gains the apex-Impressum link + its own privacy words. Its `localcheck.sh` must stay green solo — hub mode may not break the self-contained rig.
2. **Box-side:** the §B onboarding checklist, verbatim, top to bottom — DNS rows, clone, env, image, fragment cp, up + reload, outside probes (401/401/200 door, uniform 404, landing headers), borg init + hand-run backup + **restore drill**, timers staggered clear of 04:11–05:14, pager topic live (test-fire the alert path once), §Tenants row + state note, apex card flips from `coming` to live. Regression: WC doors from outside.
3. **Records:** what §B's live run taught lands back in [02-wiring-workflow.md](02-wiring-workflow.md) (dated deltas, not silent edits); runbook state note; `/guide-sync` if any WC-side `deploy/` file moved beyond `sites/` box-locals.

## H3 — the workflow travels (template session + one mother-side records commit)

1. **Template repo:** hub mode per [02-wiring-workflow.md](02-wiring-workflow.md) §D — the phase-fork, the compose stanza, `box-site.caddy`, the contract checklist in "Making it yours"; its own records per its law (own R id citing `WC research/hub/`); its stale coverage row fixed in passing. Verification: its localcheck still green solo; a dry hub-mode render against a scratch compose config (`docker compose config`) proving the external-network stanza parses.
2. **Mother-side:** `deploy/guide/30` gains the "joining an existing box" lane (via `/guide-sync`, stamps advanced); the coverage row flips ●; this folder's README gains a "built — see the runbook" status line. Wrap.

## Standing verification, all phases

The full recipe before any push (unit gate untouched — no `extension/` changes anywhere in this plan); box changes prove from **outside**; every backup change ends in a restore drill; no commit mid-broken. The one recurring trap, named once: **a box-side Caddy reload with a bad fragment takes every tenant down** — `caddy validate --config` (in-container) runs before every reload from H1 on; put it in the runbook §Tenants procedure line itself.
