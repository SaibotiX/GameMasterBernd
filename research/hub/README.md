# The hub — one box, many doors

Designed 2026-08-18 on the maintainer's instruction ("a website which is a hub for all my projects"). Status: **architecture decided on paper, nothing implemented** — the build waits on the rulings below and runs as its own fresh sessions ([03-build-plan.md](03-build-plan.md)). This folder owns the hub's *design*; the moment a phase lands, live-ops truth is `deploy/README.md` (the runbook wins, as everywhere), and this folder stays behind as the design record and receipts.

## What this is

The box (netcup Vienna, R18) and the domain (worldconsole.eu, R17) currently serve one project. The hub turns the **same box, same domain, same Caddy** into the shared home of several small projects: the apex becomes a landing hub with one card per project, each project lives on its own subdomain behind the one ingress Caddy, and a new project copied from the Example template joins with a short fixed procedure instead of renting its own ~€11/month box (which is what `deploy/guide/30-next-project-blueprint.md` assumes today).

Tenant #1 is World Console — unchanged in play, `play.` and `vault.` untouched. Tenant #2 is **Adsum**, the private-event invite service at `~/Downloads/ISA`: functionally complete, locally verified, never deployed — its own cost plan budgeted a second box; the hub absorbs it for €0 additional.

## The map

| File | Owns |
|---|---|
| [01-architecture.md](01-architecture.md) | the decided shape — origins, ingress, networks, isolation, legal pages, cost — and what was rejected, with reasons |
| [02-wiring-workflow.md](02-wiring-workflow.md) | the tenant contract (what an app repo must ship), the onboarding/offboarding procedures, and the template's hub-mode changes |
| [03-build-plan.md](03-build-plan.md) | the phased implementation plan for fresh sessions (H0–H3): gates, verification recipes, commit boundaries |
| [04-research-log.md](04-research-log.md) | dated receipts — online best practices, the "is this allowed" answer, alternatives priced, ground-truth sweep results |

## Open rulings (the maintainer's — they gate phase H0, nothing else moves first)

1. **The direction itself:** the box becomes the shared home of several projects. This amends the exits picture (06 §2026-08-17: cancelling the basket would now evict *every* tenant, not just stage 1) and strengthens the case for the standing hourly→12-month conversion (€7.92 → €5.96/mo) at the price of exit-any-hour. Ruling: adopt the hub direction — yes/no.
2. **Domain and branding:** hub at the worldconsole.eu apex (recommended — €0, R17 untouched, subdomains free) **vs** a second neutral domain (~€6–9/yr, ⚠ deviates from R17 "one domain, alone" and needs that entry revised). Independent of that: brand the hub page as **Hausregel** (the studio, R16 — a hub is the studio presenting its works, and dated public use starts the €0 name protections R16 wants archived) or keep it unbranded.
3. **The apex page changes:** today's by-invitation World Console landing becomes a hub page carrying the WC card (disclosure sentences preserved verbatim). Player-visible — the seen-gate (R9) applies at H1; the ruling here is just "yes, re-cut the apex."
4. **Adsum as tenant #2:** adopt it aboard (its repo stays canonical), on `adsum.worldconsole.eu` + `app.adsum.worldconsole.eu`. Caveats surfaced: the "adsum" brand clearance is half-done in its own records (EU/AT TMview unreachable from the dev box at the time), and the repo has **no git remote and lives in ~/Downloads** — H0 fixes both before anything deploys.
5. **Ingress ownership:** the hub rides World Console's existing Caddy (recommended: minimal disruption to live friends; extraction into its own compose project is a named trigger — third tenant, or box ops chafing) **vs** extracting a dedicated ingress project now.

When ruled, the adoption lands in `research/roadmap/01-decisions.md` as the next free R id (R34 as of 2026-08-18) — draft wording in [03-build-plan.md](03-build-plan.md) §H0.

## Standing law this touches (checked 2026-08-18, none silently deviated)

- **R17** (one domain, alone): intact under the recommended shape; the second-domain option is the one ⚠ deviation candidate, surfaced above.
- **R18** (the box, single-purpose rationale): the letter is untouched, the rationale widens; the R34 draft names it.
- **`vault.worldconsole.eu`:** reserved, "nothing else may ever share this origin" — the hub never touches it.
- **`play.`:** no directory of doors, everything unmatched 404s — the hub links `play.` only as the by-invitation card; friend doors are never listed.
- **R4:** `research/` and `aitester/` stay off every public surface — the hub page ships from `caddy/site/` like today's landing, nothing more.
- **Blueprint** (`deploy/guide/30`): its "rent a box per project" recipe gains a second lane in H3, via `/guide-sync` (R31), never silently.
