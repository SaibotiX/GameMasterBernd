// deploy/image/appserver/shipper.js — R13's shipper: the allowlist job that
// turns play sessions into research data. One implementation, two runners:
// the app server calls tick() at its seams (boot sweep, 10-minute
// checkpoints, pi's exit, the stop signal), and the host runs
// `node shipper.js sweep` in a one-shot container to give a stopped
// friend's leftovers the same treatment (store-sweep.sh, the reaper).
//
// The unit is the session: the JSONL plus the chronicle folder it stamped,
// joined by the uuid in the filename. ALLOWLIST BY CONSTRUCTION — the only
// paths ever read are ~/.pi/agent/sessions/** and data/world/*/<sid>/**;
// auth.json is a sibling of the sessions dir no glob here can reach, and
// data/downloads/ stays home (big, re-fetchable, every scrying already in
// the ledger).
//
// Staging contract (/ship is the store's staging/<player>/, bind-mounted by
// the host; absent = shipping disabled, said once):
//   /ship/<sid>/session.jsonl   mirror of the JSONL — a torn tail is fine
//                               between checkpoints; sealing truncates the
//                               STAGED copy at the last complete line (the
//                               crash path ships what hit disk), the source
//                               is never touched
//   /ship/<sid>/story/**        mirror of the chronicle folder
//   /ship/<sid>/manifest.json   session id, player, git rev, pi version,
//                               world, start/end, per-file sha256, and the
//                               SOURCE size at seal time — then, last:
//   /ship/<sid>/sealed          the idempotency key; while it stands, every
//                               trigger is a no-op. It falls only when the
//                               source outgrows the manifest (a resumed
//                               session re-earns its seal).
// Verify-and-compact is the store side's job (deploy/host/store-sweep.sh),
// never this module's: after compaction the host prunes the staged data
// files and LEAVES manifest.json + sealed standing, so this side still
// answers "shipped already".

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HOME = process.env.HOME ?? "/home/player";
const GAME_DIR = process.env.GAME_DIR ?? "/home/player/game";
const SESSIONS_DIR = path.join(HOME, ".pi", "agent", "sessions");
const WORLD_DIR = path.join(GAME_DIR, "data", "world");
const SHIP_DIR = process.env.SHIP_DIR ?? "/ship";

// Second-resolution mtime comparison: rename/utimes keep milliseconds on
// some filesystems and drop them on others — the coarser grain is the one
// that is true everywhere.
const secs = (ms) => Math.floor(ms / 1000);

async function statOrNull(p) {
	try {
		return await fsp.stat(p);
	} catch {
		return null;
	}
}

// Every session pi ever wrote here, across cwd-key dirs. The stamp-prefixed
// basename sorts chronologically, which is how the live one is recognized.
async function listSessions() {
	const out = [];
	let keys;
	try {
		keys = await fsp.readdir(SESSIONS_DIR, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const k of keys) {
		if (!k.isDirectory()) continue;
		const dir = path.join(SESSIONS_DIR, k.name);
		for (const f of await fsp.readdir(dir, { withFileTypes: true })) {
			if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
			const sid = f.name.slice(0, -".jsonl".length).split("_").pop();
			if (sid) out.push({ sid, base: f.name, file: path.join(dir, f.name) });
		}
	}
	out.sort((a, b) => a.base.localeCompare(b.base));
	return out;
}

// The chronicle folder this session stamped: data/world/<world>/<sid>/.
async function findStory(sid) {
	let worlds;
	try {
		worlds = await fsp.readdir(WORLD_DIR, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const w of worlds) {
		if (!w.isDirectory()) continue;
		const dir = path.join(WORLD_DIR, w.name, sid);
		if ((await statOrNull(dir))?.isDirectory()) return { world: w.name, dir };
	}
	return null;
}

// Regular files only, relative paths — symlinks are neither followed nor
// copied, so the mirror cannot point outside its two allowlisted roots.
async function walkFiles(dir, rel = "") {
	const out = [];
	let entries;
	try {
		entries = await fsp.readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
		else if (e.isFile()) out.push(r);
	}
	return out;
}

// rclone semantics: size + modtime match = skip. Copies land whole or not
// at all (tmp + rename), carrying the source mtime so the skip holds.
async function copyIfChanged(src, dst) {
	const s = await statOrNull(src);
	if (!s?.isFile()) return false;
	const d = await statOrNull(dst);
	if (d && d.size === s.size && secs(d.mtimeMs) === secs(s.mtimeMs)) return false;
	await fsp.mkdir(path.dirname(dst), { recursive: true });
	const tmp = dst + ".tmp-ship";
	await fsp.copyFile(src, tmp);
	await fsp.utimes(tmp, s.atime, s.mtime);
	await fsp.rename(tmp, dst);
	return true;
}

function sha256(file) {
	return new Promise((resolve, reject) => {
		const h = crypto.createHash("sha256");
		fs.createReadStream(file)
			.on("data", (c) => h.update(c))
			.on("error", reject)
			.on("end", () => resolve(h.digest("hex")));
	});
}

// The crash path's honesty: keep only complete, parseable lines in the
// staged copy. Walks back line by line until the tail parses; a file with
// no complete line left is not sealable.
async function truncateAtLastCompleteLine(staged) {
	let buf = await fsp.readFile(staged);
	let end = buf.length;
	for (;;) {
		while (end > 0 && buf[end - 1] === 0x0a) end--;
		const nl = buf.lastIndexOf(0x0a, end - 1);
		const line = buf.subarray(nl + 1, end).toString("utf8");
		if (line.trim() === "") {
			end = nl < 0 ? 0 : nl;
			if (end <= 0) return false;
			continue;
		}
		try {
			JSON.parse(line);
			break;
		} catch {
			end = nl < 0 ? 0 : nl;
			if (end <= 0) return false;
		}
	}
	const keep = end + (buf[end] === 0x0a ? 1 : 0);
	if (keep !== buf.length) {
		const tmp = staged + ".tmp-ship";
		await fsp.writeFile(tmp, buf.subarray(0, keep));
		await fsp.rename(tmp, staged);
	}
	return true;
}

// First/last entry timestamps when the lines carry one; file times are the
// fallback ground.
async function sessionSpan(staged, sourceStat) {
	const tsOf = (line) => {
		try {
			const v = JSON.parse(line);
			return typeof v.timestamp === "string" ? v.timestamp : null;
		} catch {
			return null;
		}
	};
	const text = await fsp.readFile(staged, "utf8");
	const lines = text.split("\n").filter((l) => l.trim() !== "");
	const started = (lines.length && tsOf(lines[0])) || sourceStat.birthtime.toISOString();
	const ended = (lines.length && tsOf(lines[lines.length - 1])) || sourceStat.mtime.toISOString();
	return { started, ended };
}

export function createShipper({ log, piRunning }) {
	let enabled = null; // unknown until first tick
	let queue = Promise.resolve();
	let last = null;

	async function checkEnabled() {
		if (enabled !== null) return enabled;
		try {
			await fsp.access(SHIP_DIR, fs.constants.W_OK);
			enabled = true;
		} catch {
			enabled = false;
			log("ship-disabled", { dir: SHIP_DIR });
		}
		return enabled;
	}

	// A sealed session re-opens only when its source outgrew the manifest —
	// the JSONL got longer, or a chronicle file changed or appeared.
	async function needsReopen(s, stagedDir) {
		let manifest;
		try {
			manifest = JSON.parse(await fsp.readFile(path.join(stagedDir, "manifest.json"), "utf8"));
		} catch {
			return true; // sealed without a readable manifest is a broken seal
		}
		const src = await statOrNull(s.file);
		if (!src || src.size > (manifest.sourceSize ?? -1)) return true;
		const story = await findStory(s.sid);
		if (story) {
			for (const rel of await walkFiles(story.dir)) {
				const m = manifest.files?.[`story/${rel}`];
				const st = await statOrNull(path.join(story.dir, rel));
				if (!m || (st && st.size !== m.size)) return true;
			}
		}
		return false;
	}

	async function shipOne(s, seal, counters) {
		const stagedDir = path.join(SHIP_DIR, s.sid);
		const sealedPath = path.join(stagedDir, "sealed");
		if (await statOrNull(sealedPath)) {
			if (!(await needsReopen(s, stagedDir))) {
				counters.skipped++;
				return;
			}
			await fsp.rm(sealedPath, { force: true });
			counters.reopened++;
		}

		// Mirror: the JSONL and the chronicle, changed files only.
		const stagedJsonl = path.join(stagedDir, "session.jsonl");
		if (await copyIfChanged(s.file, stagedJsonl)) counters.copied++;
		const story = await findStory(s.sid);
		if (story) {
			for (const rel of await walkFiles(story.dir)) {
				if (await copyIfChanged(path.join(story.dir, rel), path.join(stagedDir, "story", rel)))
					counters.copied++;
			}
		}
		if (!seal) return;

		// Seal: truncate the staged tail to complete lines, hash everything,
		// manifest, then the marker — strictly last.
		if (!(await statOrNull(stagedJsonl))) {
			counters.errors++;
			log("ship-error", { sid: s.sid, err: "no staged jsonl to seal" });
			return;
		}
		if (!(await truncateAtLastCompleteLine(stagedJsonl))) {
			counters.unsealable++;
			log("ship-unsealable", { sid: s.sid, err: "no complete jsonl line" });
			return;
		}
		const srcStat = await fsp.stat(s.file);
		const files = {};
		for (const rel of ["session.jsonl", ...(await walkFiles(path.join(stagedDir, "story"))).map((r) => `story/${r}`)]) {
			const f = path.join(stagedDir, rel);
			const st = await statOrNull(f);
			if (st?.isFile()) files[rel] = { size: st.size, sha256: await sha256(f) };
		}
		const span = await sessionSpan(stagedJsonl, srcStat);
		const manifest = {
			manifestVersion: 1,
			sessionId: s.sid,
			player: process.env.WC_PLAYER ?? "unknown",
			world: story?.world ?? null,
			gitRev: process.env.GIT_REV ?? null,
			piVersion: process.env.PI_VERSION ?? null,
			startedAt: span.started,
			endedAt: span.ended,
			sourceSize: srcStat.size,
			files,
		};
		const mTmp = path.join(stagedDir, "manifest.json.tmp-ship");
		await fsp.writeFile(mTmp, JSON.stringify(manifest, null, "\t") + "\n");
		await fsp.rename(mTmp, path.join(stagedDir, "manifest.json"));
		const sTmp = path.join(stagedDir, "sealed.tmp-ship");
		await fsp.writeFile(sTmp, JSON.stringify({ sealedAt: new Date().toISOString() }) + "\n");
		await fsp.rename(sTmp, sealedPath);
		counters.sealed++;
	}

	// One pass over every session: mirror all, seal all but the live one
	// (pi running = its newest file is still being written). Ticks queue —
	// a checkpoint and a stop can never interleave.
	function tick(reason) {
		queue = queue.then(async () => {
			if (!(await checkEnabled())) return { disabled: true };
			const counters = { reason, sessions: 0, copied: 0, sealed: 0, skipped: 0, reopened: 0, unsealable: 0, errors: 0 };
			const sessions = await listSessions();
			counters.sessions = sessions.length;
			const liveBase = piRunning() && sessions.length ? sessions[sessions.length - 1].base : null;
			for (const s of sessions) {
				try {
					await shipOne(s, s.base !== liveBase, counters);
				} catch (err) {
					counters.errors++;
					log("ship-error", { sid: s.sid, err: String(err) });
				}
			}
			last = { at: new Date().toISOString(), ...counters };
			log("ship-tick", counters);
			return counters;
		});
		return queue;
	}

	return { tick, status: () => ({ enabled, last }) };
}

// One-shot mode for the host's seams: everything sealable gets sealed —
// nothing is live in a container that is not serving anyone.
const invokedDirectly =
	process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly && process.argv[2] === "sweep") {
	const log = (ev, extra = {}) =>
		console.log(JSON.stringify({ ts: new Date().toISOString(), ev, ...extra }));
	const shipper = createShipper({ log, piRunning: () => false });
	const result = await shipper.tick("sweep");
	process.exit(result.disabled || result.errors ? 1 : 0);
}
