// The client half of the app server (02 item 5, R14): xterm.js attached to
// /ws/term, the viewer and file manager fed by /api/tree, ./files/… and the
// /ws/events watcher channel. One page, three regions, no framework (08).
// Everything rides RELATIVE URLs so the page works identically behind the
// Caddy door's prefix strip and bare on :7681.
"use strict";

/* global Terminal, FitAddon, WebglAddon, marked, DOMPurify */

const $ = (sel) => document.querySelector(sel);

// Two doors in one browser must not share tabs or tree state.
const NS = `wc:${location.pathname}:`;
const store = {
	get(key, fallback) {
		try {
			const raw = localStorage.getItem(NS + key);
			return raw === null ? fallback : JSON.parse(raw);
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(NS + key, JSON.stringify(value));
		} catch {}
	},
};

// Law 5: the terminal owns the keyboard — focus returns after any pane
// interaction; the panes are mouse-territory.
const refocus = () => setTimeout(() => term.focus(), 0);

// --- the terminal ----------------------------------------------------------

const term = new Terminal({
	scrollback: 5000,
	fontSize: 14,
	fontFamily: "'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace",
	cursorBlink: true,
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open($("#terminal"));
try {
	term.loadAddon(new WebglAddon.WebglAddon());
} catch {
	/* canvas fallback is xterm's default renderer — fine */
}

term.onBell(() => {
	document.body.classList.add("bell");
	setTimeout(() => document.body.classList.remove("bell"), 220);
});

const overlay = $("#overlay");
const overlayText = $("#overlay-text");
function showOverlay(text) {
	overlayText.textContent = text;
	overlay.hidden = false;
}
function hideOverlay() {
	overlay.hidden = true;
	term.focus();
}

// --- the terminal stream ---------------------------------------------------

const wsUrl = (rel) => {
	const u = new URL(rel, location.href);
	u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
	return u;
};

const encoder = new TextEncoder();
let ws = null;
let sittingLive = false;
let retryMs = 1000;

function connect() {
	ws = new WebSocket(wsUrl("ws/term"));
	ws.binaryType = "arraybuffer";

	ws.onopen = () => {
		retryMs = 1000;
		term.reset(); // the server repaints the whole screen on attach
		fit.fit();
		ws.send(
			JSON.stringify({ t: "resize", cols: term.cols, rows: term.rows, attach: true }),
		);
		hideOverlay();
		document.body.classList.add("connected");
	};

	ws.onmessage = (ev) => {
		if (typeof ev.data === "string") {
			let m;
			try {
				m = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (m.t === "exit") {
				sittingLive = false;
				showOverlay("the sitting has ended — press Enter to begin a new one");
			} else if (m.t === "spawned") {
				sittingLive = true;
				hideOverlay();
			}
			return;
		}
		term.write(new Uint8Array(ev.data));
	};

	ws.onclose = (ev) => {
		document.body.classList.remove("connected");
		if (ev.code === 4001) {
			showOverlay("this door was opened in another tab — play continues there");
			return;
		}
		showOverlay("connection lost — reaching for the door…");
		setTimeout(connect, retryMs);
		retryMs = Math.min(retryMs * 2, 10_000);
	};
}

term.onData((d) => {
	if (ws?.readyState === 1) ws.send(encoder.encode(d));
});

term.attachCustomKeyEventHandler((ev) => {
	if (!sittingLive && ev.type === "keydown" && ev.key === "Enter" && ws?.readyState === 1 && !overlay.hidden) {
		ws.send(JSON.stringify({ t: "respawn", cols: term.cols, rows: term.rows }));
		return false;
	}
	return true;
});

term.onResize(({ cols, rows }) => {
	if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "resize", cols, rows }));
});
let fitTimer = null;
window.addEventListener("resize", () => {
	clearTimeout(fitTimer);
	fitTimer = setTimeout(() => fit.fit(), 100);
});

// --- markdown --------------------------------------------------------------

marked.use({ gfm: true });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
	if (node.tagName === "A" && node.hasAttribute("href"))
		node.setAttribute("rel", "noopener noreferrer");
});

const fileUrl = (p) => "./files/" + p.split("/").map(encodeURIComponent).join("/");
const basename = (p) => p.split("/").pop();
const extOf = (p) => (basename(p).includes(".") ? basename(p).split(".").pop().toLowerCase() : "");
const IMG_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);
const VID_EXT = new Set(["webm", "ogv", "ogg", "mp4"]);
const TEXT_EXT = new Set(["json", "txt"]);

// Collapse ./ and ../ without ever escaping the pane roots.
function normalizePath(p) {
	const out = [];
	for (const seg of p.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") {
			if (!out.length) return null;
			out.pop();
		} else out.push(seg);
	}
	return out.length >= 2 ? out.join("/") : null;
}

// --- tabs (law 2: tabs remember) -------------------------------------------

let tabs = store.get("tabs", []);
let active = store.get("active", null);
if (active && !tabs.includes(active)) active = null;

const tabsEl = $("#tabs");
const viewerBody = $("#viewer-body");

function saveTabs() {
	store.set("tabs", tabs);
	store.set("active", active);
}

function renderTabs() {
	tabsEl.textContent = "";
	for (const path of tabs) {
		const tab = document.createElement("span");
		tab.className = "tab" + (path === active ? " active" : "");
		tab.title = path;
		const label = document.createElement("span");
		label.textContent = basename(path);
		const close = document.createElement("button");
		close.className = "close";
		close.textContent = "×";
		close.title = "close";
		tab.append(label, close);
		tab.addEventListener("click", (ev) => {
			if (ev.target === close) return;
			setActive(path);
			refocus();
		});
		tab.addEventListener("auxclick", (ev) => {
			if (ev.button === 1) {
				closeTab(path);
				refocus();
			}
		});
		close.addEventListener("click", () => {
			closeTab(path);
			refocus();
		});
		tabsEl.append(tab);
	}
}

function openTab(path, { activate = true } = {}) {
	if (!tabs.includes(path)) tabs.push(path); // dedup by path
	if (activate) active = path;
	saveTabs();
	renderTabs();
	if (activate) renderViewer({ scroll: "top" });
	badges.delete(path);
	renderTree();
}

function setActive(path) {
	if (active === path) return;
	active = path;
	saveTabs();
	renderTabs();
	renderViewer({ scroll: "top" });
}

function closeTab(path) {
	const i = tabs.indexOf(path);
	if (i === -1) return;
	tabs.splice(i, 1);
	if (active === path) active = tabs[i] ?? tabs[i - 1] ?? null;
	saveTabs();
	renderTabs();
	renderViewer({ scroll: "top" });
}

// --- the viewer ------------------------------------------------------------

let renderSeq = 0;

async function renderViewer({ scroll = "keep" } = {}) {
	const seq = ++renderSeq;
	if (!active) {
		viewerBody.innerHTML = '<div id="viewer-empty">the chronicle opens here — pick a page below</div>';
		return;
	}
	const path = active;
	const nearBottom =
		viewerBody.scrollTop + viewerBody.clientHeight >= viewerBody.scrollHeight - 24;
	const ext = extOf(path);

	const put = (node) => {
		if (seq !== renderSeq) return; // a newer render overtook this one
		viewerBody.textContent = "";
		viewerBody.append(node);
		if (scroll === "top") viewerBody.scrollTop = 0;
		// law 3: ledger.md follows its tail when the reader was at the bottom
		else if (scroll === "keep" && nearBottom) viewerBody.scrollTop = viewerBody.scrollHeight;
	};

	if (IMG_EXT.has(ext)) {
		const wrap = document.createElement("div");
		wrap.className = "media-wrap";
		const img = document.createElement("img");
		img.src = fileUrl(path);
		img.alt = basename(path);
		wrap.append(img);
		put(wrap);
		return;
	}
	if (VID_EXT.has(ext)) {
		const wrap = document.createElement("div");
		wrap.className = "media-wrap";
		const video = document.createElement("video");
		video.controls = true;
		video.preload = "metadata";
		video.src = fileUrl(path);
		wrap.append(video);
		put(wrap);
		return;
	}

	let res;
	try {
		res = await fetch(fileUrl(path));
	} catch {
		res = null;
	}
	if (!res?.ok) {
		const gone = document.createElement("div");
		gone.className = "gone";
		gone.textContent = "this page has left the world";
		put(gone);
		return;
	}
	const text = await res.text();
	if (ext === "md" || ext === "markdown") {
		const doc = document.createElement("div");
		doc.className = "doc";
		doc.innerHTML = DOMPurify.sanitize(marked.parse(text));
		put(doc);
		return;
	}
	if (TEXT_EXT.has(ext) || text.length) {
		const pre = document.createElement("pre");
		pre.className = "raw";
		pre.textContent = text;
		put(pre);
		return;
	}
	const empty = document.createElement("div");
	empty.className = "gone";
	empty.textContent = "(an empty page)";
	put(empty);
}

// Links in the chronicle stay inside the game: externals open a fresh
// browser tab; relative ones open as OUR tabs, resolved against the file.
viewerBody.addEventListener("click", (ev) => {
	const a = ev.target.closest("a");
	if (!a || !viewerBody.contains(a)) return;
	const href = a.getAttribute("href") ?? "";
	ev.preventDefault();
	if (/^https?:\/\//i.test(href)) {
		window.open(href, "_blank", "noopener");
		return;
	}
	if (href.startsWith("#") || !active) return;
	const dir = active.split("/").slice(0, -1).join("/");
	const resolved = normalizePath(dir + "/" + decodeURIComponent(href));
	if (resolved) {
		openTab(resolved);
		refocus();
	}
});

// --- the file manager ------------------------------------------------------

const treeEl = $("#tree");
const expanded = new Set(store.get("expanded", ["config", "data"]));
const badges = new Set(); // fresh pages, quietly marked (law 3)
let roots = [];

function hasBadgeUnder(dirPath) {
	for (const b of badges) if (b.startsWith(dirPath + "/")) return true;
	return false;
}

function renderTree() {
	const ul = document.createElement("ul");
	for (const root of roots) ul.append(renderNode(root, root.name));
	treeEl.textContent = "";
	treeEl.append(ul);
}

function renderNode(node, path) {
	const li = document.createElement("li");
	const row = document.createElement("div");
	row.className = "node-row" + (node.dir ? " dir" : "");
	row.title = path;

	if (node.dir) {
		const isOpen = expanded.has(path);
		const arrow = document.createElement("span");
		arrow.className = "arrow";
		arrow.textContent = isOpen ? "▾" : "▸";
		const name = document.createElement("span");
		name.textContent = node.name;
		row.append(arrow, name);
		if (!isOpen && hasBadgeUnder(path)) row.append(badgeDot());
		row.addEventListener("click", () => {
			if (expanded.has(path)) expanded.delete(path);
			else expanded.add(path);
			store.set("expanded", [...expanded]);
			renderTree();
			refocus();
		});
		li.append(row);
		if (isOpen && node.children?.length) {
			const ul = document.createElement("ul");
			for (const child of node.children) ul.append(renderNode(child, `${path}/${child.name}`));
			li.append(ul);
		}
	} else {
		const pad = document.createElement("span");
		pad.className = "arrow";
		const name = document.createElement("span");
		name.textContent = node.name;
		row.append(pad, name);
		if (badges.has(path)) row.append(badgeDot());
		// law 1: one click opens
		row.addEventListener("click", () => {
			openTab(path);
			refocus();
		});
		li.append(row);
	}
	return li;
}

const badgeDot = () => {
	const b = document.createElement("span");
	b.className = "badge";
	return b;
};

function applyTree(data) {
	roots = data.roots ?? [];
	$("#files-label").textContent = data.truncated ? "pages (list truncated)" : "pages";
	if (data.title) {
		$("#strip-world").textContent = data.title;
		$("#strip-world").hidden = false;
	}
	renderTree();
}

// The rounds note (08's strip law, R12): an invisible meter is the genre's
// #1 complaint, so the strip says plainly how many rounds the house grant
// still buys this month. Off the lane the server answers {lane:false} and
// the note never appears. Refreshed on a slow clock — the count only needs
// to be roughly true between turns.
async function refreshGrant() {
	try {
		const g = await (await fetch("./api/grant")).json();
		const el = $("#strip-rounds");
		if (!g.lane) {
			el.hidden = true;
			return;
		}
		el.textContent = !g.laneOpen
			? "the keeper rests"
			: g.rounds > 0
				? `~${g.rounds} rounds`
				: "grant spent";
		el.hidden = false;
	} catch {}
}
refreshGrant();
setInterval(refreshGrant, 90_000);

let treeTimer = null;
function scheduleTreeRefresh() {
	clearTimeout(treeTimer);
	treeTimer = setTimeout(async () => {
		try {
			const res = await fetch("./api/tree");
			if (res.ok) applyTree(await res.json());
		} catch {}
	}, 250);
}

// --- the watcher channel (law 3: everything hot-reloads) --------------------

const mediaAuto = $("#media-auto");
mediaAuto.checked = store.get("mediaAuto", true);
mediaAuto.addEventListener("change", () => {
	store.set("mediaAuto", mediaAuto.checked);
	refocus();
});

let renderTimer = null;

function onFsEvent(m) {
	const path = `${m.root}/${m.rel}`;
	if (m.kind === "add") {
		badges.add(path);
		scheduleTreeRefresh();
		// law 4: the scrying glass shows its catch — media only, never text
		const isCatch = /^(pic|clip)-/.test(basename(path));
		if (
			mediaAuto.checked &&
			isCatch &&
			path.startsWith("data/downloads/") &&
			(IMG_EXT.has(extOf(path)) || VID_EXT.has(extOf(path)))
		) {
			openTab(path);
		}
	} else if (m.kind === "unlink") {
		badges.delete(path);
		scheduleTreeRefresh();
		if (path === active) renderViewer({ scroll: "keep" });
	} else if (m.kind === "addDir" || m.kind === "unlinkDir") {
		scheduleTreeRefresh();
	} else if (m.kind === "change" && path === active) {
		clearTimeout(renderTimer);
		renderTimer = setTimeout(() => renderViewer({ scroll: "keep" }), 150);
	}
}

let eventsRetryMs = 1000;
function connectEvents() {
	const es = new WebSocket(wsUrl("ws/events"));
	es.onmessage = (ev) => {
		let m;
		try {
			m = JSON.parse(ev.data);
		} catch {
			return;
		}
		if (m.t === "hello") {
			eventsRetryMs = 1000;
			applyTree(m);
			if (active) renderViewer({ scroll: "keep" }); // the world may have moved while we were away
		} else if (m.t === "fs") onFsEvent(m);
	};
	es.onclose = () => {
		setTimeout(connectEvents, eventsRetryMs);
		eventsRetryMs = Math.min(eventsRetryMs * 2, 10_000);
	};
}

// --- narrow screens ---------------------------------------------------------

$("#panes-toggle").addEventListener("click", () => {
	document.body.classList.toggle("side-open");
	refocus();
});

// --- boot --------------------------------------------------------------------

renderTabs();
renderViewer({ scroll: "top" });
scheduleTreeRefresh();
connect();
connectEvents();
term.focus();
