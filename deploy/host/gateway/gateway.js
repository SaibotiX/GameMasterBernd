#!/usr/bin/env node
// The house lane's gateway (02 §house lane, R12; shape decided by the item-1
// spike — deploy/gateway-spike/): it stands between every friend's pi and
// api.anthropic.com holding the ORG key (R29), so containers only ever see
// per-friend VIRTUAL keys with budgets and rate limits.
//
//   friend container ──x-api-key: <virtual>──▶ gateway ──x-api-key: <org>──▶ Anthropic
//
// Its meter is the billing source of truth (02), reconciled nightly against
// pi's own per-turn cost lines once the ledger round lands (R6, map item 3).
// Storage is deliberately plain until then: keys.json re-read per request
// (box-local edits by new-friend.sh apply live, no reload dance) and an
// append-only usage.jsonl summed at boot. The ledger replaces the storage,
// not the seam.
//
// Env: ANTHROPIC_ORG_KEY (required, from the host's gitignored .env) ·
// GATEWAY_BIND (default 127.0.0.1; compose sets 0.0.0.0 so friends on the
// web network can reach it) · GATEWAY_PORT (4100) · GATEWAY_UPSTREAM
// (default the real API; localcheck points it at the stub) · GATEWAY_KEYS /
// GATEWAY_LEDGER (default /data/…, the box-local state bind).

import fs from "node:fs";
import http from "node:http";

const ORG_KEY = process.env.ANTHROPIC_ORG_KEY;
const BIND = process.env.GATEWAY_BIND ?? "127.0.0.1";
const PORT = Number(process.env.GATEWAY_PORT ?? 4100);
const UPSTREAM = process.env.GATEWAY_UPSTREAM ?? "https://api.anthropic.com";
const KEYS_FILE = process.env.GATEWAY_KEYS ?? "/data/keys.json";
const LEDGER_FILE = process.env.GATEWAY_LEDGER ?? "/data/usage.jsonl";

if (!ORG_KEY) {
	console.error("gateway: ANTHROPIC_ORG_KEY is not set — the lane cannot open");
	process.exit(1);
}

// The lane routes models OURS (02 §house lane) — default-deny, priced rows
// only. Prices per MTok, re-verified 2026-08-09 (R29; 06 §2026-08-09). The
// Sonnet row is the intro price THROUGH 2026-08-31 — $3/$15 after (standing
// trigger). cache_creation is charged at the 5-minute write rate; the live
// usage shape now carries an ephemeral_5m/1h split, and pricing the 1-hour
// bucket at its 2x rate is the ledger round's refinement.
const PRICES = {
	"claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
	"claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
const priceRow = (model) =>
	Object.entries(PRICES).find(([id]) => model?.startsWith(id))?.[1];

// usage → micro-USD (1e-6 USD; integers end to end, no float drift).
function costMicro(model, u) {
	const p = priceRow(model);
	if (!p) return 0;
	return Math.round(
		(u.input_tokens ?? 0) * p.input +
			(u.output_tokens ?? 0) * p.output +
			(u.cache_read_input_tokens ?? 0) * p.cacheRead +
			(u.cache_creation_input_tokens ?? 0) * p.cacheWrite,
	);
}

// keys.json: { "<virtual>": { "player": "alice", "budgetMicro": 10000000,
// "rpm": 60 } } — re-read on every auth so a minted or revoked key binds on
// the next request. ~15 friends make this a non-cost.
function readKeys() {
	try {
		return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
	} catch (e) {
		console.error(`gateway: cannot read ${KEYS_FILE}: ${e.message}`);
		return {};
	}
}

const spentMicro = {};
if (fs.existsSync(LEDGER_FILE))
	for (const line of fs.readFileSync(LEDGER_FILE, "utf8").split("\n")) {
		if (!line) continue;
		try {
			const row = JSON.parse(line);
			spentMicro[row.key] = (spentMicro[row.key] ?? 0) + row.costMicro;
		} catch {}
	}

function record(key, player, model, usage) {
	const cost = costMicro(model, usage);
	spentMicro[key] = (spentMicro[key] ?? 0) + cost;
	fs.appendFileSync(
		LEDGER_FILE,
		JSON.stringify({ ts: new Date().toISOString(), key, player, model, usage, costMicro: cost }) + "\n",
	);
}

// Per-key rate limit: a one-minute sliding window, in memory. Turn-based
// play sits far under the default; the ceiling exists so a runaway loop in
// a container cannot drain a grant in seconds.
const RPM_DEFAULT = 30;
const windows = {};
function overRpm(key, rpm) {
	const now = Date.now();
	const w = (windows[key] = (windows[key] ?? []).filter((t) => now - t < 60_000));
	if (w.length >= rpm) return true;
	w.push(now);
	return false;
}

const refuse = (res, status, message) => {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message } }));
};

const server = http.createServer(async (req, res) => {
	if (req.method === "GET" && req.url === "/healthz") {
		const keys = readKeys();
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: true,
				keys: Object.fromEntries(
					Object.entries(keys).map(([k, v]) => [
						k,
						{ player: v.player, budgetMicro: v.budgetMicro, spentMicro: spentMicro[k] ?? 0 },
					]),
				),
			}),
		);
		return;
	}
	if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
		refuse(res, 404, "the house gateway speaks only POST /v1/messages");
		return;
	}

	const virtual = req.headers["x-api-key"];
	const grant = typeof virtual === "string" ? readKeys()[virtual] : undefined;
	if (!grant) {
		refuse(res, 401, "unknown key — this door is not yours");
		return;
	}
	if ((spentMicro[virtual] ?? 0) >= grant.budgetMicro) {
		refuse(res, 400, "The house grant is spent — the keeper rests until the maintainer tops it up.");
		return;
	}
	if (overRpm(virtual, grant.rpm ?? RPM_DEFAULT)) {
		refuse(res, 429, "The keeper needs a breath — a moment, then try again.");
		return;
	}

	const chunks = [];
	for await (const c of req) chunks.push(c);
	const body = Buffer.concat(chunks);

	let model;
	try {
		model = JSON.parse(body.toString("utf8")).model;
	} catch {
		refuse(res, 400, "unreadable request body");
		return;
	}
	if (!priceRow(model)) {
		refuse(res, 400, `model ${model} is not served on the house lane`);
		return;
	}

	// Forward with the ORG key; the headers the API cares about pass through.
	let upstream;
	try {
		upstream = await fetch(`${UPSTREAM}/v1/messages`, {
			method: "POST",
			headers: {
				"content-type": req.headers["content-type"] ?? "application/json",
				"anthropic-version": req.headers["anthropic-version"] ?? "2023-06-01",
				...(req.headers["anthropic-beta"] ? { "anthropic-beta": req.headers["anthropic-beta"] } : {}),
				"x-api-key": ORG_KEY,
			},
			body,
		});
	} catch (e) {
		console.error(`gateway: upstream unreachable: ${e.message}`);
		refuse(res, 502, "the lane could not reach the provider — try again shortly");
		return;
	}

	res.writeHead(upstream.status, {
		"content-type": upstream.headers.get("content-type") ?? "application/json",
	});

	const streaming = upstream.headers.get("content-type")?.includes("text/event-stream");
	if (!streaming) {
		const text = await upstream.text();
		if (upstream.ok) {
			try {
				const msg = JSON.parse(text);
				if (msg.usage) record(virtual, grant.player, model, msg.usage);
			} catch {}
		}
		res.end(text);
		return;
	}

	// SSE: pipe bytes through UNTOUCHED while a line-buffered shadow reads
	// the meter — message_start carries input + cache token counts, the final
	// message_delta the cumulative output count.
	const usage = {};
	let tail = "";
	const scan = (text) => {
		tail += text;
		const lines = tail.split("\n");
		tail = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.startsWith("data:")) continue;
			try {
				const ev = JSON.parse(line.slice(5));
				const u = ev.type === "message_start" ? ev.message?.usage : ev.type === "message_delta" ? ev.usage : null;
				if (u) Object.assign(usage, JSON.parse(JSON.stringify(u)));
			} catch {}
		}
	};
	const decoder = new TextDecoder();
	try {
		for await (const chunk of upstream.body) {
			res.write(chunk);
			scan(decoder.decode(chunk, { stream: true }));
		}
	} catch (e) {
		console.error(`gateway: stream broke mid-flight: ${e.message}`);
	}
	res.end();
	if (upstream.ok && usage.input_tokens != null) record(virtual, grant.player, model, usage);
});

server.listen(PORT, BIND, () => {
	console.log(`gateway: listening on ${BIND}:${PORT} → ${UPSTREAM}`);
	console.log(`gateway: keys from ${KEYS_FILE}, ledger at ${LEDGER_FILE}`);
});
