#!/usr/bin/env node
/**
 * Wrapper smoke — proves the AI-tester extension loads the real game AND
 * that /ai-state renders standing gates over crafted sessions. No LLM calls
 * (commands only, PI_OFFLINE). Run:  node aitester/tools/wrapper-smoke.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const EXT = join(resolve(TOOLS, ".."), "extension", "index.ts");
const WORK = "/tmp/aitester-wrapper-smoke";
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "sessions"), { recursive: true });

let n = 0;
const id = () => `aa${(n++).toString(16).padStart(6, "0")}`;
const T0 = Date.parse("2026-08-03T10:00:00.000Z");
const iso = (offset) => new Date(T0 + offset * 1000).toISOString();

/** Crafted session: header + boot stamps + the given game events, chained. */
function craft(file, events) {
	const entries = [{ type: "session", version: 3, id: randomUUID(), timestamp: iso(0), cwd: WORK }];
	let prev = null;
	let offset = 1;
	for (const data of [
		{ ev: "world", world: "dragon-realm" },
		{ ev: "chronicle", key: "wrapper-smoke" },
		...events,
	]) {
		const entry = {
			type: "custom",
			id: id(),
			parentId: prev,
			timestamp: iso(offset++),
			customType: "world-console.ledger",
			data,
		};
		entries.push(entry);
		prev = entry.id;
	}
	writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

/** Boot pi RPC on a session, run /ai-state, return everything printed. */
function aiState(sessionFile) {
	return new Promise((resolvePromise, reject) => {
		const proc = spawn("pi", ["--mode", "rpc", "-e", EXT, "--session", sessionFile], {
			cwd: WORK,
			env: {
				...process.env,
				PI_CODING_AGENT_SESSION_DIR: join(WORK, "sessions"),
				PI_SKIP_VERSION_CHECK: "1",
				PI_OFFLINE: "1",
				WORLD_CONSOLE_DATA_DIR: join(WORK, "worlddata"),
			},
		});
		let out = "";
		proc.stdout.on("data", (chunk) => {
			out += chunk.toString();
		});
		const timer = setTimeout(() => {
			proc.kill("SIGKILL");
			reject(new Error(`timeout; output so far:\n${out.slice(0, 800)}`));
		}, 30_000);
		setTimeout(() => proc.stdin.write(JSON.stringify({ id: "s1", type: "prompt", message: "/ai-state" }) + "\n"), 2500);
		const poll = setInterval(() => {
			if (out.includes("standing board")) {
				clearTimeout(timer);
				clearInterval(poll);
				proc.kill("SIGKILL");
				resolvePromise(out);
			}
		}, 300);
	});
}

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = "") => {
	if (cond) {
		passed++;
		console.log(`ok  ${name}`);
	} else {
		failed++;
		console.log(`FAIL ${name} ${detail.slice(0, 200)}`);
	}
};

// A: pending TRIAL — the exact batch-1 blind spot.
{
	const file = join(WORK, "a-trial.jsonl");
	craft(file, [
		{ ev: "quest_shape", slug: "test-quest", clock: 6, twist: 2, check: 1, mids: [] },
		{ ev: "quest_tick", slug: "test-quest", add: 2, filled: 2, size: 6 },
		{
			ev: "check",
			slug: "test-quest",
			tier: "a middling trial",
			dc: 15,
			trial: "the rope bridge sways over the gorge",
			kind: "checkpoint",
			edge: "hindered",
			edgeReason: "crossing at a reckless run",
		},
	]);
	const out = await aiState(file);
	ok("A: base game boots through the wrapper", out.includes("World Console: The Dragon Realm"));
	ok("A: clock shown", out.includes("test-quest 2/6"), out);
	ok("A: trial voiced with DC and kind", out.includes("A TRIAL STANDS") && out.includes("DC 15") && out.includes("checkpoint"));
	ok("A: edge shown, /roll pointed at", out.includes("hindered") && out.includes("/roll"));
}

// B: pending TWIST — sealed paths with options.
{
	const file = join(WORK, "b-twist.jsonl");
	craft(file, [
		{ ev: "quest_shape", slug: "test-quest", clock: 6, twist: 2, check: 1, mids: [] },
		{ ev: "quest_tick", slug: "test-quest", add: 2, filled: 2, size: 6 },
		{
			ev: "complication",
			slug: "test-quest",
			text: "the ford is flooded and the rope bridge frays",
			options: [
				{ id: 1, label: "dare the rope", risk: "risky", promise: "fast across, if it holds" },
				{ id: 2, label: "wade the ford", risk: "safe", promise: "slow, soaked, certain" },
			],
		},
	]);
	const out = await aiState(file);
	ok("B: choice voiced as sealed", out.includes("A CHOICE STANDS") && out.includes("sealed paths"));
	ok("B: both options with risk words", out.includes("dare the rope") && out.includes("safe: slow, soaked, certain"));
	ok("B: /pick pointed at", out.includes("/pick <n>"));
}

// C: quiet state — no gates, no noise.
{
	const file = join(WORK, "c-quiet.jsonl");
	craft(file, []);
	const out = await aiState(file);
	ok("C: quiet board says so", out.includes("no gate stands"), out);
	ok("C: no phantom trial", !out.includes("A TRIAL STANDS"));
}

console.log(`\nwrapper-smoke: ${passed} ok, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
