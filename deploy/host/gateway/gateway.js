#!/usr/bin/env node
// The house lane's gateway (02 §house lane, R12; shape decided by the item-1
// spike — deploy/gateway-spike/): it stands between every friend's pi and
// api.anthropic.com holding the ORG key (R29), so containers only ever see
// per-friend VIRTUAL keys with budgets and rate limits.
//
//   friend container ──x-api-key: <virtual>──▶ gateway ──x-api-key: <org>──▶ Anthropic
//
// Its meter is the billing source of truth (02), reconciled nightly against
// pi's own per-turn cost lines (R6, reconcile.sh). THE LEDGER LIVES HERE
// (R12, map item 3): keys.json re-read per request (box-local edits by
// new-friend.sh apply live, no reload dance), an append-only usage.jsonl
// folded at boot into per-key-per-month, global-month and global-day
// buckets — grants are CALENDAR-MONTH scoped, and two ruled bounds stand
// over everything (the maintainer, 2026-08-09): the global monthly
// KILL-SWITCH that stops the whole lane (€50 ≈ $55 at the ruling-day rate —
// the meter stays micro-USD because the provider bills USD) and the global
// DAILY alarm that only pings (€5 ≈ $5.50). Pings travel by ntfy.sh push
// when NTFY_TOPIC is set (the topic name is the secret, box .env only,
// carrying spend numbers and player names — never play content); unset,
// they land in the container log alone.
//
// Env: ANTHROPIC_ORG_KEY (required, from the host's gitignored .env) ·
// GATEWAY_BIND (default 127.0.0.1; compose sets 0.0.0.0 so friends on the
// web network can reach it) · GATEWAY_PORT (4100) · GATEWAY_UPSTREAM
// (default the real API; localcheck points it at the stub) · GATEWAY_KEYS /
// GATEWAY_LEDGER (default /data/…, the box-local state bind) ·
// GATEWAY_KILL_MICRO / GATEWAY_ALARM_DAY_MICRO (localcheck shrinks them to
// prove the tripwires) · NTFY_TOPIC.

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

// `||`, not `??`: compose forwards these as EMPTY strings when unset on the
// host, and Number("") is 0 — which would rest the lane forever.
const KILL_MICRO = Number(process.env.GATEWAY_KILL_MICRO || 55_000_000);
const ALARM_DAY_MICRO = Number(process.env.GATEWAY_ALARM_DAY_MICRO || 5_500_000);
const NTFY_TOPIC = process.env.NTFY_TOPIC;

// One ping per latch key (kill:<month>, alarm:<day>, grant:<key>:<month>) —
// in-memory, so a restart may repeat a still-true warning; that is a
// feature. Pings never block or fail the lane.
const pinged = new Set();
function ping(latch, text) {
	if (pinged.has(latch)) return;
	pinged.add(latch);
	console.log(`ping: ${text}`);
	if (NTFY_TOPIC)
		fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
			method: "POST",
			headers: { title: "world console — the house lane" },
			body: text,
		}).catch((e) => console.error(`ping failed to send: ${e.message}`));
}

// The ledger's living buckets, folded from the append-only file at boot.
const spentMicro = {}; // lifetime per key
const keyMonth = {}; // key → { "2026-08": micro }
const globalMonth = {}; // "2026-08" → micro
const globalDay = {}; // "2026-08-09" → micro
function bucket(key, ts, cost) {
	const month = ts.slice(0, 7);
	const day = ts.slice(0, 10);
	spentMicro[key] = (spentMicro[key] ?? 0) + cost;
	(keyMonth[key] ??= {})[month] = (keyMonth[key][month] ?? 0) + cost;
	globalMonth[month] = (globalMonth[month] ?? 0) + cost;
	globalDay[day] = (globalDay[day] ?? 0) + cost;
}
if (fs.existsSync(LEDGER_FILE))
	for (const line of fs.readFileSync(LEDGER_FILE, "utf8").split("\n")) {
		if (!line) continue;
		try {
			const row = JSON.parse(line);
			bucket(row.key, row.ts, row.costMicro);
		} catch {}
	}

const nowMonth = () => new Date().toISOString().slice(0, 7);
const nowDay = () => new Date().toISOString().slice(0, 10);
const spentThisMonth = (key) => keyMonth[key]?.[nowMonth()] ?? 0;

// The tripwires watch at record time AND at boot — a gateway waking into an
// already-breached line says so instead of resting silently.
function checkTripwires(day, month) {
	if ((globalDay[day] ?? 0) >= ALARM_DAY_MICRO)
		ping(`alarm:${day}`, `Daily spend crossed the alarm line: ${((globalDay[day] ?? 0) / 1e6).toFixed(2)} USD on ${day} (line: ${(ALARM_DAY_MICRO / 1e6).toFixed(2)}). The lane keeps running.`);
	if ((globalMonth[month] ?? 0) >= KILL_MICRO)
		ping(`kill:${month}`, `THE KILL-SWITCH TRIPPED: ${((globalMonth[month] ?? 0) / 1e6).toFixed(2)} USD in ${month} (cap: ${(KILL_MICRO / 1e6).toFixed(2)}). The lane is stopped until next month or a raised cap.`);
}
checkTripwires(nowDay(), nowMonth());

function record(key, player, model, usage, side = false) {
	const cost = costMicro(model, usage);
	const ts = new Date().toISOString();
	bucket(key, ts, cost);
	fs.appendFileSync(
		LEDGER_FILE,
		JSON.stringify({ ts, key, player, model, usage, costMicro: cost, ...(side ? { side: true } : {}) }) + "\n",
	);
	checkTripwires(ts.slice(0, 10), ts.slice(0, 7));
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
		const month = nowMonth();
		const day = nowDay();
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: true,
				month,
				globalMonthMicro: globalMonth[month] ?? 0,
				killMicro: KILL_MICRO,
				globalDayMicro: globalDay[day] ?? 0,
				alarmDayMicro: ALARM_DAY_MICRO,
				keys: Object.fromEntries(
					Object.entries(keys).map(([k, v]) => [
						k,
						{
							player: v.player,
							budgetMicro: v.budgetMicro,
							spentMicro: spentMicro[k] ?? 0,
							spentMonthMicro: keyMonth[k]?.[month] ?? 0,
						},
					]),
				),
			}),
		);
		return;
	}

	// The strip's window (08's status-strip law, map item 4): a friend asks
	// with their OWN key and learns only their OWN grant — never the table.
	if (req.method === "GET" && req.url === "/grant") {
		const virtual = req.headers["x-api-key"];
		const grant = typeof virtual === "string" ? readKeys()[virtual] : undefined;
		if (!grant) {
			refuse(res, 401, "unknown key — this door is not yours");
			return;
		}
		const spent = spentThisMonth(virtual);
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				player: grant.player,
				month: nowMonth(),
				budgetMicro: grant.budgetMicro,
				spentMicro: spent,
				remainingMicro: Math.max(0, grant.budgetMicro - spent),
				laneOpen: (globalMonth[nowMonth()] ?? 0) < KILL_MICRO,
			}),
		);
		return;
	}
	// Side calls (gmchat's GM table, chronicler, fate planner, judges,
	// crafting) arrive under the /side prefix — same lane, same caps and
	// tripwires, but their ledger rows are TAGGED: side spend never lands in
	// pi's own cost stamps, and reconcile subtracts tagged rows before
	// comparing the two meters (the 2026-08-09 ruling on roadmap 09's
	// house-lane question).
	const side = req.url.startsWith("/side/");
	const url = side ? req.url.slice("/side".length) : req.url;
	if (req.method !== "POST" || !url.startsWith("/v1/messages")) {
		refuse(res, 404, "the house gateway speaks only POST /v1/messages");
		return;
	}

	const virtual = req.headers["x-api-key"];
	const grant = typeof virtual === "string" ? readKeys()[virtual] : undefined;
	if (!grant) {
		refuse(res, 401, "unknown key — this door is not yours");
		return;
	}
	if ((globalMonth[nowMonth()] ?? 0) >= KILL_MICRO) {
		refuse(res, 400, "The house rests this month — the lane reopens with the new month.");
		return;
	}
	if (spentThisMonth(virtual) >= grant.budgetMicro) {
		ping(
			`grant:${virtual}:${nowMonth()}`,
			`${grant.player}'s grant is spent for ${nowMonth()} (${(grant.budgetMicro / 1e6).toFixed(2)} USD). Their keeper rests until a top-up.`,
		);
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
				if (msg.usage) record(virtual, grant.player, model, msg.usage, side);
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
	if (upstream.ok && usage.input_tokens != null) record(virtual, grant.player, model, usage, side);
});

server.listen(PORT, BIND, () => {
	console.log(`gateway: listening on ${BIND}:${PORT} → ${UPSTREAM}`);
	console.log(`gateway: keys from ${KEYS_FILE}, ledger at ${LEDGER_FILE}`);
});
