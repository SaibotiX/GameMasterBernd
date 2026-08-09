#!/usr/bin/env node
// Drives the app server the way the page does and asserts the game's PTY
// stream flows through OUR transport (the ttyd fallback keeps ws-probe.mjs):
// fetch the page, check /healthz, walk the pane APIs (tree, a real file, a
// refused traversal, the events channel's hello), then open /ws/term,
// announce a size, and watch until the game footer's "mood:" mark appears.
//
//   node appserver-probe.mjs [http://127.0.0.1:7681]
//   node appserver-probe.mjs <base> --fs-event    # events channel only:
//       wait for one {t:'fs'} push (the caller writes into data/ meanwhile)
//       and print the connect→event latency — 08's write-to-rerender number
//       starts here.
//
// Through a proxy door: WS_PROBE_AUTH="user:pass" adds basic auth, and the
// caller sets NODE_TLS_REJECT_UNAUTHORIZED=0 for self-signed local TLS —
// same contract as ws-probe.mjs, so localcheck.sh drives both alike.
//
// Pipe-level truth only: whether the dress LOOKS right in a real browser
// stays the eyeball sitting's job (deploy/README.md §first-deploy step 6).

const base = (process.argv[2] ?? "http://127.0.0.1:7681").replace(/\/$/, "");
const mode = process.argv[3] ?? "";
const deadlineMs = 45_000;

const auth = process.env.WS_PROBE_AUTH;
const headers = auth
	? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` }
	: {};

const fail = (msg) => {
	console.error(`FAIL appserver-probe: ${msg}`);
	process.exit(1);
};
const ok = (msg) => console.log(`ok  appserver-probe: ${msg}`);

const openEvents = () => {
	const url = new URL(`${base.replace(/^http/, "ws")}/ws/events`);
	const ws = new WebSocket(url, auth ? { headers } : undefined);
	return ws;
};

// --- events-only mode: one fs push, timed ---------------------------------
if (mode === "--fs-event") {
	const ws = openEvents();
	const t0 = Date.now();
	const result = await new Promise((resolve) => {
		const timer = setTimeout(() => resolve("timeout"), 20_000);
		ws.onmessage = (ev) => {
			let m;
			try {
				m = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (m.t === "fs") {
				clearTimeout(timer);
				resolve("ok");
			}
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve("error");
		};
	});
	try {
		ws.close();
	} catch {}
	if (result !== "ok") fail(`fs event never arrived (${result})`);
	ok(`a write in data/ reached the events channel (${Date.now() - t0} ms after connect)`);
	process.exit(0);
}

// --- 1. the page -----------------------------------------------------------
{
	const res = await fetch(`${base}/`, { headers });
	if (!res.ok) fail(`GET / → ${res.status}`);
	const html = await res.text();
	if (!html.includes('id="terminal"')) fail("page carries no terminal pane");
	ok("page serves");
}

// --- 2. health -------------------------------------------------------------
{
	const res = await fetch(`${base}/healthz`, { headers });
	if (!res.ok) fail(`GET /healthz → ${res.status}`);
	const h = await res.json();
	if (h.ok !== true) fail(`healthz not ok: ${JSON.stringify(h)}`);
	ok("healthz answers");
}

// --- 3. the pane APIs ------------------------------------------------------
{
	const res = await fetch(`${base}/api/tree`, { headers });
	if (!res.ok) fail(`GET /api/tree → ${res.status}`);
	const tree = await res.json();
	const names = (tree.roots ?? []).map((r) => r.name);
	if (!names.includes("config") || !names.includes("data"))
		fail(`tree roots are [${names}], expected config + data`);
	ok("tree serves both pane roots");
}
{
	const res = await fetch(`${base}/files/config/constitution.md`, { headers });
	if (!res.ok) fail(`GET /files/config/constitution.md → ${res.status}`);
	if (!(res.headers.get("content-type") ?? "").startsWith("text/markdown"))
		fail(`constitution served as ${res.headers.get("content-type")}`);
	const text = await res.text();
	if (text.length < 100) fail("constitution came back suspiciously empty");
	ok("a real file serves with its type");
}
{
	const res = await fetch(`${base}/files/config/%2e%2e/%2e%2e/etc/passwd`, {
		headers,
	});
	if (res.status !== 404) fail(`traversal answered ${res.status}, expected 404`);
	ok("dot-dot traversal is refused");
}
{
	const ws = openEvents();
	const result = await new Promise((resolve) => {
		const timer = setTimeout(() => resolve("timeout"), 15_000);
		ws.onmessage = (ev) => {
			let m;
			try {
				m = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (m.t === "hello" && Array.isArray(m.roots)) {
				clearTimeout(timer);
				resolve("ok");
			}
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve("error");
		};
	});
	try {
		ws.close();
	} catch {}
	if (result !== "ok") fail(`events hello never arrived (${result})`);
	ok("events channel says hello with the tree");
}

// --- 4. the terminal stream ------------------------------------------------
const stripAnsi = (s) =>
	s
		.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
		.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)?/g, "")
		.replace(/\x1b[=>()][0-9A-Za-z]?/g, "")
		.replace(/\r/g, "");

{
	const url = new URL(`${base.replace(/^http/, "ws")}/ws/term`);
	const ws = new WebSocket(url, auth ? { headers } : undefined);
	ws.binaryType = "arraybuffer";
	const decoder = new TextDecoder("utf-8", { fatal: false });
	let seen = "";

	const result = await new Promise((resolve) => {
		const timer = setTimeout(() => resolve("timeout"), deadlineMs);
		ws.onopen = () =>
			ws.send(JSON.stringify({ t: "resize", cols: 110, rows: 30, attach: true }));
		ws.onmessage = (ev) => {
			if (typeof ev.data === "string") return; // control frames
			seen += decoder.decode(new Uint8Array(ev.data), { stream: true });
			if (/mood:/.test(stripAnsi(seen))) {
				clearTimeout(timer);
				resolve("ok");
			}
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve("error");
		};
		ws.onclose = () => {
			clearTimeout(timer);
			resolve(/mood:/.test(stripAnsi(seen)) ? "ok" : "closed");
		};
	});
	try {
		ws.close();
	} catch {}
	if (result !== "ok") {
		console.error(`FAIL appserver-probe: term ${result} — footer never appeared. Last output:`);
		console.error(stripAnsi(seen).split("\n").slice(-15).join("\n"));
		process.exit(1);
	}
	ok("game footer reached the web client through /ws/term");
}

console.log("appserver-probe green");
process.exit(0);
