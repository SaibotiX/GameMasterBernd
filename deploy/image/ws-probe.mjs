#!/usr/bin/env node
// Drives ttyd's WebSocket exactly as its bundled xterm.js client does and
// asserts the game's PTY stream flows through the web transport: fetch the
// auth token, open ws with the "tty" subprotocol, announce a terminal size,
// then watch the output until the game footer's "mood:" mark appears.
//
//   node ws-probe.mjs [http://127.0.0.1:7681]
//
// This proves pipe-level truth only — pi booted, the TUI rendered, bytes
// reached a web client. Whether the dress LOOKS right in a real browser
// (dice overlay, board colors, bell) stays the first-deploy eyeball check
// (02 item 3).
const base = (process.argv[2] ?? "http://127.0.0.1:7681").replace(/\/$/, "");
const deadlineMs = 30_000;

const { token } = await (await fetch(`${base}/token`)).json();

const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws`, ["tty"]);
ws.binaryType = "arraybuffer";

const decoder = new TextDecoder("utf-8", { fatal: false });
let seen = "";
const stripAnsi = (s) =>
	s
		.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
		.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)?/g, "")
		.replace(/\x1b[=>()][0-9A-Za-z]?/g, "")
		.replace(/\r/g, "");

const result = await new Promise((resolve) => {
	const timer = setTimeout(() => resolve("timeout"), deadlineMs);
	ws.onopen = () => {
		// ttyd handshake: JSON auth + initial size, then raw '0'-prefixed stdin.
		ws.send(JSON.stringify({ AuthToken: token ?? "", columns: 110, rows: 30 }));
	};
	ws.onmessage = (ev) => {
		const buf = new Uint8Array(ev.data);
		if (buf.length === 0) return;
		const cmd = String.fromCharCode(buf[0]);
		if (cmd === "0") seen += decoder.decode(buf.subarray(1), { stream: true });
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

try { ws.close(); } catch {}

if (result === "ok") {
	console.log("ok  ws-probe: game footer reached the web client through ttyd");
	process.exit(0);
}
console.error(`FAIL ws-probe: ${result} — footer never appeared. Last output:`);
console.error(stripAnsi(seen).split("\n").slice(-15).join("\n"));
process.exit(1);
