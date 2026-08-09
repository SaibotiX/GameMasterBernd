// Shipper probe — verify leg 5 (02 item 10). Runs INSIDE the container as
// the player user, production shape: fabricates one session (with a torn
// tail) + its chronicle + an auth.json CANARY beside the sessions dir, then
// drives `node /opt/appserver/shipper.js sweep` through the R13 laws:
//
//   ship      — staged copy truncated at the last complete JSONL line,
//               story mirrored, manifest hashes true, sealed written,
//               auth.json nowhere in the store
//   re-ship   — a no-op (the sealed marker is the idempotency key)
//   growth    — a source that outgrew its manifest re-earns its seal
//
// Exits non-zero on the first broken law.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HOME = process.env.HOME ?? "/home/player";
const GAME_DIR = process.env.GAME_DIR ?? "/home/player/game";
const SHIP = "/ship";
const SID = "0198aaaa-bbbb-7ccc-8ddd-eeeeffff0001";
const SDIR = path.join(HOME, ".pi/agent/sessions/--home-player-game--");
const JSONL = path.join(SDIR, `2026-08-09T10-00-00_${SID}.jsonl`);
const STORY_SRC = path.join(GAME_DIR, "data/world/probe-world", SID);

let failed = false;
const check = (ok, what) => {
	console.log(`${ok ? "ok" : "FAIL"}: ${what}`);
	if (!ok) failed = true;
};
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const sweep = () => {
	const r = spawnSync("node", ["/opt/appserver/shipper.js", "sweep"], {
		env: { ...process.env, WC_PLAYER: "probe" },
		encoding: "utf8",
	});
	if (r.status !== 0) {
		console.error(r.stdout, r.stderr);
		check(false, "sweep exited 0");
		process.exit(1);
	}
	const tickLine = r.stdout.split("\n").filter((l) => l.includes('"ship-tick"')).pop();
	return JSON.parse(tickLine);
};

// --- the fixture: 3 complete lines + a torn 4th, a chronicle, the canary --
const lines = [
	`{"type":"session","version":3,"timestamp":"2026-08-09T10:00:00.000Z","cwd":"${GAME_DIR}"}`,
	`{"type":"message","timestamp":"2026-08-09T10:00:05.000Z","message":{"role":"user","content":"hello keeper"}}`,
	`{"type":"message","timestamp":"2026-08-09T10:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"the console hums"}]}}`,
];
fs.mkdirSync(SDIR, { recursive: true });
fs.writeFileSync(JSONL, lines.join("\n") + "\n" + '{"type":"custom","customT');
fs.mkdirSync(path.join(STORY_SRC, "personas"), { recursive: true });
fs.writeFileSync(path.join(STORY_SRC, "quests.md"), "# quests\n\n- [ ] reach the store\n");
fs.writeFileSync(path.join(STORY_SRC, "ledger.md"), "*u3* the console hums\n");
fs.writeFileSync(path.join(STORY_SRC, "personas", "witness.md"), "# the witness\n");
fs.writeFileSync(path.join(HOME, ".pi/agent/auth.json"), '{"canary":"MUST-NEVER-SHIP"}');

// --- 1: ship — truncation, mirror, manifest, seal, allowlist ---------------
console.log("--- shipper probe 1/3: ship (crash-shaped tail) ---");
let t = sweep();
check(t.sealed === 1, `first sweep seals the session (sealed=${t.sealed})`);
const staged = path.join(SHIP, SID);
const stagedJsonl = path.join(staged, "session.jsonl");
check(fs.existsSync(stagedJsonl), "staged session.jsonl exists");
check(
	fs.readFileSync(stagedJsonl, "utf8") === lines.join("\n") + "\n",
	"staged copy truncated at the last complete line",
);
check(
	fs.readFileSync(JSONL, "utf8").endsWith('{"type":"custom","customT'),
	"the SOURCE file keeps its torn tail untouched",
);
check(fs.existsSync(path.join(staged, "story/personas/witness.md")), "story mirrored recursively");
const manifest = JSON.parse(fs.readFileSync(path.join(staged, "manifest.json"), "utf8"));
check(manifest.player === "probe", "manifest names the player");
check(manifest.world === "probe-world", "manifest names the world");
check(manifest.sessionId === SID, "manifest carries the session id");
check(!!manifest.gitRev && manifest.gitRev !== "unknown", `manifest stamps the git rev (${manifest.gitRev})`);
check(!!manifest.piVersion, `manifest stamps the pi version (${manifest.piVersion})`);
check(manifest.startedAt === "2026-08-09T10:00:00.000Z", "startedAt from the first entry");
check(manifest.endedAt === "2026-08-09T10:01:00.000Z", "endedAt from the last complete entry");
check(
	manifest.files["session.jsonl"].sha256 === sha256(stagedJsonl),
	"manifest hash matches the staged jsonl",
);
check(
	manifest.files["story/quests.md"].sha256 === sha256(path.join(staged, "story/quests.md")),
	"manifest hash matches a story file",
);
check(fs.existsSync(path.join(staged, "sealed")), "sealed marker written");
const shipped = [];
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (e.isDirectory()) walk(path.join(d, e.name));
		else shipped.push(path.join(d, e.name));
	}
})(SHIP);
check(!shipped.some((f) => path.basename(f) === "auth.json"), "auth.json is nowhere in the store");
check(
	!shipped.some((f) => fs.readFileSync(f, "utf8").includes("MUST-NEVER-SHIP")),
	"the canary's content shipped nowhere",
);

// --- 2: re-ship is a no-op -------------------------------------------------
console.log("--- shipper probe 2/3: shipping twice is a no-op ---");
t = sweep();
check(t.skipped === 1 && t.copied === 0 && t.sealed === 0, `second sweep is a no-op (skipped=${t.skipped} copied=${t.copied} sealed=${t.sealed})`);

// --- 3: a grown source re-earns its seal -----------------------------------
console.log("--- shipper probe 3/3: growth reopens the seal ---");
fs.appendFileSync(
	JSONL,
	'ype":"broken-tail-completed"}\n{"type":"message","timestamp":"2026-08-09T10:05:00.000Z","message":{"role":"user","content":"back again"}}\n',
);
t = sweep();
check(t.reopened === 1 && t.sealed === 1, `grown source reopened and resealed (reopened=${t.reopened} sealed=${t.sealed})`);
const manifest2 = JSON.parse(fs.readFileSync(path.join(staged, "manifest.json"), "utf8"));
check(manifest2.sourceSize > manifest.sourceSize, "manifest tracks the grown source");
check(manifest2.endedAt === "2026-08-09T10:05:00.000Z", "endedAt advanced with the growth");
check(
	fs.readFileSync(stagedJsonl, "utf8").trim().split("\n").length === 5,
	"staged copy now carries all five complete lines",
);

if (failed) {
	console.error("shipper probe: FAILED");
	process.exit(1);
}
console.log("shipper probe green");
