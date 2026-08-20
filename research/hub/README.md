# The hub — one box, many doors

Designed 2026-08-18 on the maintainer's instruction ("a website which is a hub for all my projects"). Status: **adopted — the five H0 rulings taken 2026-08-18 (R34), nothing implemented yet**; the build runs as its own fresh sessions starting at H1 ([03-build-plan.md](03-build-plan.md)). *(2026-08-19, R35/R36 — the split and the names recut: the hub is its own project, named **World Console**, home `~/Desktop/CurrPC/Programming/WorldConsole`; the game becomes **GameMaster Bernd**. §M0 in [03-build-plan.md](03-build-plan.md) runs first; this folder migrates there. H0's rulings stand except the ingress promotion-in-place (R35: extraction at the split) and the Hausregel page branding (R36: the page brands World Console).)* This folder owns the hub's *design*; the moment a phase lands, live-ops truth is `deploy/README.md` (the runbook wins, as everywhere), and this folder stays behind as the design record and receipts.

## What this is

The box (netcup Vienna, R18) and the domain (worldconsole.eu, R17) currently serve one project. The hub turns the **same box, same domain, same Caddy** into the shared home of several small projects: the apex becomes a landing hub with one card per project, each project lives on its own subdomain behind the one ingress Caddy, and a new project copied from the Example template joins with a short fixed procedure instead of renting its own ~€11/month box (which is what `deploy/guide/30-next-project-blueprint.md` assumes today).

Tenant #1 is World Console — unchanged in play, `play.` and `vault.` untouched. Tenant #2 is **Adsum**, the private-event invite service at `~/Desktop/CurrPC/Programming/adsum` (moved out of ~/Downloads and remoted 2026-08-18): functionally complete, locally verified, never deployed — its own cost plan budgeted a second box; the hub absorbs it for €0 additional.

## The map

| File | Owns |
|---|---|
| [01-architecture.md](01-architecture.md) | the decided shape — origins, ingress, networks, isolation, legal pages, cost — and what was rejected, with reasons |
| [02-wiring-workflow.md](02-wiring-workflow.md) | the tenant contract (what an app repo must ship), the onboarding/offboarding procedures, and the template's hub-mode changes |
| [03-build-plan.md](03-build-plan.md) | the phased implementation plan for fresh sessions (H0–H3): gates, verification recipes, commit boundaries |
| [04-research-log.md](04-research-log.md) | dated receipts — online best practices, the "is this allowed" answer, alternatives priced, ground-truth sweep results |

## The H0 rulings (taken 2026-08-18 — the gate is open; the registry entry is R34)

1. **The direction: adopted.** The box becomes the shared home of several projects. The exits picture amends accordingly (06 §2026-08-17's dated note lands at H1, per the plan), and the case for the standing hourly→12-month conversion (€7.92 → €5.96/mo, at the price of exit-any-hour) strengthens — that conversion call itself stays open with the maintainer. *(Ruled 2026-08-20: stays hourly until the box size settles — upgrade headroom; R18.)*
2. **Domain and branding: the worldconsole.eu apex, branded Hausregel.** No second domain — R17 ("one domain, alone") stands untouched. The hub page carries the **Hausregel** brand (R16 — the studio presenting its works); going live at H1 is the dated first public use whose evidence R16's €0 step archives. *(2026-08-19: recut by R36 — the page brands **World Console**; Hausregel iced, clearance kept; the first-use archive re-cuts to the new names.)*
3. **The apex re-cut: yes.** Today's by-invitation World Console landing becomes the hub page at H1, disclosure sentences preserved verbatim; the seen-gate (R9) applies there.
4. **Adsum is tenant #2**, on `adsum.worldconsole.eu` + `app.adsum.worldconsole.eu`, its repo canonical. Both surfaced caveats were resolved maintainer-side before the sitting: the repo lives at `~/Desktop/CurrPC/Programming/adsum` with remote `git@github.com:SaibotiX/adsum.git` (refs verified 2026-08-18; anonymous GitHub probe 404s — private, as the plan asked), and the "adsum" clearance is **complete at register-index level** in its own records (TMview EU/AT clean in classes 9/42; its R3: the name stands for the friends circle; the professional search stays a filing-time step there). The H2 name-gate is answered.
5. **Ingress ownership: the recommendation.** The hub rides World Console's existing Caddy, promoted in place — minimal disruption to the live friends; extraction into its own compose project keeps its named trigger (third tenant, or box ops chafing). *(2026-08-19: overtaken by R35 — the extraction happens at the split, by direction.)*

**Ruled the same sitting, additional:** every tenant origin declares itself **public or private, and the flip stays cheap** — the shape lives in [01-architecture.md](01-architecture.md) §Public and private tenants; the binding contract line is [02-wiring-workflow.md](02-wiring-workflow.md) §A.10.

The adoption landed as **R34** in `research/roadmap/01-decisions.md` (2026-08-18); the coverage row is ●.

## Standing law this touches (checked 2026-08-18, none silently deviated)

- **R17** (one domain, alone): intact — the second-domain option was declined at H0 (2026-08-18); no deviation.
- **R18** (the box, single-purpose rationale): the letter is untouched, the rationale widens; R34 names it.
- **`vault.worldconsole.eu`:** reserved, "nothing else may ever share this origin" — the hub never touches it.
- **`play.`:** no directory of doors, everything unmatched 404s — the hub links `play.` only as the by-invitation card; friend doors are never listed.
- **R4:** `research/` and `aitester/` stay off every public surface — the hub page ships from `caddy/site/` like today's landing, nothing more.
- **Blueprint** (`deploy/guide/30`): its "rent a box per project" recipe gains a second lane in H3, via `/guide-sync` (R31), never silently.
