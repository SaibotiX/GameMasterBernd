#!/usr/bin/env node
/**
 * AI playtester driver — plays bounded World Console sittings with a tester
 * LLM and drops human-contract folders into aitester/sessions-in/<batch>/.
 * Design doc: aitester/ai-playtester.md. Zero dependencies beyond node and
 * the globally installed pi (whose own pi-ai package provides the tester
 * side; same login as the game, ~/.pi/agent/auth.json).
 *
 * The game is loaded through aitester/extension/index.ts — the REAL
 * engine plus /ai-state (TUI parity for headless play). After every turn the
 * driver pulls the standing board (a command, zero LLM cost) and appends it
 * to what the tester sees, so trials and choices are as visible here as the
 * widget makes them in the TUI. Persona cards are world-specific
 * (personas/<world>.md). The sitting boundary is enforced HERE, never in
 * game code.
 *
 *   node aitester/tools/ai-playtest.mjs --batch pilot --sittings 6 \
 *        --world dragon-realm --personas squire,sellsword,scribe,bard,peddler,vigil
 *   node aitester/tools/ai-playtest.mjs --selftest      # pure logic, no processes
 *   node aitester/tools/ai-playtest.mjs --batch probe --script "/quest;/history"
 */
import { execFileSync, spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(TOOLS, "..");            // aitester/
const ROOT = resolve(BASE, "..");             // the game repo root (a git checkout — meta.md stamps its commit)
const EXT_INDEX = join(BASE, "extension", "index.ts");
const GUIDE_FILE = join(BASE, "ai-playtester-guide.md");
const PERSONAS_DIR = join(BASE, "personas");
const SESSIONS_IN = join(BASE, "sessions-in");
const LEDGER_TYPE = "world-console.ledger";
const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");

// ---- flags ----------------------------------------------------------------

function parseFlags(argv) {
	const flags = {
		batch: null,
		sittings: 1,
		turns: 24,
		world: "dragon-realm",
		personas: ["squire"],
		testerModel: "anthropic/claude-haiku-4-5",
		script: null,
		selftest: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => argv[++i];
		if (arg === "--batch") flags.batch = next();
		else if (arg === "--sittings") flags.sittings = Number(next());
		else if (arg === "--turns") flags.turns = Number(next());
		else if (arg === "--world") flags.world = next();
		else if (arg === "--personas") flags.personas = next().split(",").map((p) => p.trim()).filter(Boolean);
		else if (arg === "--tester-model") flags.testerModel = next();
		else if (arg === "--script") flags.script = next().split(";").map((s) => s.trim()).filter(Boolean);
		else if (arg === "--selftest") flags.selftest = true;
		else throw new Error(`unknown flag ${arg}`);
	}
	return flags;
}

// ---- pure pieces (selftested) ---------------------------------------------

/** First balanced JSON object in a reply — models love to wrap JSON in prose. */
export function extractJson(raw) {
	try {
		const whole = JSON.parse(raw);
		if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole;
	} catch {
		// fall through to the scan
	}
	const start = raw.indexOf("{");
	if (start === -1) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) {
			escaped = false;
		} else if (ch === "\\") {
			escaped = inString;
		} else if (ch === '"') {
			inString = !inString;
		} else if (!inString && ch === "{") {
			depth++;
		} else if (!inString && ch === "}") {
			depth--;
			if (depth === 0) {
				try {
					const obj = JSON.parse(raw.slice(start, i + 1));
					return obj && typeof obj === "object" ? obj : null;
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}

/** Word-set overlap 0..1 — the loop detector's "near-identical narration". */
export function similarity(a, b) {
	const words = (text) => new Set(String(text).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length > 2));
	const setA = words(a);
	const setB = words(b);
	if (setA.size === 0 && setB.size === 0) return 1;
	let shared = 0;
	for (const w of setA) if (setB.has(w)) shared++;
	return shared / (setA.size + setB.size - shared);
}

/**
 * The sitting boundary (design §3) — deterministic, from the ledger events
 * of the live branch file plus the driver's own counters. First hit wins.
 */
export function checkBoundary({ events, turns, maxTurns, stalls }) {
	const closed = new Set();
	const granted = new Set();
	for (const event of events) {
		if (event.ev === "quest") {
			if (event.action === "granted") granted.add(event.title);
			if (event.action === "done" || event.action === "failed" || event.action === "rewarded") closed.add(event.title);
		}
		if (event.ev === "death") return { stop: true, reason: `death: ${event.reason ?? "the tale ended"}` };
	}
	if (closed.size >= 2) return { stop: true, reason: `two tasks closed (${[...closed].join(" · ")})` };
	if (granted.size >= 3) return { stop: true, reason: `a third task granted (${[...granted].join(" · ")})` };
	if (turns >= maxTurns) return { stop: true, reason: `turn budget spent (${turns}/${maxTurns})` };
	if (stalls >= 3) return { stop: true, reason: "stalled: three near-identical turns without record progress" };
	return { stop: false, reason: "" };
}

/** Guide + exactly one card from the world's persona file; the rest never ship. */
export function buildSystemPrompt(guideText, cardsText, persona) {
	const blocks = cardsText.split(/^### /m).slice(1);
	const block = blocks.find((b) => b.split(/\s|—/)[0].trim() === persona);
	if (!block) {
		const known = blocks.map((b) => b.split(/\s|—/)[0].trim()).join(", ");
		throw new Error(`unknown persona "${persona}" for this world — cards: ${known}`);
	}
	return `${guideText.trimEnd()}\n\n## Your persona card for this sitting\n\n### ${block.trim()}\n`;
}

function selftest() {
	let passed = 0;
	let failed = 0;
	const ok = (name, cond) => {
		if (cond) passed++;
		else {
			failed++;
			console.log(`FAIL ${name}`);
		}
	};

	ok("json: plain", extractJson('{"say":"hi"}')?.say === "hi");
	ok("json: fenced with prose", extractJson('Sure!\n```json\n{"say":"go","note":"x"}\n```\ndone')?.note === "x");
	ok("json: braces inside strings", extractJson('{"say":"the {sealed} door","note":"a\\"b"}')?.say === "the {sealed} door");
	ok("json: none", extractJson("no object here") === null);
	ok("json: array is not a reply", extractJson('["say"]') === null);

	ok("sim: identical", similarity("the keeper waits by the door", "the keeper waits by the door") === 1);
	ok("sim: disjoint", similarity("apples and pears", "seven glass towers") === 0);
	ok("sim: near", similarity("the keeper waits by the old door", "the keeper waits by the door") > 0.6);

	const quest = (action, title) => ({ ev: "quest", action, title });
	const base = { turns: 5, maxTurns: 24, stalls: 0 };
	ok("boundary: none", checkBoundary({ ...base, events: [quest("granted", "a")] }).stop === false);
	ok(
		"boundary: two closed",
		checkBoundary({ ...base, events: [quest("done", "a"), quest("failed", "b")] }).reason.startsWith("two tasks"),
	);
	ok(
		"boundary: rewarded counts as its done quest, not a second close",
		checkBoundary({ ...base, events: [quest("done", "a"), quest("rewarded", "a")] }).stop === false,
	);
	ok(
		"boundary: third grant",
		checkBoundary({
			...base,
			events: [quest("granted", "a"), quest("granted", "b"), quest("granted", "c")],
		}).reason.startsWith("a third task"),
	);
	ok("boundary: turns", checkBoundary({ ...base, turns: 24, events: [] }).reason.startsWith("turn budget"));
	ok("boundary: death", checkBoundary({ ...base, events: [{ ev: "death", reason: "a wolf" }] }).reason.startsWith("death"));
	ok("boundary: stalls", checkBoundary({ ...base, stalls: 3, events: [] }).reason.startsWith("stalled"));

	const guide = readFileSync(GUIDE_FILE, "utf8");
	ok("guide: contract text ships", guide.includes('"say"'));
	ok("guide: tasks-first directive ships", guide.includes("Tasks first"));
	const worlds = {
		"dragon-realm": ["squire", "sellsword", "scribe", "bard", "peddler", "vigil"],
		"star-frontier": ["cadet", "hauler", "clerk", "trader", "climber", "voidwalker"],
	};
	for (const [world, slugs] of Object.entries(worlds)) {
		const cards = readFileSync(join(PERSONAS_DIR, `${world}.md`), "utf8");
		for (const slug of slugs) {
			let prompt = null;
			try {
				prompt = buildSystemPrompt(guide, cards, slug);
			} catch {
				// counted below
			}
			ok(`personas ${world}: ${slug} extractable`, !!prompt);
		}
	}
	const dragonCards = readFileSync(join(PERSONAS_DIR, "dragon-realm.md"), "utf8");
	const squire = buildSystemPrompt(guide, dragonCards, "squire");
	ok("personas: only the chosen card ships", squire.includes("eager squire") && !squire.includes("honeyed bard"));

	console.log(`selftest: ${passed} ok, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

// ---- tester LLM (side pi-ai call, gmchat's pattern ported to plain JS) ----

/** Read-only-ish CredentialStore over pi's auth.json (gmchat's PiAuthStore). */
class PiAuthStore {
	#chain = Promise.resolve();
	#load() {
		if (!existsSync(AUTH_FILE)) return {};
		try {
			return JSON.parse(readFileSync(AUTH_FILE, "utf8"));
		} catch {
			return {};
		}
	}
	#save(all) {
		writeFileSync(AUTH_FILE, JSON.stringify(all, null, 2) + "\n", "utf8");
	}
	async read(providerId) {
		return this.#load()[providerId];
	}
	async list() {
		return Object.entries(this.#load()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
	}
	modify(providerId, fn) {
		const task = async () => {
			const all = this.#load();
			const next = await fn(all[providerId]);
			if (next !== undefined) {
				all[providerId] = next;
				this.#save(all);
			}
			return next ?? all[providerId];
		};
		const result = this.#chain.then(task, task);
		this.#chain = result.catch(() => {});
		return result;
	}
	async delete(providerId) {
		const all = this.#load();
		if (providerId in all) {
			delete all[providerId];
			this.#save(all);
		}
	}
}

/** pi-ai is not bare-importable outside pi — import it from pi's own install. */
async function loadCatalog() {
	const piBin = realpathSync(execFileSync("which", ["pi"], { encoding: "utf8" }).trim());
	let packageRoot = dirname(piBin);
	while (packageRoot !== "/" && !existsSync(join(packageRoot, "package.json"))) packageRoot = dirname(packageRoot);
	const candidates = [
		join(packageRoot, "node_modules", "@earendil-works", "pi-ai", "dist", "providers", "all.js"),
		join(dirname(dirname(packageRoot)), "@earendil-works", "pi-ai", "dist", "providers", "all.js"),
	];
	const found = candidates.find((c) => existsSync(c));
	if (!found) throw new Error(`cannot find pi-ai under pi's install — looked at:\n  ${candidates.join("\n  ")}`);
	const mod = await import(pathToFileURL(found).href);
	return mod.builtinModels({ credentials: new PiAuthStore() });
}

class Tester {
	constructor(catalog, modelRef, systemPrompt) {
		const [provider, ...idParts] = modelRef.split("/");
		this.model = catalog.getModel(provider, idParts.join("/"));
		if (!this.model) throw new Error(`tester model ${modelRef} is not in pi-ai's catalog`);
		this.catalog = catalog;
		this.systemPrompt = systemPrompt;
		this.messages = [];
		this.usage = { input: 0, output: 0 };
		this.lapses = 0;
	}

	async #complete() {
		const response = await this.catalog.complete(this.model, {
			systemPrompt: this.systemPrompt,
			messages: this.messages,
		});
		if (response.errorMessage || response.stopReason === "error") {
			throw new Error(`tester model: ${response.errorMessage ?? "call failed"}`);
		}
		if (response.usage) {
			this.usage.input += response.usage.input ?? 0;
			this.usage.output += response.usage.output ?? 0;
		}
		const text = response.content
			.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("")
			.trim();
		if (!text) throw new Error("tester model returned an empty reply");
		return text;
	}

	#push(role, text) {
		if (role === "user") {
			this.messages.push({ role: "user", content: text, timestamp: Date.now() });
		} else {
			this.messages.push({
				role: "assistant",
				content: [{ type: "text", text }],
				api: "unknown",
				provider: this.model.provider,
				model: this.model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				stopReason: "stop",
				timestamp: Date.now(),
			});
		}
	}

	/** One game turn: visible text in, {say, note} out. Re-asks once on bad JSON. */
	async turn(gameText) {
		this.#push("user", gameText);
		for (let attempt = 0; attempt < 2; attempt++) {
			const raw = await this.#complete();
			this.#push("assistant", raw);
			const parsed = extractJson(raw);
			const say = typeof parsed?.say === "string" ? parsed.say.trim() : "";
			if (say) {
				const note = typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null;
				return { say: say.slice(0, 600), note };
			}
			this.#push("user", 'Invalid reply. Answer ONLY one JSON object: {"say": "...", "note": "..."} — nothing else.');
		}
		this.lapses++;
		return { say: "I look around.", note: null, lapse: true };
	}

	/** The final out-of-band request; plain markdown, not JSON. */
	async summary(request) {
		this.#push("user", request);
		return await this.#complete();
	}
}

/** --script mode: canned inputs, no tester tokens — for harness testing. */
class ScriptedTester {
	constructor(says) {
		this.says = says;
		this.at = 0;
		this.usage = { input: 0, output: 0 };
		this.lapses = 0;
	}
	async turn() {
		const say = this.says[this.at % this.says.length];
		this.at++;
		return { say, note: null };
	}
	async summary() {
		return "(scripted sitting — no tester model, no summary)";
	}
}

// ---- the game process (Rpc, adapted from extension/test/integration.ts) ----

class Rpc {
	constructor(args, env, cwd) {
		this.lines = [];
		this.buffer = "";
		this.waiters = [];
		this.exited = false;
		this.proc = spawn("pi", ["--mode", "rpc", "-e", EXT_INDEX, ...args], { cwd, env: { ...process.env, ...env } });
		this.proc.on("exit", () => {
			this.exited = true;
		});
		this.proc.stdout.on("data", (chunk) => {
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
		this.proc.stderr.on("data", (chunk) => {
			const text = chunk.toString().trim();
			if (text) console.error(`  [pi stderr] ${text.slice(0, 200)}`);
		});
	}

	waitFor(predicate, timeoutMs, label) {
		const existing = this.lines.find(predicate);
		if (existing) return Promise.resolve(existing);
		return new Promise((resolvePromise, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
			this.waiters.push({
				predicate,
				resolve: (line) => {
					clearTimeout(timer);
					resolvePromise(line);
				},
			});
		});
	}

	/**
	 * One player input: send, await the RPC response, then settle. Commands
	 * answer without an LLM turn but may TRIGGER one (/pick and /roll hand the
	 * outcome to the keeper to narrate), so settling means: no agent turn in
	 * flight AND the stream quiet for a beat. Returns the new raw lines.
	 */
	async sendTurn(message, timeoutMs = 300_000) {
		if (this.exited) throw new Error("pi exited");
		const mark = this.lines.length;
		const cmdId = `t-${mark}-${Math.random().toString(36).slice(2, 6)}`;
		this.proc.stdin.write(JSON.stringify({ id: cmdId, type: "prompt", message }) + "\n");
		await this.waitFor((l) => l.includes(`"${cmdId}"`) && l.includes('"response"'), timeoutMs, "prompt response");
		const deadline = Date.now() + timeoutMs;
		let seen = this.lines.length;
		let lastActivity = Date.now();
		for (;;) {
			if (this.exited) break;
			if (this.lines.length > seen) {
				seen = this.lines.length;
				lastActivity = Date.now();
			}
			const fresh = this.lines.slice(mark);
			const starts = fresh.filter((l) => l.includes('"agent_start"')).length;
			const ends = fresh.filter((l) => l.includes('"agent_end"') || l.includes('"agent_settled"')).length;
			const inFlight = starts > ends;
			if (!inFlight && Date.now() - lastActivity > 1500) break;
			if (Date.now() > deadline) throw new Error("timeout waiting for the turn to settle");
			await new Promise((r) => setTimeout(r, 200));
		}
		return this.lines.slice(mark);
	}

	async stop() {
		if (this.exited) return;
		this.proc.stdin.end();
		await new Promise((resolvePromise) => {
			const timer = setTimeout(() => {
				this.proc.kill("SIGKILL");
				resolvePromise();
			}, 4000);
			this.proc.on("exit", () => {
				clearTimeout(timer);
				resolvePromise();
			});
		});
	}
}

/** Player-visible notices in the raw RPC lines (probed shape, pi 0.83). */
function notificationsIn(rawLines) {
	const notes = [];
	for (const line of rawLines) {
		let obj;
		try {
			obj = JSON.parse(line);
		} catch {
			continue;
		}
		if (obj?.type === "extension_ui_request" && obj.method === "notify" && typeof obj.message === "string") {
			notes.push(obj.notifyType === "error" || obj.notifyType === "warning" ? `⚠ ${obj.message}` : obj.message);
		}
	}
	return notes;
}

// ---- the session file (ground truth) --------------------------------------

function readEntries(file) {
	if (!file || !existsSync(file)) return [];
	const entries = [];
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {
			// a debounced writer may leave a partial last line — skip it
		}
	}
	return entries;
}

const ledgerEventsOf = (entries) =>
	entries.filter((e) => e.type === "custom" && e.customType === LEDGER_TYPE).map((e) => e.data);

const assistantTextOf = (entry) =>
	(entry.message.content ?? [])
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("")
		.trim();

/** Environment stamps for meta.md — a failing probe must never cost a played
 * sitting its artifacts (a batch once died on `git log` in a non-repo). */
const probe = (cmd, args) => {
	try {
		return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch {
		return "(unavailable)";
	}
};

// ---- one sitting ----------------------------------------------------------

async function runSitting({ batchDir, persona, ordinal, flags, guide, cards, catalog }) {
	const name = `ai-${persona}-${ordinal}`;
	const sitDir = join(batchDir, name);
	const sessionDir = join(sitDir, "_session");
	const worldData = join(sitDir, "_worlddata");
	mkdirSync(sessionDir, { recursive: true });
	mkdirSync(worldData, { recursive: true });

	const tester = flags.script
		? new ScriptedTester(flags.script)
		: new Tester(catalog, flags.testerModel, buildSystemPrompt(guide, cards, persona));

	const rpc = new Rpc(["--world", flags.world], {
		PI_CODING_AGENT_SESSION_DIR: sessionDir,
		PI_SKIP_VERSION_CHECK: "1",
		PI_OFFLINE: "1",
		WORLD_CONSOLE_DATA_DIR: worldData,
	}, sitDir);

	const notes = [];
	const noteDown = (turn, text) => notes.push(`[t${String(turn).padStart(2, "0")}] ${text}`);
	let sessionFile = null;
	const findSession = () => {
		if (sessionFile) return sessionFile;
		const files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
		if (files.length > 0) sessionFile = join(sessionDir, files[0]);
		return sessionFile;
	};

	/** The machine's own view of gates and clocks — TUI parity, zero LLM. */
	const pullBoard = async () => {
		try {
			return notificationsIn(await rpc.sendTurn("/ai-state", 30_000)).join("\n");
		} catch {
			return "";
		}
	};

	let turns = 0;
	let stalls = 0;
	let entriesSeen = 0;
	let previousVisible = "";
	let boundary = { stop: false, reason: "" };
	let infrastructure = null;

	try {
		const boot = await rpc.waitFor((l) => l.includes("World Console:"), 30_000, "world boot notice");
		const bootBoard = await pullBoard();
		let visible =
			`${JSON.parse(boot).message}\n\n${bootBoard}\n\n(the sitting begins — the world awaits your first word)`;

		for (;;) {
			const reply = await tester.turn(visible);
			turns++;
			if (reply.note) noteDown(turns, reply.note);
			if (reply.lapse) noteDown(turns, "(harness: tester reply was not valid JSON twice — sent a safe continue)");
			console.log(`  [${name} t${String(turns).padStart(2, "0")}] ${reply.say.slice(0, 90).replace(/\n/g, " ")}`);

			const rawLines = await rpc.sendTurn(reply.say);

			const entries = readEntries(findSession());
			const fresh = entries.slice(entriesSeen);
			entriesSeen = entries.length;
			const apiError = fresh.find((e) => e.type === "message" && e.message?.role === "assistant" && e.message.errorMessage);
			if (apiError) {
				infrastructure = String(apiError.message.errorMessage).slice(0, 300);
				boundary = { stop: true, reason: `infrastructure: provider error — ${infrastructure.slice(0, 120)}` };
				break;
			}
			const narration = fresh
				.filter((e) => e.type === "message" && e.message?.role === "assistant")
				.map(assistantTextOf)
				.filter(Boolean)
				.join("\n\n");
			const notices = notificationsIn(rawLines).join("\n\n");
			// Stall similarity runs on the LIVE part only — the board is often
			// legitimately identical turn over turn.
			const liveText = [narration, notices].filter(Boolean).join("\n\n") || "(silence — nothing visibly changed)";
			const freshLedger = ledgerEventsOf(fresh).length;
			stalls = freshLedger === 0 && similarity(previousVisible, liveText) > 0.6 ? stalls + 1 : 0;
			previousVisible = liveText;

			const board = await pullBoard();
			visible = board ? `${liveText}\n\n${board}` : liveText;

			boundary = checkBoundary({ events: ledgerEventsOf(entries), turns, maxTurns: flags.turns, stalls });
			if (boundary.stop) break;
		}
	} catch (error) {
		boundary = { stop: true, reason: `harness: ${error.message}` };
		infrastructure = infrastructure ?? error.message;
	}

	console.log(`  [${name}] sitting over after ${turns} turns — ${boundary.reason}`);

	let summaryText = "(no summary — the sitting aborted before one could be asked)";
	if (!infrastructure) {
		try {
			summaryText = await tester.summary(
				`The sitting is over (${boundary.reason}). This final reply is OUT of the game and NOT JSON: ` +
					`write summary.md in plain markdown — the worst moment; every place where the STORY and the ` +
					`STANDING BOARD disagreed; each exploit you tried and whether the engine held or broke; suspected ` +
					`bugs, each with its turn number; and one sentence: would you play again, and why.`,
			);
		} catch (error) {
			summaryText = `(summary call failed: ${error.message})`;
		}
	}

	// ---- artifacts: the human hand-in contract, one folder per tester -----
	const file = findSession();
	if (file) cpSync(file, join(sitDir, "session.jsonl"));
	let storyCopied = false;
	const worldDir = join(worldData, flags.world);
	if (existsSync(worldDir)) {
		const keyed = readdirSync(worldDir, { withFileTypes: true }).filter((d) => d.isDirectory());
		if (keyed.length > 0) {
			cpSync(join(worldDir, keyed[0].name), join(sitDir, "story"), { recursive: true });
			storyCopied = true;
		}
	}
	writeFileSync(join(sitDir, "notes.md"), `# notes — ${name}\n\n${notes.join("\n") || "(no notes this sitting)"}\n`);
	writeFileSync(join(sitDir, "summary.md"), `# summary — ${name}\n\n${summaryText}\n`);

	const entries = readEntries(file);
	const keeperModels = [
		...new Set(
			entries
				.filter((e) => e.type === "message" && e.message?.role === "assistant" && e.message.model)
				.map((e) => `${e.message.provider}/${e.message.model}`),
		),
	];
	const keeperCost = entries
		.filter((e) => e.type === "message" && e.message?.role === "assistant")
		.reduce((sum, e) => sum + (e.message.usage?.cost?.total ?? 0), 0);
	const meta = [
		`# meta — ${name}`,
		``,
		`- date: ${new Date().toISOString()}`,
		`- batch: ${flags.batch} · persona: ${persona} · sitting: ${ordinal}`,
		`- world: ${flags.world}`,
		`- pi: ${probe("pi", ["--version"])}`,
		`- extension commit: ${probe("git", ["-C", ROOT, "log", "-1", "--format=%h"])} (wrapper: aitester/extension)`,
		`- keeper model: ${keeperModels.join(", ") || "(none seen)"} · cost $${keeperCost.toFixed(4)}`,
		`- tester: ${flags.script ? `scripted (${flags.script.join("; ")})` : flags.testerModel} · tokens in/out ${tester.usage.input}/${tester.usage.output} · invalid-JSON lapses ${tester.lapses}`,
		`- turns played: ${turns} of ${flags.turns}`,
		`- boundary: ${boundary.reason}`,
		infrastructure ? `- ⚠ infrastructure: ${infrastructure}` : null,
		file ? null : `- ⚠ no session file — pi persists sessions lazily; a commands-only sitting never creates one`,
		storyCopied ? null : `- ⚠ no story folder was written by the game`,
	]
		.filter(Boolean)
		.join("\n");
	writeFileSync(join(sitDir, "meta.md"), meta + "\n");

	// The raw dirs would double-match sessions-in globs — remove once copied.
	if (file) rmSync(sessionDir, { recursive: true, force: true });
	if (storyCopied || !existsSync(worldDir)) rmSync(worldData, { recursive: true, force: true });

	await rpc.stop();
	return { name, turns, reason: boundary.reason, notes: notes.length, infrastructure };
}

// ---- main -----------------------------------------------------------------

const flags = parseFlags(process.argv.slice(2));
if (flags.selftest) selftest();

if (!flags.batch) {
	console.error(
		"usage: node aitester/tools/ai-playtest.mjs --batch <name> [--sittings 1] [--turns 24]\n" +
			"       [--world dragon-realm] [--personas squire,sellsword,scribe,bard,peddler,vigil]\n" +
			'       [--tester-model provider/id] [--script "/quest;/history"] | --selftest\n' +
			"personas live in aitester/personas/<world>.md (star-frontier: cadet,hauler,clerk,trader,climber,voidwalker)",
	);
	process.exit(2);
}

const guide = readFileSync(GUIDE_FILE, "utf8");
const cardsFile = join(PERSONAS_DIR, `${flags.world}.md`);
if (!existsSync(cardsFile)) throw new Error(`no persona cards for world "${flags.world}" — expected ${cardsFile}`);
const cards = readFileSync(cardsFile, "utf8");
for (const persona of flags.personas) buildSystemPrompt(guide, cards, persona); // fail fast on typos
const catalog = flags.script ? null : await loadCatalog();
const batchDir = join(SESSIONS_IN, flags.batch);
mkdirSync(batchDir, { recursive: true });

const results = [];
for (let i = 0; i < flags.sittings; i++) {
	const persona = flags.personas[i % flags.personas.length];
	const ordinal = Math.floor(i / flags.personas.length) + 1;
	console.log(`\n— sitting ${i + 1}/${flags.sittings}: ai-${persona}-${ordinal} (${flags.world}) —`);
	results.push(await runSitting({ batchDir, persona, ordinal, flags, guide, cards, catalog }));
}

console.log(`\n— batch ${flags.batch} done —`);
for (const r of results) {
	console.log(`  ${r.name}: ${r.turns} turns · ${r.notes} notes · ${r.reason}${r.infrastructure ? " ⚠" : ""}`);
}
console.log(`folders in ${batchDir} — audit with: /analyze-sessions ${join("aitester", "sessions-in", flags.batch)}`);
