/**
 * Live demo of the /web command:
 *   node .pi/extensions/world-console/test/demo-web.ts            # text + picture
 *   WC_VIDEO=1 node .pi/extensions/world-console/test/demo-web.ts # + video (slow)
 *
 * Boots real pi (RPC mode, fresh session, dragon-realm), runs /web commands,
 * and prints the game master's in-character replies plus the ledger.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DOWNLOADS = join(EXT, "..", "data", "downloads");
const WORK = "/tmp/wc-demo";
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "sessions"), { recursive: true });

const sessionFile = join(WORK, "demo.jsonl");
writeFileSync(
	sessionFile,
	[
		{ type: "session", version: 3, id: randomUUID(), timestamp: "2026-08-02T18:00:00.000Z", cwd: WORK },
		{
			type: "custom",
			id: "aa000000",
			parentId: null,
			timestamp: "2026-08-02T18:00:01.000Z",
			customType: "world-console.ledger",
			data: { ev: "world", world: "dragon-realm" },
		},
	]
		.map((entry) => JSON.stringify(entry))
		.join("\n") + "\n",
);

const proc = spawn("pi", ["--mode", "rpc", "-e", join(EXT, "index.ts"), "--session", sessionFile], {
	cwd: WORK,
	env: { ...process.env, PI_CODING_AGENT_SESSION_DIR: join(WORK, "sessions"), PI_SKIP_VERSION_CHECK: "1", PI_OFFLINE: "1" },
});

const lines: string[] = [];
let buffer = "";
const waiters: { predicate: (line: string) => boolean; resolve: (line: string) => void }[] = [];
proc.stdout.on("data", (chunk: Buffer) => {
	buffer += chunk.toString();
	let idx = buffer.indexOf("\n");
	while (idx !== -1) {
		const line = buffer.slice(0, idx);
		buffer = buffer.slice(idx + 1);
		if (line.trim()) {
			lines.push(line);
			for (let i = waiters.length - 1; i >= 0; i--) {
				if (waiters[i].predicate(line)) waiters.splice(i, 1)[0].resolve(line);
			}
		}
		idx = buffer.indexOf("\n");
	}
});
proc.stderr.on("data", () => {});

function waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
		waiters.push({
			predicate,
			resolve: () => {
				clearTimeout(timer);
				resolve();
			},
		});
	});
}

function deepStrings(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) for (const item of value) deepStrings(item, out);
	else if (value && typeof value === "object") for (const item of Object.values(value)) deepStrings(item, out);
	return out;
}

async function runCommand(message: string, waitAgent: boolean, timeoutMs: number): Promise<string[]> {
	const mark = lines.length;
	proc.stdin.write(JSON.stringify({ id: `d${mark}`, type: "prompt", message }) + "\n");
	if (waitAgent) {
		await waitFor((line) => lines.indexOf(line) >= mark && line.includes('"agent_end"'), timeoutMs);
	}
	await new Promise((resolve) => setTimeout(resolve, 700));
	return lines.slice(mark);
}

function assistantText(newLines: string[]): string {
	const texts: string[] = [];
	for (const line of newLines) {
		try {
			const event = JSON.parse(line);
			if (event.type === "message_end" && event.message?.role === "assistant") {
				for (const block of event.message.content ?? []) if (block.type === "text") texts.push(block.text);
			}
		} catch {}
	}
	return texts.join("\n").trim();
}

function show(title: string, text: string) {
	console.log(`\n════ ${title} ════`);
	console.log(text.length > 900 ? text.slice(0, 900).trimEnd() + " …" : text);
}

const wantVideo = process.env.WC_VIDEO === "1";
mkdirSync(APP_DOWNLOADS, { recursive: true }); // fresh clone: nothing downloaded yet
const before = new Set(readdirSync(APP_DOWNLOADS).filter(Boolean));

show("player types", "/web text basalt");
show("Bernd answers", assistantText(await runCommand("/web text basalt", true, 180_000)));

show("player types", "/web picture aurora borealis");
show("Bernd answers", assistantText(await runCommand("/web picture aurora borealis", true, 240_000)));

if (wantVideo) {
	show("player types", "/web video komodo dragon");
	show("Bernd answers", assistantText(await runCommand("/web video komodo dragon", true, 480_000)));
}

const ledgerLines = await runCommand("/ledger 30", false, 20_000);
const ledgerText = ledgerLines
	.flatMap((line) => {
		try {
			return deepStrings(JSON.parse(line));
		} catch {
			return [];
		}
	})
	.find((text) => text.includes("world: "));
show("/ledger 30", ledgerText ?? "(no ledger notification captured)");

const after = readdirSync(APP_DOWNLOADS).filter((f) => !before.has(f));
show("new files in app/data/downloads", after.join("\n") || "(none)");

proc.stdin.end();
setTimeout(() => proc.kill("SIGKILL"), 3000);
