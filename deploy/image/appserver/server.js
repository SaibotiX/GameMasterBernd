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
import pty from "node-pty";
import { WebSocketServer } from "ws";

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
				}),
			);
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
	} else {
		socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		socket.destroy();
	}
});

// Heartbeat: sweep dead sockets so a vanished client frees the seat (and
// the proxy chain never sees an idle stream).
setInterval(() => {
	for (const ws of wssTerm.clients) {
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
	process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => log("listening", { port: PORT, gameDir: GAME_DIR }));
