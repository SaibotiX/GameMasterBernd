/**
 * Unit tests for the world-console extension — pure modules only, no pi
 * runtime needed:  node .pi/extensions/world-console/test/unit.ts
 *
 * Covers: ledger derivation + code-owned invariants (ban/redemption),
 * branch isolation, config-loader equivalence with the app's original
 * loader, prompt assembly, and the live MediaWiki search adapter.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(EXT, "..", "..", "..");

const { derive, planSetMood, planRedemption, asGameEvent, LEDGER_TYPE, LEGACY_MOOD_TYPE } = await import(
	join(EXT, "ledger.ts")
);
const { loadConfig, moodIdsBySeverity } = await import(join(EXT, "config.ts"));
const { assembleSystemPrompt } = await import(join(EXT, "prompt.ts"));
const { searchText } = await import(join(EXT, "textsearch.ts"));
const appConfig = await import(join(REPO, "app", "src", "config.ts"));

let passed = 0;
function ok(name: string, fn: () => void) {
	fn();
	passed++;
	console.log(`ok  ${name}`);
}

// ---- helpers to build session-entry shapes -------------------------------
let nextId = 0;
function ev(data: Record<string, unknown>, t = "2026-08-02T12:00:00.000Z") {
	return { type: "custom", id: `e${nextId++}`, timestamp: t, customType: LEDGER_TYPE, data };
}
function userMsg(text = "hello", t = "2026-08-02T12:00:01.000Z") {
	return { type: "message", id: `e${nextId++}`, timestamp: t, message: { role: "user", content: text } };
}
function assistantMsg(t = "2026-08-02T12:00:02.000Z") {
	return { type: "message", id: `e${nextId++}`, timestamp: t, message: { role: "assistant", content: [] } };
}

// ---- 1. derive ------------------------------------------------------------
ok("derive: empty branch → defaults", () => {
	const st = derive([], "neutral");
	assert.deepEqual(st, { mood: "neutral", banned: false, chats: 0, searches: 0, refusals: 0 });
});

ok("derive: mood chain, last wins", () => {
	const st = derive(
		[ev({ ev: "mood_set", mood: "gracious", reason: "" }), ev({ ev: "mood_set", mood: "irritated", reason: "" })],
		"neutral",
	);
	assert.equal(st.mood, "irritated");
});

ok("derive: ban and redemption toggle banned", () => {
	const banOnly = derive([ev({ ev: "websearch_ban" })], "neutral");
	assert.equal(banOnly.banned, true);
	const redeemed = derive([ev({ ev: "websearch_ban" }), ev({ ev: "redemption", reason: "amends" })], "neutral");
	assert.equal(redeemed.banned, false);
});

ok("derive: counters (chats from user messages, searches, refusals)", () => {
	const st = derive(
		[
			userMsg("one"),
			assistantMsg(),
			userMsg("two"),
			ev({ ev: "search_requested", query: "q" }),
			ev({ ev: "search_performed", query: "q", source: "s", ref: "r", title: "t" }),
			ev({ ev: "search_refused", category: "banned" }),
			ev({ ev: "search_failed", reason: "no result" }),
		],
		"neutral",
	);
	assert.equal(st.chats, 2);
	assert.equal(st.searches, 1);
	assert.equal(st.refusals, 1);
});

ok("derive: world stamp and player name", () => {
	const st = derive([ev({ ev: "world", world: "star-frontier" }), ev({ ev: "player_named", name: "Bbaba" })], "neutral");
	assert.equal(st.world, "star-frontier");
	assert.equal(st.playerName, "Bbaba");
});

ok("derive: legacy milestone mood entries honored", () => {
	const legacy = { type: "custom", id: "x", timestamp: "t", customType: LEGACY_MOOD_TYPE, data: { mood: "gracious" } };
	assert.equal(derive([legacy], "neutral").mood, "gracious");
});

ok("derive: foreign custom types and malformed data ignored", () => {
	const st = derive(
		[
			{ type: "custom", id: "a", timestamp: "t", customType: "other.ext", data: { ev: "websearch_ban" } },
			{ type: "custom", id: "b", timestamp: "t", customType: LEDGER_TYPE, data: null },
			{ type: "custom", id: "c", timestamp: "t", customType: LEDGER_TYPE, data: { no: "ev" } },
			{ type: "compaction", id: "d", timestamp: "t" },
			{ type: "model_change", id: "e", timestamp: "t" },
		],
		"neutral",
	);
	assert.deepEqual(st.banned, false);
	assert.equal(st.chats, 0);
});

ok("derive: lastEntryAt tracks newest entry timestamp", () => {
	const st = derive([userMsg("a", "2026-08-02T10:00:00.000Z"), ev({ ev: "websearch_ban" }, "2026-08-02T11:00:00.000Z")], "n");
	assert.equal(st.lastEntryAt, "2026-08-02T11:00:00.000Z");
});

// ---- 2. write-time invariants --------------------------------------------
ok("planSetMood: angriest mood adds the ban in the same step", () => {
	const st = derive([], "neutral");
	const events = planSetMood(st, "angry", "insulted", "angry");
	assert.deepEqual(events.map((e: { ev: string }) => e.ev), ["mood_set", "websearch_ban"]);
});

ok("planSetMood: no duplicate ban when already banned", () => {
	const st = derive([ev({ ev: "websearch_ban" })], "neutral");
	const events = planSetMood(st, "angry", "again", "angry");
	assert.deepEqual(events.map((e: { ev: string }) => e.ev), ["mood_set"]);
});

ok("planSetMood: non-angriest mood never bans", () => {
	const events = planSetMood(derive([], "neutral"), "irritated", "rude", "angry");
	assert.deepEqual(events.map((e: { ev: string }) => e.ev), ["mood_set"]);
});

ok("planRedemption: no-op unless banned", () => {
	assert.equal(planRedemption(derive([], "neutral"), "neutral", "amends"), null);
});

ok("planRedemption: lifts ban and returns mood to default", () => {
	const banned = derive(planSetMood(derive([], "neutral"), "angry", "x", "angry").map((d: object) => ev(d as Record<string, unknown>)), "neutral");
	assert.equal(banned.banned, true);
	const events = planRedemption(banned, "neutral", "sincere amends");
	assert.ok(events);
	const after = derive(
		[...planSetMood(derive([], "neutral"), "angry", "x", "angry"), ...events!].map((d: object) => ev(d as Record<string, unknown>)),
		"neutral",
	);
	assert.equal(after.banned, false);
	assert.equal(after.mood, "neutral");
});

// ---- 3. branch isolation --------------------------------------------------
ok("branches: ban on branch A never leaks into branch B", () => {
	// Shared trunk, then A gains angry+ban; B (fork before that) stays clean.
	const trunk = [ev({ ev: "world", world: "dragon-realm" }), userMsg("hi"), assistantMsg()];
	const branchA = [...trunk, ...planSetMood(derive(trunk, "neutral"), "angry", "betrayal", "angry").map((d: object) => ev(d as Record<string, unknown>))];
	const branchB = [...trunk, userMsg("different path")];
	const a = derive(branchA, "neutral");
	const b = derive(branchB, "neutral");
	assert.equal(a.banned, true);
	assert.equal(a.mood, "angry");
	assert.equal(b.banned, false);
	assert.equal(b.mood, "neutral");
	assert.equal(b.chats, 2);
});

ok("branches: rewind before the ban derives the pre-ban state", () => {
	const trunk = [ev({ ev: "world", world: "dragon-realm" }), ev({ ev: "mood_set", mood: "gracious", reason: "" })];
	const full = [...trunk, ev({ ev: "mood_set", mood: "angry", reason: "" }), ev({ ev: "websearch_ban" })];
	assert.equal(derive(full, "neutral").banned, true);
	assert.equal(derive(trunk, "neutral").banned, false);
	assert.equal(derive(trunk, "neutral").mood, "gracious");
});

// ---- 4. config equivalence with the app loader ---------------------------
for (const worldId of ["dragon-realm", "star-frontier"]) {
	const a = appConfig.loadConfig(join(REPO, "app"), worldId);
	const e = loadConfig(join(REPO, "app"), worldId);
	ok(`config[${worldId}]: constitution/world/moods/sites match the app loader`, () => {
		assert.equal(e.constitution, a.constitution);
		for (const key of ["id", "title", "voice", "register", "defaultMood", "body"]) {
			assert.equal((e.world as Record<string, unknown>)[key], (a.world as Record<string, unknown>)[key], key);
		}
		assert.deepEqual([...e.moods.keys()].sort(), [...a.moods.keys()].sort());
		assert.deepEqual(e.textSites.map((s: { host: string }) => s.host), a.sites.text.map((s: { host: string }) => s.host));
		assert.deepEqual(e.pictureSites.map((s: { host: string }) => s.host), a.sites.picture.map((s: { host: string }) => s.host));
	});
}

ok("config: angriest mood is last in severity order", () => {
	const e = loadConfig(join(REPO, "app"), "dragon-realm");
	const ids = moodIdsBySeverity(e);
	assert.deepEqual(ids, ["gracious", "neutral", "irritated", "angry"]);
});

// ---- 5. prompt assembly ---------------------------------------------------
{
	const config = loadConfig(join(REPO, "app"), "dragon-realm");
	const banned = derive(
		[
			ev({ ev: "player_named", name: "Bbaba" }),
			userMsg(),
			...planSetMood(derive([], "neutral"), "angry", "betrayal", "angry").map((d: object) => ev(d as Record<string, unknown>)),
		],
		"neutral",
	);
	const p = assembleSystemPrompt(config, { state: banned, resumedFrom: "2026-08-01T10:00:00.000Z", justArrived: false });
	ok("prompt: layers in order", () => {
		const layers = [...p.matchAll(/<section layer="([^"]+)">/g)].map((m) => m[1]);
		assert.deepEqual(layers, [
			"0 · constitution",
			"1 · world: dragon-realm",
			"2 · mood: angry",
			"3 · the seeker's standing",
			"4 · control protocol",
		]);
	});
	ok("prompt: standing shows name, ban, counters, resume line", () => {
		assert.match(p, /The seeker before you: Bbaba\./);
		assert.match(p, /You have BARRED this seeker/);
		assert.match(p, /1 messages, 0 searches granted, 0 requests refused/);
		assert.match(p, /they last spoke 2026-08-01T10:00:00\.000Z/);
		assert.doesNotMatch(p, /just arrived/);
	});
	ok("prompt: protocol names all six tools and the anti-theater rule", () => {
		for (const tool of ["set_mood", "find_text", "find_picture", "find_video", "grant_redemption", "record_name"]) {
			assert.match(p, new RegExp(tool));
		}
		assert.match(p, /it has NOT happened/);
		assert.match(p, /set_mood\("angry"\)/);
		assert.match(p, /\[engine\]/);
	});
	const fresh = assembleSystemPrompt(config, { state: derive([], "neutral"), justArrived: true });
	ok("prompt: fresh sitting shows arrival note, no resume line", () => {
		assert.match(fresh, /just arrived/);
		assert.doesNotMatch(fresh, /last spoke/);
		assert.match(fresh, /an unnamed stranger/);
	});
}

// ---- 6. asGameEvent guards ------------------------------------------------
ok("asGameEvent: non-custom entries → null", () => {
	assert.equal(asGameEvent(userMsg()), null);
	assert.equal(asGameEvent({ type: "compaction", id: "x" } as never), null);
});

// ---- 7. media search (picture live, video tooling) ------------------------
{
	const media = await import(join(EXT, "mediasearch.ts"));
	const { existsSync, rmSync, statSync } = await import("node:fs");
	const downloadDir = "/tmp/wc-test/downloads-unit";
	rmSync(downloadDir, { recursive: true, force: true });

	const pic = await media.searchPicture([{ host: "commons.wikimedia.org" }], "komodo dragon", downloadDir);
	ok("picture: commons hit downloads a real image file", () => {
		assert.ok(pic, "expected a picture result");
		assert.equal(pic!.site, "commons.wikimedia.org");
		assert.ok(pic!.title.length > 0 && pic!.pageUrl.startsWith("https://"));
		assert.ok(existsSync(pic!.path), `file missing: ${pic!.path}`);
		assert.ok(statSync(pic!.path).size > 10_000, "downloaded file suspiciously small");
	});

	const controller = new AbortController();
	const reason = new Error("player pressed ESC");
	controller.abort(reason);
	await assert.rejects(
		() => media.searchPicture([{ host: "commons.wikimedia.org" }], "komodo dragon", downloadDir, controller.signal),
		(err: unknown) => err === reason,
	);
	console.log("ok  picture: abort propagates the abort reason");
	passed++;

	const tooling = media.detectTooling(join(REPO, "app"));
	ok("video: tooling detection matches the filesystem", () => {
		assert.equal(existsSync(join(tooling.ytDlpSource, "yt_dlp")), true, "vendored yt-dlp missing");
		const bundled = join(REPO, "app", "tools", "ffmpeg", "ffmpeg");
		assert.equal(tooling.ffmpegDir !== null, existsSync(bundled));
	});
}

// ---- 8. live text search (network) ----------------------------------------
{
	const sites = [{ host: "en.wikipedia.org" }];
	const hit = await searchText(sites, "komodo dragon");
	ok("search: wikipedia hit has title/url/extract", () => {
		assert.ok(hit);
		assert.match(hit!.title.toLowerCase(), /komodo/);
		assert.ok(hit!.extract.length > 100 && hit!.extract.length <= 1201);
	});
	const controller = new AbortController();
	const reason = new Error("player pressed ESC");
	controller.abort(reason);
	await assert.rejects(
		() => searchText(sites, "komodo dragon", controller.signal),
		(err: unknown) => err === reason,
	);
	console.log("ok  search: abort propagates the abort reason");
	passed++;
	const bad = await searchText([{ host: "definitely-not-a-real-host-wc.example" }], "komodo");
	assert.equal(bad, null);
	console.log("ok  search: unreachable host degrades to null");
	passed++;
}

console.log(`\n${passed} checks passed`);
