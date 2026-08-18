# The wiring workflow — how a project joins the hub

Designed 2026-08-18; becomes *procedure* (runbook §Tenants + template hub-mode) in phases H1–H3 ([03-build-plan.md](03-build-plan.md)). Until then this file is the contract's one home. The goal, from the maintainer's ask: **copy the Example template → build the project → join the hub with a short fixed checklist**, no re-derivation per project.

## A. The tenant contract — what an app repo must ship

A project is hub-ready when all of this is true (the template ships most of it already; hub-mode makes the rest a fill-in):

1. **Compose, hub mode:** the box brings no Caddy of its own — the compose keeps the template's `caddy` service *only* under the `local` profile (the dev rig stays fully self-contained); the app service joins the box's ingress network as an external network with a stable alias:
   ```yaml
   services:
     app:
       networks:
         ingress:
           aliases: [<app>-app]      # the name the hub Caddy dials
   networks:
     ingress:
       external: true
       name: world-console_ingress   # EDITME: the hub box's ingress network
   ```
2. **The hardened anchor, uncut:** `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs `/tmp`, explicit `mem_limit` / `cpus` / `pids_limit`. Loosening any of it is a written reason in the tenant's own records *and* a line in the hub onboarding (the box owner accepts it knowingly).
3. **One Caddy fragment, real hostnames:** `deploy/host/caddy/box-site.caddy` holding the project's complete site blocks (`<app>.worldconsole.eu` landing with the hardening header block; `app.<app>.…` doors), proxying to `<app>-app:<port>`. This file is the fragment's **owning home**; the box carries a derived copy (§B step 4). No global options block in a fragment (the ingress Caddyfile owns email/ACME).
4. **App constraints, template-standard:** unprivileged uid, `/healthz`, SIGTERM as a seam, relative URLs, one writable place (a named volume). Internal port free choice — aliases, not ports, are the shared namespace.
5. **No firewall unit.** The box's DOCKER-USER chain has one owner (the hub). The template's `firewall.sh` stays in the repo for *solo* deployments only.
6. **Backup lane pointed at its own repo:** `backup.sh`/`pull-backup.sh` EDITMEs filled with the shared Storage Box and an own path (`…/./borg/<app>`), own passphrase (password manager + off-box copy), timers staggered off other tenants' minutes (§B step 7), `<app>-alert@`/`<app>-heartbeat@` with an own ntfy topic.
7. **systemd units prefixed `<app>-`,** paths matching the box clone at `/home/deploy/<app>`.
8. **Legal links:** the landing links the apex Impressum (one operator, one page) and carries the app's own privacy words where it processes anything.
9. **A hub card block** ready to paste: name, one honest line, state tag, links (kept in the tenant README or offered at onboarding — the apex `index.html` is where it lands).

## B. Onboarding — wiring tenant `<app>` onto the box (runbook-§Tenants procedure, ~1 h)

0. **Fit check, out loud:** sum of the tenant's caps vs the box budget (WC's ~5-seat headroom has priority); the contract list above all green; consents/data posture named (a tenant with real personal-data processing does its own privacy homework first).
1. **DNS at INWX:** A + AAAA per new hostname → the box's addresses, plain and unproxied. (Maintainer's console; ~5 min; propagation usually minutes.)
2. **Clone and env:** `git clone <tenant remote> /home/deploy/<app>` as `deploy`; write `deploy/host/.env` from the tenant's `.env.example`, chmod 600.
3. **Build the image from committed state:** the tenant's `deploy/image/build.sh` on the box (whitelist archive — untracked files structurally can't enter).
4. **Land the fragment:** `cp /home/deploy/<app>/deploy/host/caddy/box-site.caddy /home/deploy/world-console/deploy/host/caddy/sites/<app>.caddy` — the derived copy, gitignored on the hub side (the `friends/` pattern one level up). Re-run this cp whenever the tenant's fragment changes (it rides the tenant's update recipe).
5. **Up and reload:** `docker compose up -d app` in the tenant dir (creates its containers on the external ingress network), then reload the hub Caddy (`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` in the world-console dir). TLS for the new names issues automatically on first hit.
6. **Prove the doors from outside** (dev machine, not the box): landing `curl -sI` → 200 + the four hardening headers; private door → 401 bare, 401 wrong pair, 200 with the pair; unmatched → the app's uniform 404. Nothing counts until this passes from outside.
7. **Backup lane live:** `borg init` the tenant repo on the Storage Box, run the tenant's `backup.sh` once by hand, **run the restore drill**, install its timer + pager units (`cp` + `daemon-reload`), pick a nightly minute that leaves the box's existing 04:11–05:14 ladder alone, run `pull-backup.sh` once from the dev machine.
8. **Records:** a row in the runbook's §Tenants table (app · hostnames · alias:port · clone path · borg path · pager topic · caps · date) + a dated state note; the card lands on the apex `index.html`; the tenant's own runbook notes its box residency and points here for the shared seams.
9. **Regression sweep:** the existing tenants still answer from outside (apex 200, `play.` by-invitation 404, one friend door 200, other tenants' landings 200).

## C. Offboarding (the reverse, dovetailing the exits research)

Pull the tenant's final backup + dev-machine mirror → remove its card + tenants-table row → delete `sites/<app>.caddy` + Caddy reload → `docker compose down` in the tenant dir (volumes only after the pull is verified) → disable its timers/units → DNS rows removed → its borg repo deleted from the Storage Box only after the mirror is confirmed. The box-wide wind-down order in `06-research-log.md` §2026-08-17 grows one sentence at H1: **every tenant's pulls come before any cancellation.**

## D. What the template must learn (hub mode — built in H3, in the template's own repo)

The template stays **solo-first** (its blueprint shape keeps working unchanged); hub mode is an explicitly chosen alternative at Phase 1/2 of its README:

- A "joining an existing box" fork in the phase list: skip renting (Phase 2 shrinks to "get a clone path + ingress network name from the box owner"), DNS rows point at the *existing* box, and the Caddy work becomes "fill `box-site.caddy`" instead of "own the front door."
- The compose gains the commented hub-mode stanza (§A.1) and the note that `caddy` is `local`-profile-only in hub mode.
- `box-site.caddy` joins the tree beside the solo `caddy/Caddyfile`, EDITME-marked, with the fragment rules (§A.3).
- "Making it yours" gains the tenant-contract checklist and the no-firewall-unit rule for hub mode.
- The mother-side blueprint (`deploy/guide/30`) gains the same fork as one short section pointing at the runbook §Tenants — via `/guide-sync`, since that is a `deploy/` teaching-layer change.

Adsum is deliberately wired **by hand along §B first** (H2) — the first live run of the contract grades it before the template canonizes it; H3 folds what H2 learned back into this file and the template.
