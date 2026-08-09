// deploy/image/appserver/server.js — the per-friend app server (02 item 5, R14).
//
// One small server inside each friend's container, replacing bare ttyd's
// stock page (ttyd itself stays in the image as the day-one fallback
// bridge): it spawns pi in a PTY and streams the real TUI over /ws/term,
// serves the one-page client and its pinned vendor assets, and answers
// /healthz with the idle state the reaper (02 item 12) will read. The
// Caddy door owns TLS, the secret path and basic auth; everything here
// lives INSIDE the security boundary — the container — which is why the
// file surfaces can never cross it (08 §implementation).
//
// /ws/term protocol: binary frames are the byte stream (server→client PTY
// output, client→server keystrokes); text frames are small JSON controls —
// client sends {t:'resize',cols,rows} (the first one attaches, spawning pi
// if none runs) and {t:'respawn'}; server sends {t:'spawned'} and
// {t:'exit',code}. One friend, one container, ONE client: a second tab
// would fight the first over the PTY size, so the newest connection takes
// over and the old one is closed — takeover, not refusal, because a
// half-dead phone connection must never lock the door shut.

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import pty from "node-pty";
import { WebSocketServer } from "ws";
import { createShipper } from "./shipper.js";

const PORT = 7681;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = process.env.GAME_DIR ?? "/home/player/game";
const CLIENT = path.join(HERE, "client");
const NM = path.join(HERE, "node_modules");

const log = (ev, extra = {}) =>
	console.log(JSON.stringify({ ts: new Date().toISOString(), ev, ...extra }));

// ---------------------------------------------------------------------------
// The PTY: pi, spawned on the first attach, surviving client comings and
// goings. encoding:null keeps the stream bytes-for-bytes (a UTF-8 sequence
// split across chunks must not be decoded mid-flight); xterm.js decodes
// incrementally on its side. Input frames are whole client messages, so
// per-frame UTF-8 decoding is safe for pty.write.
// ---------------------------------------------------------------------------

let term = null; // { pty, cols, rows }
let client = null; // the one active /ws/term socket
let lastDetachAt = Date.now(); // the reaper's idle mark (02 item 12 seam)

// R13's shipper rides the server's seams: sweep at boot, checkpoint every
// ten minutes, seal at pi's exit and at the stop signal. The newest session
// is live while pi runs; everything else seals as it goes.
const shipper = createShipper({ log, piRunning: () => !!term });

function spawnPi(cols, rows) {
	const p = pty.spawn("pi", [], {
		name: "xterm-256color",
		cwd: GAME_DIR,
		env: process.env,
		encoding: null,
		cols,
		rows,
	});
	term = { pty: p, cols, rows };
	log("pi-spawn", { pid: p.pid, cols, rows });
	p.onData((chunk) => {
		if (client?.readyState === 1) client.send(chunk, { binary: true });
	});
	p.onExit(({ exitCode }) => {
		log("pi-exit", { code: exitCode });
		term = null;
		if (client?.readyState === 1)
			client.send(JSON.stringify({ t: "exit", code: exitCode }));
		shipper.tick("pi-exit"); // the session just ended — seal it now
	});
}

// Attach a client-sized view: fresh pi if none runs; otherwise resize —
// and when the size didn't change, jiggle one row so the TUI still gets
// its SIGWINCH and repaints the whole screen for the newcomer.
function attach(cols, rows) {
	if (!term) {
		spawnPi(cols, rows);
		return;
	}
	const same = term.cols === cols && term.rows === rows;
	if (same) {
		term.pty.resize(cols, Math.max(2, rows - 1));
		setTimeout(() => term?.pty.resize(cols, rows), 80);
	} else {
		term.pty.resize(cols, rows);
	}
	term.cols = cols;
	term.rows = rows;
}

const sane = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

const wssTerm = new WebSocketServer({ noServer: true });
wssTerm.on("connection", (ws) => {
	if (client && client.readyState === 1) {
		log("takeover");
		client.close(4001, "takeover");
	}
	client = ws;
	ws.isAlive = true;
	ws.on("pong", () => (ws.isAlive = true));
	log("client-connect");
	if (term) ws.send(JSON.stringify({ t: "spawned" }));

	ws.on("message", (data, isBinary) => {
		if (ws !== client) return; // a taken-over socket has no say
		if (isBinary) {
			term?.pty.write(data.toString("utf8"));
			return;
		}
		let m;
		try {
			m = JSON.parse(data);
		} catch {
			return;
		}
		if (m.t === "resize" && sane(m.cols, 20, 500) && sane(m.rows, 5, 200)) {
			const hadTerm = !!term;
			if (m.attach || !hadTerm) attach(m.cols, m.rows);
			else {
				term.pty.resize(m.cols, m.rows);
				term.cols = m.cols;
				term.rows = m.rows;
			}
			if (!hadTerm) ws.send(JSON.stringify({ t: "spawned" }));
		} else if (m.t === "respawn" && !term) {
			if (sane(m.cols, 20, 500) && sane(m.rows, 5, 200)) {
				spawnPi(m.cols, m.rows);
				ws.send(JSON.stringify({ t: "spawned" }));
			}
		}
	});
	ws.on("close", () => {
		if (client === ws) {
			client = null;
			lastDetachAt = Date.now();
			log("client-close");
		}
	});
});

// ---------------------------------------------------------------------------
// The pane roots (08 §what the panes serve): config/ + data/, read-only,
// and NOTHING else — ~/.pi/agent (sessions, auth.json) is simply never a
// root here, so the secrecy boundary is scope, not filtering.
// ---------------------------------------------------------------------------

const ROOTS = {
	config: path.join(GAME_DIR, "config"),
	data: path.join(GAME_DIR, "data"),
};

const MAX_TREE_ENTRIES = 4000;

async function buildTree() {
	let count = 0;
	let truncated = false;
	async function walk(dir, depth) {
		if (depth > 10) return [];
		let entries;
		try {
			entries = await fsp.readdir(dir, { withFileTypes: true });
		} catch {
			return [];
		}
		entries = entries.filter((e) => !e.name.startsWith("."));
		entries.sort(
			(a, b) =>
				Number(b.isDirectory()) - Number(a.isDirectory()) ||
				a.name.localeCompare(b.name),
		);
		const out = [];
		for (const e of entries) {
			if (count >= MAX_TREE_ENTRIES) {
				truncated = true;
				break;
			}
			count++;
			// symlinks are neither: skipped, so the tree cannot point outside
			if (e.isDirectory())
				out.push({
					name: e.name,
					dir: true,
					children: await walk(path.join(dir, e.name), depth + 1),
				});
			else if (e.isFile()) out.push({ name: e.name });
		}
		return out;
	}
	const roots = [];
	for (const [name, dir] of Object.entries(ROOTS))
		roots.push({ name, dir: true, children: await walk(dir, 0) });
	return { roots, truncated };
}

// The status strip's world title: the world whose chronicle moved last,
// prettied by its config page's heading when one exists.
async function worldTitle() {
	try {
		const worldsDir = path.join(ROOTS.data, "world");
		let best = null;
		for (const w of await fsp.readdir(worldsDir, { withFileTypes: true })) {
			if (!w.isDirectory()) continue;
			const wDir = path.join(worldsDir, w.name);
			for (const c of await fsp.readdir(wDir, { withFileTypes: true })) {
				if (!c.isDirectory()) continue;
				const st = await fsp.stat(path.join(wDir, c.name));
				if (!best || st.mtimeMs > best.mtimeMs)
					best = { slug: w.name, mtimeMs: st.mtimeMs };
			}
		}
		if (!best) return null;
		try {
			const md = await fsp.readFile(
				path.join(ROOTS.config, "worlds", `${best.slug}.md`),
				"utf8",
			);
			const h = md.match(/^#\s+(.+)$/m);
			if (h) return h[1].trim();
		} catch {}
		return best.slug;
	} catch {
		return null;
	}
}

// Resolve a request path STRICTLY under its root: decode once, normalize,
// then realpath — a symlink pointing out, a dot-dot in any encoding, or a
// missing file all come back null and answer 404.
async function resolveUnder(rootKey, relRaw) {
	const root = ROOTS[rootKey];
	if (!root) return null;
	let rel;
	try {
		rel = decodeURIComponent(relRaw);
	} catch {
		return null;
	}
	if (rel.includes("\0")) return null;
	const abs = path.resolve(root, rel);
	if (abs !== root && !abs.startsWith(root + path.sep)) return null;
	let real;
	let realRoot;
	try {
		real = await fsp.realpath(abs);
		realRoot = await fsp.realpath(root);
	} catch {
		return null;
	}
	if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
	return real;
}

const FILE_TYPES = {
	".md": "text/markdown; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".webm": "video/webm",
	".ogv": "video/ogg",
	".ogg": "video/ogg",
	".mp4": "video/mp4",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
};

// Range support because <video> seeks; CSP sandbox + nosniff because a
// served file must stay a document, never become a running page.
async function serveFile(req, res, rootKey, relRaw) {
	const file = await resolveUnder(rootKey, relRaw);
	const st = file ? await fsp.stat(file) : null;
	if (!st?.isFile()) {
		res.writeHead(404, { "content-type": "text/plain" });
		res.end("not found");
		return;
	}
	const type =
		FILE_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
	const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
	const headers = {
		"content-type": type,
		etag,
		"cache-control": "no-cache",
		"accept-ranges": "bytes",
		"content-disposition": "inline",
		"x-content-type-options": "nosniff",
		"content-security-policy": "sandbox",
	};
	if (req.headers["if-none-match"] === etag) {
		res.writeHead(304, headers);
		res.end();
		return;
	}
	const range = req.headers.range
		? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
		: null;
	if (range && (range[1] !== "" || range[2] !== "")) {
		let start = range[1] === "" ? st.size - Number(range[2]) : Number(range[1]);
		let end =
			range[1] !== "" && range[2] !== ""
				? Math.min(Number(range[2]), st.size - 1)
				: st.size - 1;
		if (range[1] === "") start = Math.max(0, start);
		if (start >= st.size || start > end) {
			res.writeHead(416, { "content-range": `bytes */${st.size}` });
			res.end();
			return;
		}
		headers["content-range"] = `bytes ${start}-${end}/${st.size}`;
		headers["content-length"] = end - start + 1;
		res.writeHead(206, headers);
		if (req.method === "HEAD") res.end();
		else fs.createReadStream(file, { start, end }).pipe(res);
		return;
	}
	headers["content-length"] = st.size;
	res.writeHead(200, headers);
	if (req.method === "HEAD") res.end();
	else fs.createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------------------
// The watcher channel (08 law 3: everything hot-reloads): chokidar over the
// two roots, every event pushed to /ws/events — its own socket, so pane
// traffic never contends with the PTY stream (08's acceptance note).
// ---------------------------------------------------------------------------

const wssEvents = new WebSocketServer({ noServer: true });

const watcher = chokidar.watch(Object.values(ROOTS), {
	ignoreInitial: true,
	ignored: (p) => path.basename(p).startsWith("."),
	depth: 12,
});
const relOf = (abs) => {
	for (const [root, dir] of Object.entries(ROOTS))
		if (abs === dir || abs.startsWith(dir + path.sep))
			return { root, rel: path.relative(dir, abs).split(path.sep).join("/") };
	return null;
};
watcher.on("all", (kind, abs) => {
	const loc = relOf(abs);
	if (!loc || path.basename(abs).startsWith(".")) return;
	const msg = JSON.stringify({ t: "fs", kind, ...loc });
	for (const ws of wssEvents.clients) if (ws.readyState === 1) ws.send(msg);
});
watcher.on("error", (err) => log("watcher-error", { err: String(err) }));

wssEvents.on("connection", async (ws) => {
	ws.isAlive = true;
	ws.on("pong", () => (ws.isAlive = true));
	ws.send(
		JSON.stringify({ t: "hello", title: await worldTitle(), ...(await buildTree()) }),
	);
});

// ---------------------------------------------------------------------------
// Static: the one page and its pinned vendor files — an explicit map, never
// a directory walk over node_modules.
// ---------------------------------------------------------------------------

const ASSETS = {
	"/": ["text/html; charset=utf-8", path.join(CLIENT, "index.html")],
	"/assets/app.js": ["text/javascript; charset=utf-8", path.join(CLIENT, "app.js")],
	"/assets/style.css": ["text/css; charset=utf-8", path.join(CLIENT, "style.css")],
	"/assets/vendor/xterm.js": ["text/javascript", path.join(NM, "@xterm/xterm/lib/xterm.js")],
	"/assets/vendor/xterm.css": ["text/css", path.join(NM, "@xterm/xterm/css/xterm.css")],
	"/assets/vendor/addon-fit.js": ["text/javascript", path.join(NM, "@xterm/addon-fit/lib/addon-fit.js")],
	"/assets/vendor/addon-webgl.js": ["text/javascript", path.join(NM, "@xterm/addon-webgl/lib/addon-webgl.js")],
	"/assets/vendor/marked.js": ["text/javascript", path.join(NM, "marked/lib/marked.umd.js")],
	"/assets/vendor/purify.js": ["text/javascript", path.join(NM, "dompurify/dist/purify.min.js")],
};

// The page may talk only to its own origin; scripts only from files we
// serve. 'unsafe-inline' styles because xterm.js manages element styles
// dynamically; scripts stay locked.
const PAGE_CSP =
	"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; media-src 'self'; connect-src 'self'; " +
	"base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

async function serveAsset(req, res, pathname) {
	const hit = ASSETS[pathname];
	if (!hit) return false;
	const [type, file] = hit;
	const st = await fsp.stat(file);
	const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
	const headers = {
		"content-type": type,
		etag,
		"cache-control": "no-cache",
		"x-content-type-options": "nosniff",
	};
	if (pathname === "/") headers["content-security-policy"] = PAGE_CSP;
	if (req.headers["if-none-match"] === etag) {
		res.writeHead(304, headers);
		res.end();
		return true;
	}
	headers["content-length"] = st.size;
	res.writeHead(200, headers);
	if (req.method === "HEAD") res.end();
	else fs.createReadStream(file).pipe(res);
	return true;
}

// ---------------------------------------------------------------------------
// HTTP + upgrade routing
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
	try {
		const { pathname } = new URL(req.url, "http://container");
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405).end();
			return;
		}
		if (pathname === "/healthz") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					ok: true,
					pi: !!term,
					client: !!client,
					idleSeconds: client
						? 0
						: Math.round((Date.now() - lastDetachAt) / 1000),
					shipper: shipper.status(),
				}),
			);
			return;
		}
		if (pathname === "/api/tree") {
			const body = JSON.stringify({
				title: await worldTitle(),
				...(await buildTree()),
			});
			res.writeHead(200, {
				"content-type": "application/json",
				"cache-control": "no-cache",
			});
			res.end(body);
			return;
		}
		if (pathname.startsWith("/files/")) {
			const rest = pathname.slice("/files/".length);
			const slash = rest.indexOf("/");
			if (slash > 0) {
				await serveFile(req, res, rest.slice(0, slash), rest.slice(slash + 1));
				return;
			}
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("not found");
			return;
		}
		if (await serveAsset(req, res, pathname)) return;
		res.writeHead(404, { "content-type": "text/plain" });
		res.end("not found");
	} catch (err) {
		log("http-error", { err: String(err) });
		if (!res.headersSent) res.writeHead(500);
		res.end();
	}
});

// Behind the door both values are ours; a cross-site page trying to ride a
// browser's cached credentials shows its own origin and is refused. Absent
// Origin (curl, probes, same-origin fetches in some browsers) passes.
function originAllowed(req) {
	const origin = req.headers.origin;
	if (!origin) return true;
	try {
		return new URL(origin).host.toLowerCase() === (req.headers.host ?? "").toLowerCase();
	} catch {
		return false;
	}
}

server.on("upgrade", (req, socket, head) => {
	const { pathname } = new URL(req.url, "http://container");
	if (!originAllowed(req)) {
		socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
		socket.destroy();
		return;
	}
	if (pathname === "/ws/term") {
		wssTerm.handleUpgrade(req, socket, head, (ws) =>
			wssTerm.emit("connection", ws, req),
		);
	} else if (pathname === "/ws/events") {
		wssEvents.handleUpgrade(req, socket, head, (ws) =>
			wssEvents.emit("connection", ws, req),
		);
	} else {
		socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		socket.destroy();
	}
});

// Heartbeat: sweep dead sockets so a vanished client frees the seat (and
// the proxy chain never sees an idle stream).
setInterval(() => {
	for (const ws of [...wssTerm.clients, ...wssEvents.clients]) {
		if (ws.isAlive === false) {
			ws.terminate();
			continue;
		}
		ws.isAlive = false;
		ws.ping();
	}
}, 30_000).unref();

// ---------------------------------------------------------------------------
// Lifecycle: a stop is a seam (02 item 12) — pi gets its hangup and a
// moment to finish writing; sessions persist by pi's own continuous append.
// ---------------------------------------------------------------------------

let shuttingDown = false;
async function shutdown(sig) {
	if (shuttingDown) return;
	shuttingDown = true;
	log("shutdown", { sig, pi: !!term });
	const t = term;
	if (t) {
		const exited = new Promise((r) => t.pty.onExit(() => r()));
		t.pty.kill();
		await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
	}
	// A stop is a seal (02 item 12): pi has hung up and flushed; ship what
	// remains, bounded well inside the compose stop grace. The host's sweep
	// re-treats anything this race cuts short — sealing is idempotent.
	await Promise.race([
		shipper.tick("stop"),
		new Promise((r) => setTimeout(r, 15_000)),
	]);
	process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => {
	log("listening", { port: PORT, gameDir: GAME_DIR });
	shipper.tick("boot"); // the sweep-on-connect trigger: seal what a crash left
});
setInterval(() => shipper.tick("checkpoint"), 10 * 60_000).unref();
