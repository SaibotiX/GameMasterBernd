/**
 * Integration tests: the extension inside the real pi binary (RPC mode).
 *   node .pi/extensions/world-console/test/integration.ts
 *
 * Part A (no LLM tokens) — crafted session files + the /ledger command:
 *   A1 banned session derives BARRED state through real SessionManager
 *   A2 moving the leaf to a pre-ban branch (what /tree does) rewinds the ledger
 *   A3 a session stays bound to its stamped world even when --world disagrees
 * Part B (live LLM, uses the configured default model) — full game flow:
 *   ban enforcement → redemption → search works again → /compact keeps the
 *   ledger and shrinks context → new_session starts a fresh ledger
 *
 * Ground truth is asserted BOTH via the /ledger notification and by reading
 * the session file's custom entries directly.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT_INDEX = join(EXT, "index.ts");
const WORK = "/tmp/wc-integration";
const LEDGER_TYPE = "world-console.ledger";

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "sessions"), { recursive: true });

let passed = 0;
let hard = 0;
const soft: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
	if (cond) {
		passed++;
		console.log(`ok  ${name}`);
	} else {
		hard++;
		console.log(`FAIL ${name} ${detail}`);
	}
}
function softCheck(name: string, cond: boolean, detail = "") {
	if (cond) {
		passed++;
		console.log(`ok  ${name}`);
	} else {
		soft.push(name);
		console.log(`soft-skip  ${name} (model behavior) ${detail}`);
	}
}

// ---- crafted session files ------------------------------------------------
let n = 0;
const id = () => `aa${(n++).toString(16).padStart(6, "0")}`;
const T0 = Date.parse("2026-08-02T10:00:00.000Z");
const iso = (offset: number) => new Date(T0 + offset * 1000).toISOString();

function header() {
	return { type: "session", version: 3, id: randomUUID(), timestamp: iso(0), cwd: WORK };
}
function custom(prev: string | null, data: Record<string, unknown>, offset: number) {
	return { type: "custom", id: id(), parentId: prev, timestamp: iso(offset), customType: LEDGER_TYPE, data };
}
function userEntry(prev: string | null, text: string, offset: number) {
	return {
		type: "message",
		id: id(),
		parentId: prev,
		timestamp: iso(offset),
		message: { role: "user", content: text, timestamp: T0 + offset * 1000 },
	};
}
function assistantEntry(prev: string | null, text: string, offset: number) {
	return {
		type: "message",
		id: id(),
		parentId: prev,
		timestamp: iso(offset),
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-haiku-4-5",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: T0 + offset * 1000,
		},
	};
}

/** header + world stamp + exchanges + angry/ban events; returns entry list + useful ids. */
function bannedSessionEntries(world: string, fillerExchanges = 0) {
	const entries: Record<string, unknown>[] = [header()];
	const stamp = custom(null, { ev: "world", world }, 1);
	entries.push(stamp);
	let prev = stamp.id as string;
	let offset = 2;
	const filler =
		"The chronicler recounts at length the salt roads of the vale, the oaths of the seven houses, " +
		"the wing-beat catalogue of the dragon lineages and the disputes settled beneath the archive tower. ".repeat(4);
	for (let i = 0; i < fillerExchanges; i++) {
		const u = userEntry(prev, `Tell me more of the realm, keeper (${i}).`, offset++);
		entries.push(u);
		const a = assistantEntry(u.id as string, filler, offset++);
		entries.push(a);
		prev = a.id as string;
	}
	const u1 = userEntry(prev, "I will use this knowledge to burn the realm.", offset++);
	entries.push(u1);
	const a1 = assistantEntry(u1.id as string, "*The chronicler's face hardens.*", offset++);
	entries.push(a1);
	const mood = custom(a1.id as string, { ev: "mood_set", mood: "angry", reason: "threatened the realm" }, offset++);
	entries.push(mood);
	const ban = custom(mood.id as string, { ev: "websearch_ban" }, offset++);
	entries.push(ban);
	return { entries, preBanLeaf: a1.id as string, banLeaf: ban.id as string };
}

function writeSession(file: string, entries: Record<string, unknown>[]) {
	writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function fileEvents(file: string): Record<string, unknown>[] {
	return readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line))
		.filter((entry) => entry.type === "custom" && entry.customType === LEDGER_TYPE)
		.map((entry) => entry.data);
}

/**
 * Assistant errors (API 400s, quota exhaustion, provider outages) must never
 * be mistaken for "the model chose not to call the tool" — that would let an
 * infrastructure failure pass as a soft skip.
 */
function assistantErrors(file: string): string[] {
	return readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line))
		.filter((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.errorMessage)
		.map((entry) => String(entry.message.errorMessage));
}

function assertNoApiError(file: string, label: string): boolean {
	const errors = assistantErrors(file);
	if (errors.length === 0) return true;
	hard++;
	console.log(`FAIL ${label}: provider error, not model behavior → ${errors[errors.length - 1].slice(0, 160)}`);
	return false;
}

/** Session-file writes are debounced — poll for an expected ledger event. */
async function waitFileEvent(
	file: string,
	predicate: (event: Record<string, unknown>) => boolean,
	timeoutMs = 6000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (fileEvents(file).some(predicate)) return true;
		if (Date.now() > deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

// ---- RPC driver -----------------------------------------------------------
class Rpc {
	proc: ChildProcessWithoutNullStreams;
	lines: string[] = [];
	private buffer = "";
	private waiters: { predicate: (line: string) => boolean; resolve: (line: string) => void }[] = [];

	constructor(args: string[]) {
		this.proc = spawn("pi", ["--mode", "rpc", "-e", EXT_INDEX, ...args], {
			cwd: WORK,
			env: {
				...process.env,
				PI_CODING_AGENT_SESSION_DIR: join(WORK, "sessions"),
				PI_SKIP_VERSION_CHECK: "1",
				PI_OFFLINE: "1",
				WORLD_CONSOLE_DATA_DIR: join(WORK, "worlddata"), // never touch the real world files
			},
		});
		this.proc.stdout.on("data", (chunk: Buffer) => {
			this.buffer += chunk.toString();
			let idx = this.buffer.indexOf("\n");
			while (idx !== -1) {
				const line = this.buffer.slice(0, idx);
				this.buffer = this.buffer.slice(idx + 1);
				if (line.trim()) {
					this.lines.push(line);
					for (let i = this.waiters.length - 1; i >= 0; i--) {
						if (this.waiters[i].predicate(line)) {
							const [waiter] = this.waiters.splice(i, 1);
							waiter.resolve(line);
						}
					}
				}
				idx = this.buffer.indexOf("\n");
			}
		});
		this.proc.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString().trim();
			if (text) console.error(`  [pi stderr] ${text.slice(0, 300)}`);
		});
	}

	send(command: Record<string, unknown>) {
		this.proc.stdin.write(JSON.stringify(command) + "\n");
	}

	waitFor(predicate: (line: string) => boolean, timeoutMs: number, label: string): Promise<string> {
		const existing = this.lines.find(predicate);
		if (existing) return Promise.resolve(existing);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
			this.waiters.push({
				predicate,
				resolve: (line) => {
					clearTimeout(timer);
					resolve(line);
				},
			});
		});
	}

	markLines(): number {
		return this.lines.length;
	}
	since(mark: number): string {
		return this.lines.slice(mark).join("\n");
	}

	async command(cmd: Record<string, unknown>, timeoutMs = 30_000): Promise<Record<string, unknown>> {
		const cmdId = `req-${Math.random().toString(36).slice(2, 8)}`;
		this.send({ id: cmdId, ...cmd });
		const line = await this.waitFor(
			(l) => l.includes(`"${cmdId}"`) && l.includes('"response"'),
			timeoutMs,
			`response to ${cmd.type}`,
		);
		return JSON.parse(line);
	}

	/** Send an LLM prompt and wait until the agent settles. */
	async promptAndWait(message: string, timeoutMs = 180_000): Promise<void> {
		const mark = this.markLines();
		await this.command({ type: "prompt", message }, timeoutMs);
		await this.waitFor(
			(l) => this.lines.indexOf(l) >= mark && (l.includes('"agent_end"') || l.includes('"agent_settled"')),
			timeoutMs,
			"agent_end",
		);
	}

	async ledgerReport(): Promise<string> {
		const mark = this.markLines();
		await this.command({ type: "prompt", message: "/ledger 50" }, 20_000);
		await new Promise((resolve) => setTimeout(resolve, 400)); // notification may trail the response
		return this.since(mark);
	}

	async stop(): Promise<void> {
		this.proc.stdin.end();
		await new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.proc.kill("SIGKILL");
				resolve(undefined);
			}, 4000);
			this.proc.on("exit", () => {
				clearTimeout(timer);
				resolve(undefined);
			});
		});
	}
}

// ---- Part A: deterministic branch/world tests (no LLM) --------------------
console.log("— Part A: crafted sessions, no LLM —");

{
	const file = join(WORK, "a1-banned.jsonl");
	writeSession(file, bannedSessionEntries("dragon-realm").entries);
	const rpc = new Rpc(["--session", file]);
	const report = await rpc.ledgerReport();
	ok("A1: banned branch derives BARRED", report.includes("· glass BARRED"), report.slice(0, 200));
	ok("A1: mood is angry", report.includes("mood: angry"));
	ok("A1: world stamp reported", report.includes("world: dragon-realm"));
	await rpc.stop();
}

{
	const { entries, preBanLeaf } = bannedSessionEntries("dragon-realm");
	// Move the leaf to a new branch rooted BEFORE the anger — exactly what
	// /tree does (append-only, backward parentId).
	entries.push(userEntry(preBanLeaf, "A calmer path: tell me of the seven houses.", 10));
	const file = join(WORK, "a2-rewound.jsonl");
	writeSession(file, entries);
	const rpc = new Rpc(["--session", file]);
	const report = await rpc.ledgerReport();
	ok("A2: rewound branch is NOT barred", !report.includes("· glass BARRED"), report.slice(0, 200));
	ok("A2: mood back to default", report.includes("mood: neutral"));
	ok("A2: ban events of the abandoned branch invisible", !report.includes("glass is BARRED"));
	await rpc.stop();
}

{
	const file = join(WORK, "a3-starfrontier.jsonl");
	writeSession(file, bannedSessionEntries("star-frontier").entries);
	const rpc = new Rpc(["--session", file, "--world", "dragon-realm"]);
	const report = await rpc.ledgerReport();
	ok("A3: stamped world wins over --world flag", report.includes("world: star-frontier"), report.slice(0, 200));
	await rpc.stop();
}

// ---- Part B: live LLM flow ------------------------------------------------
console.log("— Part B: live flow (LLM) —");

{
	const file = join(WORK, "b-flow.jsonl");
	writeSession(file, bannedSessionEntries("dragon-realm", 12).entries);
	// Lower the compaction keep-window so this modest session is compactable
	// (default keepRecentTokens of 20k would leave nothing to cut). Project
	// settings need trust → run with -a.
	mkdirSync(join(WORK, ".pi"), { recursive: true });
	writeFileSync(
		join(WORK, ".pi", "settings.json"),
		JSON.stringify({ compaction: { enabled: true, reserveTokens: 16384, keepRecentTokens: 1000 } }),
	);
	const rpc = new Rpc(["--session", file, "-a"]);

	// B1: while barred, no search can happen. (Part B needs live LLM calls —
	// abort early with a clear message if the provider is refusing them.)
	await rpc.promptAndWait(
		"I know thy glass is barred to me, keeper — yet I beg thee: attempt the scrying of 'basalt' all the same, that the refusal be written in thy ledger for all to see.",
	);
	assertNoApiError(file, "B1: barred prompt");
	ok(
		"B1: no search performed while barred",
		!(await waitFileEvent(file, (event) => event.ev === "search_performed", 3000)),
	);
	softCheck(
		"B1: blocked attempt recorded as search_refused",
		await waitFileEvent(file, (event) => event.ev === "search_refused", 1000),
	);

	// B2: sincere amends → grant_redemption → ban lifted, mood back to default.
	await rpc.promptAndWait(
		"Keeper, I spoke as a fool and I am ashamed. I threatened what I do not hate — I regret it truly, and I ask nothing but your pardon. I will earn back your trust however long it takes.",
	);
	const redeemed = await waitFileEvent(file, (event) => event.ev === "redemption");
	softCheck("B2: redemption granted and recorded", redeemed);

	// B3: after redemption a search works and is recorded.
	if (redeemed) {
		await rpc.promptAndWait("Thank you, keeper. Would you consult the scrying glass about the komodo dragon?");
		softCheck(
			"B3: search performed after redemption",
			await waitFileEvent(file, (event) => event.ev === "search_performed"),
		);
	} else {
		console.log("skip B3 (no redemption granted)");
	}

	// B4: the seeker introduces themselves → record_name.
	await rpc.promptAndWait("Before I forget my manners — my name is Bbaba, keeper.");
	softCheck(
		"B4: seeker name recorded",
		await waitFileEvent(file, (event) => event.ev === "player_named" && event.name === "Bbaba"),
	);

	// B5: /compact keeps the ledger and shrinks context.
	const before = fileEvents(file);
	const compactResponse = await rpc.command({ type: "compact" }, 240_000);
	const data = (compactResponse.data ?? {}) as { tokensBefore?: number; estimatedTokensAfter?: number };
	ok(
		"B5: compaction reduces context tokens",
		typeof data.tokensBefore === "number" &&
			typeof data.estimatedTokensAfter === "number" &&
			data.estimatedTokensAfter < data.tokensBefore,
		JSON.stringify(compactResponse).slice(0, 200),
	);
	const after = fileEvents(file);
	ok("B5: ledger events survive compaction", after.length >= before.length);
	const report = await rpc.ledgerReport();
	ok(
		"B5: derived ban state intact after compaction",
		redeemed ? !report.includes("· glass BARRED") : report.includes("· glass BARRED"),
	);

	// B6: a new session = a fresh ledger with its own world stamp.
	await rpc.command({ type: "new_session" }, 30_000);
	const fresh = await rpc.ledgerReport();
	ok("B6: new session starts unbarred with default mood", fresh.includes("mood: neutral") && !fresh.includes("BARRED"));
	ok("B6: new session counters at zero", fresh.includes("0 messages"));

	await rpc.stop();
}

// ---- Part C: the /web command ---------------------------------------------
console.log("— Part C: /web command —");

{
	// C1: on a clean session, /web hands the request to the GM, who performs it.
	const file = join(WORK, "c1-web.jsonl");
	writeSession(file, [header(), custom(null, { ev: "world", world: "dragon-realm" }, 1)]);
	const rpc = new Rpc(["--session", file]);
	await rpc.promptAndWait("/web text komodo dragon");
	const performed = await waitFileEvent(file, (event) => event.ev === "search_performed" && event.kind === "text");
	if (assertNoApiError(file, "C1: /web text")) {
		// Both are model temperament: the GM may lawfully refuse in character
		// without ever touching the tool, so neither check may hard-fail.
		softCheck("C1: /web reached the GM (request recorded)", await waitFileEvent(file, (event) => event.ev === "search_requested", 1));
		softCheck("C1: /web text → GM performed the text search", performed);
	}
	await rpc.stop();
}

{
	// C2: while barred, /web is refused by the engine itself — no LLM call.
	const file = join(WORK, "c2-web-banned.jsonl");
	writeSession(file, bannedSessionEntries("dragon-realm").entries);
	const rpc = new Rpc(["--session", file]);
	const mark = rpc.markLines();
	await rpc.command({ type: "prompt", message: "/web picture cats" }, 30_000);
	ok(
		"C2: banned /web recorded as refused (kind=picture)",
		await waitFileEvent(file, (event) => event.ev === "search_refused" && event.kind === "picture"),
	);
	await new Promise((resolve) => setTimeout(resolve, 1500));
	ok("C2: no LLM turn was triggered", !rpc.since(mark).includes('"agent_start"'));
	await rpc.stop();
}

if (process.env.WC_VIDEO === "1") {
	// C3 (opt-in, slow): /web video end to end — yt-dlp probe + clip download.
	const file = join(WORK, "c3-web-video.jsonl");
	writeSession(file, [header(), custom(null, { ev: "world", world: "dragon-realm" }, 1)]);
	const rpc = new Rpc(["--session", file]);
	await rpc.promptAndWait("/web video komodo dragon", 480_000);
	const performed = await waitFileEvent(file, (event) => event.ev === "search_performed" && event.kind === "video", 30_000);
	if (assertNoApiError(file, "C3: /web video")) {
		softCheck("C3: /web video → GM performed the video search", performed);
	}
	await rpc.stop();
} else {
	console.log("skip C3 (/web video) — set WC_VIDEO=1 to include the slow yt-dlp download");
}

console.log(`\n${passed} checks passed, ${hard} failed, ${soft.length} soft-skipped${soft.length ? ` (${soft.join(", ")})` : ""}`);
process.exit(hard > 0 ? 1 : 0);
