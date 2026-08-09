#!/usr/bin/env node
// Candidate B: the small own proxy — R12's "LiteLLM-style" named a shape, not a
// dependency; this is the shape in ~200 lines of the node the image already
// carries. One job: stand between pi and api.anthropic.com holding the ORG key,
// so containers only ever see per-friend VIRTUAL keys with budgets.
//
//   friend container ──x-api-key: <virtual>──▶ this ──x-api-key: <org>──▶ Anthropic
//
// What it must prove for the spike (map item 1, deploy/README.md §next round):
// pi's anthropic-messages dialect passes through unmodified · cache_control
// survives with cache hits on the receipt · streaming intact · per-turn usage
// captured HERE (the gateway's meter is the billing source of truth, 02 §house
// lane) · an exhausted budget refuses cleanly.
//
// Spike-grade storage, deliberately: keys in keys.json, spend as append-only
// JSONL (summed at boot). The real ledger (map item 3) replaces the storage,
// not the seam.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORG_KEY = process.env.ANTHROPIC_ORG_KEY;
const PORT = Number(process.env.GATEWAY_PORT ?? 4100);
const UPSTREAM = process.env.GATEWAY_UPSTREAM ?? "https://api.anthropic.com";
const KEYS_FILE = process.env.GATEWAY_KEYS ?? path.join(HERE, "keys.json");
const LEDGER_FILE = process.env.GATEWAY_LEDGER ?? path.join(HERE, "usage.jsonl");

if (!ORG_KEY) {
	console.error("own-proxy: ANTHROPIC_ORG_KEY is not set (see .env.example)");
	process.exit(1);
}

// The lane routes models OURS (02 §house lane) — default-deny, priced rows only.
// Prices per MTok, re-verified 2026-08-09 (R29; 06 §2026-08-09). Sonnet rows are
// the intro prices THROUGH 2026-08-31 — $3/$15 after (the standing trigger).
const PRICES = {
	"claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
	"claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
const priceRow = (model) =>
	Object.entries(PRICES).find(([id]) => model?.startsWith(id))?.[1];

// usage → micro-USD (1e-6 USD; integers end to end, no float drift).
// cache_creation is charged at the 5-minute write rate; a 1-hour TTL write
// (2x) would need the cache_creation.ephemeral_1h breakdown — ledger-round work.
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

const keys = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
const spentMicro = Object.fromEntries(Object.keys(keys).map((k) => [k, 0]));
if (fs.existsSync(LEDGER_FILE))
	for (const line of fs.readFileSync(LEDGER_FILE, "utf8").split("\n")) {
		if (!line) continue;
		const row = JSON.parse(line);
		if (row.key in spentMicro) spentMicro[row.key] += row.costMicro;
	}

function record(key, model, usage) {
	const costMicroUsd = costMicro(model, usage);
	spentMicro[key] += costMicroUsd;
	fs.appendFileSync(
		LEDGER_FILE,
		JSON.stringify({ ts: new Date().toISOString(), key, player: keys[key].player, model, usage, costMicro: costMicroUsd }) + "\n",
	);
}

const refuse = (res, status, message) => {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message } }));
};

const server = http.createServer(async (req, res) => {
	if (req.method === "GET" && req.url === "/healthz") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: true,
				keys: Object.fromEntries(
					Object.entries(keys).map(([k, v]) => [
						k,
						{ player: v.player, budgetMicro: v.budgetMicro, spentMicro: spentMicro[k] },
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
	const grant = typeof virtual === "string" ? keys[virtual] : undefined;
	if (!grant) {
		refuse(res, 401, "unknown key — this door is not yours");
		return;
	}
	if (spentMicro[virtual] >= grant.budgetMicro) {
		refuse(res, 400, "The house grant is spent — the keeper rests until the maintainer tops it up.");
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

	// Forward with the ORG key; every other header that matters to the API
	// (anthropic-version, anthropic-beta, content-type) passes through.
	const upstream = await fetch(`${UPSTREAM}/v1/messages`, {
		method: "POST",
		headers: {
			"content-type": req.headers["content-type"] ?? "application/json",
			"anthropic-version": req.headers["anthropic-version"] ?? "2023-06-01",
			...(req.headers["anthropic-beta"] ? { "anthropic-beta": req.headers["anthropic-beta"] } : {}),
			"x-api-key": ORG_KEY,
		},
		body,
	});

	res.writeHead(upstream.status, {
		"content-type": upstream.headers.get("content-type") ?? "application/json",
	});

	const streaming = upstream.headers.get("content-type")?.includes("text/event-stream");
	if (!streaming) {
		const text = await upstream.text();
		if (upstream.ok) {
			try {
				const msg = JSON.parse(text);
				if (msg.usage) record(virtual, model, msg.usage);
			} catch {}
		}
		res.end(text);
		return;
	}

	// SSE: pipe bytes through UNTOUCHED while a line-buffered shadow reads the
	// meter — message_start carries input + cache token counts, the final
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
	for await (const chunk of upstream.body) {
		res.write(chunk);
		scan(decoder.decode(chunk, { stream: true }));
	}
	res.end();
	if (upstream.ok && usage.input_tokens != null) record(virtual, model, usage);
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`own-proxy: listening on 127.0.0.1:${PORT} → ${UPSTREAM}`);
	console.log(`own-proxy: keys=${Object.keys(keys).join(", ")}`);
});
