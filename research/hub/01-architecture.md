# The hub's architecture — decided shape

Decided 2026-08-18 by the session (design), pending the maintainer's H0 rulings (direction, domain, branding — [README.md](README.md)). Ground truth behind every claim: the 2026-08-18 sweeps in [04-research-log.md](04-research-log.md); live-ops facts stay owned by `deploy/README.md` and are only *pointed at* here.

## The shape in one breath

One box, one ingress Caddy, one origin per trust level: the **apex is the hub** (a static card per project plus the shared legal ground), **each project is a subdomain family** (`<app>.worldconsole.eu` public, deeper labels like `app.<app>.worldconsole.eu` for its private doors), every app container sits on a shared `ingress` docker network that only Caddy bridges, and everything else about a project — compose, image, volumes, backups, timers, pager — stays per-project exactly as the template ships it.

## Origins (who lives at which name)

| Name | Serves | Status |
|---|---|---|
| `worldconsole.eu` | the hub page + today's `impressum.html`/`datenschutz.html`, static from `caddy/site/` | re-cut in H1 |
| `play.worldconsole.eu` | World Console friends' doors | **unchanged** |
| `vault.worldconsole.eu` | reserved (R11 icebox) — "nothing else may ever share this origin" | **untouchable** |
| `adsum.worldconsole.eu` | Adsum's public landing (static) | new in H2 |
| `app.adsum.worldconsole.eu` | Adsum's host doors (`/p/<token>` + basic auth) and guest capability links (`/e/<token>`) | new in H2 |
| `<next>.worldconsole.eu` (+ deeper labels as needed) | the next tenant | per the wiring workflow |

Rules that make this safe and cheap:

- **One subdomain family per project; deeper labels belong to the project.** This preserves the template's own law ("one subdomain per trust level — the public landing and the private app never share an origin") without inventing sibling names like `adsum-app.`.
- **TLS is per-name Let's Encrypt exactly as today** — Caddy issues one certificate per hostname over HTTP-01 the moment DNS points at the box. Works at any label depth, needs zero new machinery. A wildcard (`*.worldconsole.eu`) was rejected: it requires a custom-built Caddy with the netcup DNS plugin, API credentials in the box env, and the plugin's documented ≥900 s propagation waits — machinery for a convenience the explicit-names list doesn't need at this scale. ⚠ Note the DNS is at INWX (not netcup) — a wildcard would use INWX's plugin, same verdict.
- **DNS per tenant is two rows at INWX** (A + AAAA per name, plain and unproxied per R17's standing posture). A tenant rename (e.g. if "adsum" fails its pending clearance) is a DNS row + Caddyfile edit — subdomains cost nothing to abandon, which is itself an argument for this shape over buying per-project domains while names are young.
- **HSTS stays per-origin** (the apex header deliberately lacks `includeSubDomains` — standing choice, now load-bearing: every tenant rules its own origin's headers).

## The ingress (one Caddy owns 80/443)

**Decided: World Console's existing Caddy is promoted to box ingress in place.** It already owns 80/443, terminates TLS, and imports box-local snippets (`friends/*.caddy`) — the hub generalizes that proven pattern one level up:

- The tracked Caddyfile gains `import sites/*.caddy` (top-level, whole site blocks) beside a tracked `caddy/sites/.keep.caddy` — same non-empty-glob trick as `friends/`.
- **A tenant's site block lives in the tenant's repo** (`deploy/host/caddy/box-site.caddy`, real hostnames) and is **copied box-locally** into `world-console/deploy/host/caddy/sites/<app>.caddy` at onboarding — the exact derived-copy relationship the minted friend doors already have. The copy step rides the tenant's update procedure; the box copies are gitignored here.
- **Tenant app containers join a shared docker network** and Caddy proxies to them by alias: the World Console compose declares an attachable `ingress` network (actual name `world-console_ingress`), Caddy joins it beside `web`/`wake`, and each tenant compose attaches its app with alias `<app>-app` (Adsum: `reverse_proxy adsum-app:8080`). **Tenants never join `web` or `wake`** — the gateway (org-key lane) and the socket-holding waker stay unreachable from tenant apps; networks are boundaries, as standing law says. No host ports are published by tenants, so port numbers can never collide (each container has its own address; three apps may all listen on 8080 internally).
- **Rejected: a per-project Caddy on the box** (the template's solo shape, verbatim) — two Caddies cannot both bind 80/443; this is the one seam where co-tenancy *must* differ from solo deployment, and the wiring workflow owns that difference. The template's `caddy-local` dev rig stays per-project and untouched — solo-mode local verification keeps working everywhere.
- **Named trigger for extraction:** when a third tenant lands, or World Console's compose lifecycle chafes as the box's front door (`docker compose down` in one project darkening every tenant), the ingress (Caddy + hub site + firewall unit) extracts into its own tiny compose project and the network drops its `world-console_` prefix. Not now: the friends are live, and the promotion-in-place is a two-line diff where the extraction is a cert-volume migration.

## The hub page

Static, hand-maintained, served exactly like today's landing (same hardening header block, same `caddy/site/` home):

- **One card per project:** name, one honest line, a state tag (`live` / `by invitation` / `coming`), and the links — the app itself, and where one exists, its own landing. World Console's card carries today's load-bearing sentences verbatim (the by-invitation line, the R13 disclosure, the AI-Act 50(1) sentence) so `localcheck.sh`'s words-probe keeps passing with at most a selector touch.
- **No build step, no generator, no manifest file.** The registry of tenants is the runbook's new §Tenants table (live-ops truth, where it belongs); the card is an HTML block cribbed from the wiring workflow. A generator is machinery without a demonstrated miss — revisit if the card count ever makes hand-editing silly.
- **No status/uptime machinery, no analytics, no cookies.** The page stays in the compliance one-liner's world: static files, strict CSP, nothing to consent to.
- **Branding** is the maintainer's H0 ruling: the Hausregel framing (R16) is recommended — a hub is the studio presenting its works, and the page going live would be the dated first public use R16 wants archived (§ 9 UWG / § 80 UrhG start free at first use). The card grid works either way.

## Legal ground (kept boring, kept true)

- **Impressum: one page, shared.** One operator runs every tenant, so today's apex `impressum.html` (R19's address via the box env, unchanged) serves them all; every tenant landing links to it. This closes Adsum's own known-open "Impressum absent" item for free.
- **Privacy: per-app words on the app's own origin.** World Console's `datenschutz.html` stays at the apex as-is (it is the WC privacy note, linked from the WC card); Adsum ships its own short privacy words on its landing (its repo owns them — it processes almost nothing by design: no cookies, no trackers, no accounts). A sectioned single privacy page is the named alternative if a third tenant makes per-app pages feel scattered; not now — one truth per app, one home per app.
- **Stage-1 commercial silence holds box-wide:** no public "buy" language anywhere on the hub or tenant landings (R21 — stage 1 stays legally nothing).

## Isolation, resources, governance

- **The hardened anchor is the tenant's entry ticket:** `read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs `/tmp`, explicit `mem_limit`/`cpus`/`pids_limit` — the template ships it as default; the wiring contract makes it binding for anything joining the box. Adsum arrives capped at 128 MB / 0.5 CPU / 64 pids.
- **Fit arithmetic lives in the onboarding checklist:** the 4 GB box budgets ~150–400 MB per live WC seat (~5 concurrent friends by the standing sizing) — a tenant's caps must fit *under* that budget, and **World Console has priority: it is the paying product; tenants are evictable guests.** Said here so nobody has to feel it out during an incident.
- **The firewall is a box singleton.** Standing `worldconsole-firewall.service` + `firewall.sh` own the DOCKER-USER chain; the template's per-project copy rebuilds that chain wholesale, so **two installed copies would fight** — tenants ship *no* firewall unit, and H1 verifies the one script covers the `ingress` network's subnet (the RFC-1918 egress block must bind tenants too).
- **Backups stay per-project, cross-provider, on the existing Storage Box:** each tenant gets its own borg repo path on BX11 (`…/./borg/<app>` beside `…/./borg/worldconsole` — u648152, port 23), its own passphrase, its own nightly timer at a staggered minute, its own `pull-backup.sh` mirror on the dev machine, and the restore drill before its first real user — the template's whole lane, only the repo URL differs. The Storage Box's snapshot layer stays OFF (standing design note; a snapshot would hold pruned archives past their deletion promise — now binding for every tenant's promises too).
- **Pager per project:** each tenant keeps its own `<app>-alert@`/`<app>-heartbeat@` pair and topic; "heartbeat on the night's last unit only" reads per-project. The box's shared residue stays what it is today: no off-box watcher (standing open edge, unchanged by the hub).
- **WC-only machinery stays WC-only:** reaper, store-sweep, reconcile, gateway, waker serve World Console's seats and lane — tenants neither see nor touch them.

## Cost

**€0/month additional.** The hub reuses the paid basket — box €7.92 (hourly; €5.96 on the 12-month term, the standing conversion question), Storage Box €3.84, domain €6/yr — where each solo project would have re-bought it at ~€11/month (the blueprint's own table). Per-tenant marginal cost: bytes on the Storage Box (BX11 is ~100× over need) and RAM under caps. The one optional spend is the H0 branding ruling's second domain (~€6–9/yr, only if chosen against the recommendation).

## Is this allowed?

**Yes.** netcup's AGB put no limit on the number of websites, domains, or applications on one VPS — the binding clauses are content/abuse-shaped (no bulk mail, no crypto-mining, no unlawful content) and a resource clause that explicitly exempts virtual servers; several small personal projects are squarely normal use ([04-research-log.md](04-research-log.md) carries the receipt). The domain side is ours by construction: subdomains of worldconsole.eu are free to create at INWX, any depth. The AVV already concluded covers the box regardless of what runs on it; ⚠ one honest note — R13-grade *research data* stays a World Console matter on Austrian soil; a tenant that ever starts processing serious personal data re-runs its own privacy homework (the template's shelf has the kit).

## Rejected (with reasons, for the record)

- **A second box per project** — the blueprint's current default. ~€11/month per project for isolation this scale doesn't need; the hub exists to retire exactly this.
- **A self-hosted PaaS layer (Coolify / Dokploy)** — the "hub in a box" products. Real overhead on a 4 GB box (Coolify ~0.75–1.2 GB idle, Dokploy ~350 MB), a Traefik they own replacing the Caddy the whole teaching layer is written around, and a dashboard whose job the runbook + guide already do. Wrong trade for one operator with a working hand-rolled lane. Revisit only if tenant count makes compose-by-hand a chore.
- **Path-based mounting (`worldconsole.eu/adsum/…`)** — one origin for everything: cookies, headers, HSTS and CSP stop being per-app; every app must be subpath-clean forever; one misrouted handler leaks between apps. Subdomains cost nothing and delete all of it. (Industry consensus agrees — see the log.)
- **Wildcard TLS** — custom Caddy build + DNS-API credentials + slow propagation, to avoid an explicit hostname list that is the *point* of the tenants table.
- **A hub generator / manifest build step** — machinery without a miss; the icebox's standing precedent applied at design time.
- **Tenants on the existing `web` network** — would put guest apps one hop from the gateway and the seats; the dedicated `ingress` network costs three lines.
