# 01 — Web fundamentals: the vocabulary under everything

*Teaching layer — live ops truth: [`deploy/README.md`](../README.md). Synced: `276ff32` (2026-08-20).*

Everything the web does reduces to a handful of ideas. This page explains each from zero and immediately shows where World Console uses it — that pairing is the whole method of this guide.

## Clients and servers

A **server** is not a special kind of computer; it is an ordinary computer that *stays on and listens*. A **client** (a browser, `curl`, pi calling an API) *initiates*: it connects, asks, gets an answer. One machine can be both — the box is a server to friends' browsers and a client to Anthropic's API.

What makes the box a "server" in practice is only: it has a **public IP address**, it runs programs that **listen on ports**, and it is expected to be up when nobody is watching. That last part is why so much of `deploy/host/` is automation — a server you must babysit is a hobby, not a service.

## IP addresses

Every machine on a network has an **IP address** — the number packets are actually delivered to. Two generations coexist:

- **IPv4**: four bytes, written `152.53.51.13` (the box). Scarce, still dominant.
- **IPv6**: sixteen bytes, written like `2a03:...`. Plentiful; every modern host gets both (the box has an AAAA record too). Browsers try v6 and fall back to v4 automatically ("happy eyeballs") — which is why the box's v6 reachability check could be parked (runbook, first-deploy note) without stranding anyone.

**Private ranges** are the special addresses that never route on the public internet — `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918), plus link-local `169.254.0.0/16` and carrier-grade NAT `100.64.0.0/10`. Your home network is one of these; so is Docker's internal network (`172.16.0.0/12` pool). The `/12` suffix is **CIDR notation**: "the first 12 bits are fixed, the rest vary" — a compact way to name a whole block.

*Here:* the containers must reach the open internet (model APIs, Wikimedia) but must **not** reach the box's private neighborhood — cloud metadata services and neighboring machines live on those ranges. `deploy/host/firewall.sh` drops exactly those five blocks for container-originated traffic. That is defense against a hostile or confused process inside a container, including the AI itself.

## DNS — names to addresses

Nobody types IPs. **DNS** is the distributed phone book that resolves `play.worldconsole.eu` → `152.53.51.13`. What you manage:

- A **domain** (`worldconsole.eu`) is rented yearly from a **registrar** (here INWX — decision R17). The registrar records who owns the name and which **nameservers** answer for it (INWX's own, here).
- **Records** are the entries on those nameservers. The kinds you'll actually touch:

| Record | Maps | Here |
|---|---|---|
| `A` | name → IPv4 | `worldconsole.eu`, `play.`, `vault.` → `152.53.51.13` |
| `AAAA` | name → IPv6 | same three names → the box's v6 address |
| `CNAME` | name → another name | not used here |
| `MX` | name → mail server | none yet (mail-on-domain is a stage-2 shape) |
| `TXT` | name → arbitrary text (proofs, policies) | none yet |

- **Subdomains** (`play.`, `vault.`) are free — just more records under the domain you already own. Separating them is an *origin* decision (see §browser security): `vault.worldconsole.eu` is reserved so that credential UI, if it ever ships, lives on an origin nothing else can touch (R11).
- **Propagation:** records carry a TTL (time-to-live); changes take minutes to hours to be seen everywhere. This matters exactly twice: first setup, and any future move of the box.
- "**DNS plain and unproxied**" (R17) means: the records point straight at the box, no CDN (Cloudflare-style) in between. At this scale a CDN adds a party and hides your own logs for no gain.

**Debugging DNS:**

```bash
# on: dev machine (or box) — ask directly
dig +short play.worldconsole.eu A
dig +short play.worldconsole.eu AAAA
```

⚠ Your dev machine has a known quirk: external DNS lookups are refused and IPv6 egress is broken — network truths should be verified **from the box**, and the backup pull tunnels through the box for exactly this reason ([10](10-operate-the-box.md) §troubleshooting).

## Ports

An IP reaches a machine; a **port** (a number, 1–65535) reaches a *program* on it. A program **listens** on a port; clients connect to it. Conventions everyone relies on:

| Port | Convention | On the box |
|---|---|---|
| 22 | SSH | sshd, keys-only — your admin door |
| 80 | HTTP | Caddy (redirects to HTTPS; also serves ACME renewals) |
| 443 | HTTPS (TCP + UDP for HTTP/3) | Caddy — **the only public web door** |
| 7681 | (arbitrary) | each seat's app server — *inside* Docker only, never published |
| 4100 | (arbitrary) | the gateway — inside Docker only |
| 23 | (Hetzner's choice) | the Storage Box's SSH door for borg |

The distinction that keeps the box tight: Docker can **publish** a container port onto the box's public IP (compose `ports:`) or merely **expose** it to other containers (compose `expose:`). Only Caddy publishes. Everything else is reachable solely through it — one door to defend.

## HTTP — the request/response language

Every web exchange is a **request** (method + path + headers + optional body) answered by a **response** (status code + headers + body). It is all readable text at heart:

```
GET /f/<token>/healthz HTTP/1.1          ← method, path, protocol
Host: play.worldconsole.eu               ← which site (one IP, many names!)
Authorization: Basic <base64 user:pass>  ← the door's pair

HTTP/1.1 200 OK                          ← status
content-type: application/json           ← what the body is
{"ok":true,"pi":true,...}                ← body
```

- **Methods:** `GET` (read), `HEAD` (read headers only), `POST` (send data) are the ones used here — the app server explicitly answers `405 Method Not Allowed` to everything else, a small example of *default-deny*.
- **The `Host` header** is how one IP serves many sites: Caddy reads it and picks the matching site block (`worldconsole.eu` vs `play.` vs `vault.`). This is called **virtual hosting**.
- **Status codes** you will actually meet in this project, worth recognizing on sight:

| Code | Meaning | Where you'll see it here |
|---|---|---|
| 200 | OK | a healthy page/API answer |
| 206 | partial content | `<video>` seeking in the viewer (Range requests) |
| 304 | not modified | the browser's cache re-validated via ETag |
| 308 | permanent redirect | `/f/<token>` → `/f/<token>/` (the trailing slash matters for relative URLs) |
| 401 | authentication required | the door without (or with a wrong) pair |
| 404 | not found | wrong path — and deliberately the *only* answer strangers get |
| 405 | method not allowed | non-GET/HEAD at the app server |
| 416 | bad range | malformed video seek |
| 429 | too many requests | a friend's key over its per-minute rate ceiling |
| 500 | server error | an app-server bug — check its logs |
| 502 | bad gateway | the gateway couldn't reach Anthropic |

- **Caching:** the app server sends an `ETag` (a fingerprint of the file version) with `cache-control: no-cache` — meaning "you may store it, but re-ask with `If-None-Match` every time"; unchanged files answer 304 with no body. Cheap freshness, correct for hot-reloading game files.
- **Content types:** the `content-type` header tells the browser what it received (`text/html`, `text/markdown`, `image/jpeg`…). The app server keeps an explicit extension→type map and sends `x-content-type-options: nosniff` so browsers never *guess* — guessing is a classic attack path (a "text file" that sniffs as HTML executes).

## HTTPS / TLS — the encryption layer

**TLS** wraps the whole HTTP conversation in encryption and — equally important — **authenticates the server**: the browser knows it reached the real `play.worldconsole.eu`, not an impostor at a coffee-shop router.

The machinery: the server holds a **certificate** — a signed statement "this key speaks for this hostname" — issued by a **certificate authority (CA)** browsers already trust. **Let's Encrypt** is the free, automated CA that made this a non-event: software on your server proves it controls the name (the **ACME** protocol — Let's Encrypt says "put this token at this URL / answer this TLS challenge", your server does, certificate issued), then renews every ~60 days forever.

*Here:* Caddy does ACME **built-in, by default** — the reason Caddy over nginx for solo ops. The whole TLS configuration in `deploy/host/caddy/Caddyfile` is one line: the ACME account email (`email {$ACME_EMAIL}`, from the box's `.env`). Certificates and the ACME account live in the `caddy-data` volume — that is why that volume is backed up and why recreating the caddy container never re-issues certificates. Renewal is automatic; the standing check is just "expiry comfortably in the future" ([10](10-operate-the-box.md) §certs).

Two supporting ideas you'll meet:

- **HSTS** (`Strict-Transport-Security` header): tells browsers "only ever speak HTTPS to this host" — sent by the landing site, deliberately *without* `includeSubDomains` so `play.` and `vault.` rule themselves.
- **Self-signed certificates**: anyone can make a certificate for testing; browsers won't trust it, but tools can be told to. `localcheck.sh` runs the full production door locally on self-signed certs (`local_certs` in `Caddyfile.local`) — proving the shape without owning a name.

## WebSockets — when request/response isn't enough

HTTP is turn-based: ask, answer, done. A live terminal needs a **continuous two-way byte pipe**. A **WebSocket** starts life as a normal HTTP request with an `Upgrade: websocket` header; server and client then switch the connection into a persistent framed pipe. Frames are either **binary** (raw bytes) or **text** (here: small JSON control messages).

*Here, the protocol in one breath* (`deploy/image/appserver/server.js` header comment is the authority): binary frames carry the terminal byte stream both ways; text frames carry `{t:'resize',cols,rows}` (the first one attaches — spawning pi if none runs), `{t:'respawn'}`, and server-side `{t:'spawned'}` / `{t:'exit',code}`. A second tab **takes over** the seat (the old socket is closed with code 4001) rather than being refused — a half-dead phone connection must never lock a door. A second, separate WebSocket (`/ws/events`) streams file-change events so pane traffic never contends with keystrokes.

Two practical facts: proxies must pass the Upgrade through (Caddy's `reverse_proxy` does, unconfigured), and idle pipes die quietly at intermediaries — hence the app server's 30-second ping/pong heartbeat that also frees the seat when a client vanishes.

## Reverse proxies — the front door pattern

A **reverse proxy** is a server that accepts all public traffic and forwards each request to the right internal program. It exists because you want exactly one process doing TLS, one holding ports 80/443, one place for auth and headers — while any number of apps live privately behind it.

*Here it is Caddy*, and its whole job is the routing table in [00](00-big-picture.md) §step 3. The per-friend snippet shows almost every proxy idea at once (`deploy/host/caddy/friends/<name>.caddy`, minted by `new-friend.sh`):

```caddyfile
redir /f/<token> /f/<token>/ 308
handle_path /f/<token>/* {        # match + STRIP the prefix — the app sees clean paths
    basic_auth { <name> <bcrypt-hash> }
    reverse_proxy wc-<name>:7681 waker:9000 {
        lb_policy first           # try the seat; only if it fails, the waker
        lb_try_duration 4s
        header_up X-Friend <name> # tell the waker WHO to wake
        transport http { dial_timeout 1500ms }  # a stopped container's DNS can HANG, not fail
    }
}
```

Read that as a sentence: *redirect to the canonical slash-form; behind this secret path, demand this pair; then try the friend's container, and if it won't answer quickly, hand the request to the waker.* The `dial_timeout` line is a scar from a real incident — bound your dials, because name resolution can hang instead of failing.

The counterpart constraint: because the page lives behind a stripped prefix, **every URL in the client is relative** (`./assets/…`, `./ws/term`). Absolute paths would escape the door. This is a pattern to reuse: apps behind proxies should be path-relative unless they have a reason not to be.

## The auth model here: capability URLs + basic auth

There are no accounts and no login database in stage 1 (R11's doors are iced). Instead, two independent factors:

1. **A secret path** (`/f/<30-random-chars>/`) — a *capability URL*: knowing it is being invited. Unguessable (30 chars of a-z0-9 ≈ 155 bits), never linked anywhere public, and the page sends `Referrer-Policy: no-referrer` so browsers don't leak it in outbound clicks.
2. **HTTP basic auth** — the browser's built-in username/password prompt. The password is never stored server-side; Caddy holds only a **bcrypt hash** (a one-way fingerprint; `caddy hash-password` computes it at mint time). Over TLS, basic auth is fine; without TLS it would be plaintext — TLS first, always.

Losing one secret alone is survivable; the pair travels once, out of band. A stranger probing any path gets an undifferentiated 404 — the site never reveals which doors exist.

## Browser security headers — the page defends itself

Served pages carry headers that instruct the browser to *refuse* whole attack classes. The ones used here, each one sentence:

- **`Content-Security-Policy`** (CSP): whitelist of what the page may load/do. The play page allows only same-origin scripts/styles/connections (`default-src 'self'`, no inline scripts); served *game files* get `CSP: sandbox` — rendered inert, so a markdown or SVG file can never act as a page.
- **`X-Frame-Options: DENY`** / `frame-ancestors 'none'`: nobody can embed the site in an iframe (defeats clickjacking).
- **`X-Content-Type-Options: nosniff`**: no content-type guessing (see §HTTP).
- **`Referrer-Policy: no-referrer`**: outbound clicks don't reveal the secret URL.
- **Origin check on WebSockets** (in the app server, not a header): a cross-site page trying to ride the browser's cached credentials sends its own `Origin` and is refused with 403 — that is CSWSH (cross-site WebSocket hijacking), closed in five lines.

The transferable habit: static sites get the strict header block (`Caddyfile`'s landing site is a copy-paste template); apps get a CSP as tight as their real needs; anything user-influenced is served sandboxed.

---

**Where each idea lives in the repo:** DNS/domain rulings → R17 · TLS/site blocks → `deploy/host/caddy/Caddyfile` · WebSocket protocol → `deploy/image/appserver/server.js` · door snippet shape → `deploy/host/new-friend.sh` · firewall ranges → `deploy/host/firewall.sh` · headers → the Caddyfile + `server.js` (`PAGE_CSP`).
