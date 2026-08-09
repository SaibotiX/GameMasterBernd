// The client half of the app server (02 item 5, R14): xterm.js attached to
// /ws/term. Everything rides RELATIVE URLs so the page works identically
// behind the Caddy door's prefix strip and bare on :7681.
"use strict";

/* global Terminal, FitAddon, WebglAddon */

const $ = (sel) => document.querySelector(sel);

// --- the terminal ----------------------------------------------------------

const term = new Terminal({
	scrollback: 5000,
	fontSize: 15,
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

// The bell, visible: the TUI rings at urgent board moments.
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

// --- the stream ------------------------------------------------------------

const wsUrl = (rel) => {
	const u = new URL(rel, location.href);
	u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
	return u;
};

const encoder = new TextEncoder();
let ws = null;
let sittingLive = false; // pi running, per the server's word
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
		setConnected(true);
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
		setConnected(false);
		if (ev.code === 4001) {
			// takeover: this tab lost the seat to a newer one — do not retry.
			showOverlay("this door was opened in another tab — play continues there");
			return;
		}
		showOverlay("connection lost — reaching for the door…");
		setTimeout(connect, retryMs);
		retryMs = Math.min(retryMs * 2, 10_000);
	};
}

function setConnected(on) {
	document.body.classList.toggle("connected", on);
}

// keystrokes → PTY (binary frames; one frame per xterm data event)
term.onData((d) => {
	if (ws?.readyState === 1) ws.send(encoder.encode(d));
});

// respawn from the ended-sitting overlay
term.attachCustomKeyEventHandler((ev) => {
	if (!sittingLive && ev.type === "keydown" && ev.key === "Enter" && ws?.readyState === 1 && !overlay.hidden) {
		ws.send(JSON.stringify({ t: "respawn", cols: term.cols, rows: term.rows }));
		return false;
	}
	return true;
});

// size follows the pane, the PTY follows the terminal
term.onResize(({ cols, rows }) => {
	if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "resize", cols, rows }));
});
let fitTimer = null;
window.addEventListener("resize", () => {
	clearTimeout(fitTimer);
	fitTimer = setTimeout(() => fit.fit(), 100);
});

connect();
term.focus();
