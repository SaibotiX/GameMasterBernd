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
const BASE = join(EXT, ".."); // the IA folder: config/, data/, tools/ live here

const { derive, describeEvent, planSetMood, planRedemption, asGameEvent, LEDGER_TYPE, LEGACY_MOOD_TYPE } =
	await import(join(EXT, "ledger.ts"));
const { loadConfig, moodIdsBySeverity } = await import(join(EXT, "config.ts"));
const { assembleSystemPrompt } = await import(join(EXT, "prompt.ts"));
const { searchText } = await import(join(EXT, "textsearch.ts"));

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
	assert.deepEqual(st, { mood: "neutral", banned: false, chats: 0, searches: 0, refusals: 0, truths: [] });
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

ok("derive: truths accumulate, dedupe, and describe", () => {
	const st = derive(
		[
			ev({ ev: "truth", text: "The moon is a lantern.", source: "decree" }),
			ev({ ev: "truth", text: "The moon is a lantern.", source: "conviction" }),
			ev({ ev: "truth", text: "Bernd owes the seeker a favor.", source: "conviction" }),
		],
		"neutral",
	);
	assert.deepEqual(st.truths, ["The moon is a lantern.", "Bernd owes the seeker a favor."]);
	assert.match(describeEvent({ ev: "truth", text: "X", source: "decree" }), /truth bound \(decree\): "X"/);
});

ok("derive: an amendment retracts the superseded truth and binds the corrected one", () => {
	const st = derive(
		[
			ev({ ev: "truth", text: "The dragon is twenty meters tall.", source: "decree" }),
			ev({ ev: "truth_retracted", text: "The dragon is twenty meters tall." }),
			ev({ ev: "truth", text: "The dragon is nineteen and three-quarter meters tall.", source: "amendment", ref: 7 }),
		],
		"neutral",
	);
	assert.deepEqual(st.truths, ["The dragon is nineteen and three-quarter meters tall."]);
	assert.match(
		describeEvent({ ev: "truth", text: "X", source: "amendment", ref: 7 }),
		/truth bound \(amendment\): "X" ← \*u7\*/,
	);
	assert.match(describeEvent({ ev: "truth_retracted", text: "Y" }), /truth retracted: "Y"/);
});

ok("derive: chronicle key stamps the story's world-file folder (\"\" = legacy)", () => {
	assert.equal(derive([ev({ ev: "chronicle", key: "" })], "neutral").chronicle, "");
	assert.equal(derive([ev({ ev: "chronicle", key: "019fc419-abc" })], "neutral").chronicle, "019fc419-abc");
	assert.equal(derive([], "neutral").chronicle, undefined);
	assert.match(describeEvent({ ev: "chronicle", key: "" }), /legacy chronicle/);
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

// ---- 4. the config tree ---------------------------------------------------
for (const worldId of ["dragon-realm", "star-frontier"]) {
	const cfg = loadConfig(BASE, worldId);
	ok(`config[${worldId}]: constitution, world, moods and sites load`, () => {
		assert.ok(cfg.constitution.length > 100, "constitution missing or empty");
		assert.equal(cfg.world.id, worldId);
		assert.ok(cfg.world.title.length > 0 && cfg.world.voice.length > 0);
		assert.ok(cfg.world.body.length > 100, "world body suspiciously short");
		assert.ok(cfg.moods.size >= 3, "too few moods");
		assert.ok(cfg.textSites.length > 0 && cfg.pictureSites.length > 0);
	});
}

ok("config: angriest mood is last in severity order", () => {
	const e = loadConfig(BASE, "dragon-realm");
	const ids = moodIdsBySeverity(e);
	assert.deepEqual(ids, ["gracious", "neutral", "irritated", "angry"]);
});

// ---- 5. prompt assembly ---------------------------------------------------
{
	const config = loadConfig(BASE, "dragon-realm");
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
		assert.match(p, /story's author/);
		assert.match(p, /invent the tale at once/);
	});
	const fresh = assembleSystemPrompt(config, { state: derive([], "neutral"), justArrived: true });
	ok("prompt: fresh sitting shows arrival note, no resume line", () => {
		assert.match(fresh, /just arrived/);
		assert.doesNotMatch(fresh, /last spoke/);
		assert.match(fresh, /an unnamed stranger/);
	});
	ok("prompt: archive recall appears as its own hidden layer only when present", () => {
		const withRecall = assembleSystemPrompt(config, {
			state: derive([], "neutral"),
			justArrived: false,
			recall: ['*u9* game: Lord Ashelin ruled Villerian before its burning.'],
		});
		assert.match(withRecall, /3¾ · archive recall/);
		assert.match(withRecall, /Lord Ashelin ruled Villerian/);
		assert.match(withRecall, /never mention the record/);
		assert.doesNotMatch(fresh, /archive recall/);
	});
	ok("prompt: established truths appear as a binding layer only when present", () => {
		const withTruths = assembleSystemPrompt(config, {
			state: { ...derive([], "neutral"), truths: ["The moon is a lantern."] },
			justArrived: false,
		});
		assert.match(withTruths, /3½ · established truths/);
		assert.match(withTruths, /- The moon is a lantern\./);
		assert.doesNotMatch(fresh, /established truths/);
		assert.doesNotMatch(p, /established truths/);
	});
}

// ---- 5½. GM table pure parts ----------------------------------------------
{
	const gm = await import(join(EXT, "gmchat.ts"));
	ok("gmchat: extractJson finds the balanced object and rejects noise", () => {
		assert.deepEqual(gm.extractJson('chatter {"a": {"b": 2}, "c": "x}"} tail'), { a: { b: 2 }, c: "x}" });
		assert.equal(gm.extractJson("no json here"), null);
	});

	ok("gmchat: parseGmAnswer keeps valid fixes, drops junk, degrades gracefully", () => {
		const answer = gm.parseGmAnswer(
			'{"say": "The record backs you.", "bind": null, "invite": false, "fixes": [' +
				'{"kind": "place", "name": "The Sunken Vault"},' +
				'{"kind": "nonsense", "name": "x"},' +
				'{"kind": "chronicle_place", "name": "Tor\'s House", "description": "a stout house"},' +
				'{"kind": "quest_grant", "title": "Return the treasure", "task": "bring it back", "reward": "peace"},' +
				'{"kind": "item", "item": "a rusty key", "origin": "found in the cellar"}]}',
		);
		assert.equal(answer.say, "The record backs you.");
		assert.deepEqual(
			answer.fixes.map((fix: { kind: string }) => fix.kind),
			["place", "chronicle_place", "quest_grant", "item"],
		);
		const plain = gm.parseGmAnswer("no json at all");
		assert.equal(plain.say, "no json at all");
		assert.deepEqual(plain.fixes, []);
	});

	const archive = await import(join(EXT, "archive.ts"));
	ok("archive: keywords keep the main words, drop scaffolding, stem broadly", () => {
		const keywords = archive.extractKeywords("What dragons were named in this chat?");
		assert.ok(keywords.includes("dragon"), `dragon in ${keywords}`);
		for (const noise of ["what", "were", "the", "this", "chat"]) assert.ok(!keywords.includes(noise), noise);
		assert.ok(archive.extractKeywords("How was the king called?").includes("king"));
		assert.deepEqual(archive.extractKeywords("was it the??"), []);
	});
	ok("archive: long text chunks on sentence bounds, nothing lost, hard-splits monsters", () => {
		const short = archive.chunkText("One sentence only.");
		assert.deepEqual(short, ["One sentence only."]);
		const long = archive.chunkText(
			"The keeper spoke at length of the vale. ".repeat(20) + "Lord Ashelin ruled Villerian before its burning.",
			120,
		);
		assert.ok(long.length > 3, `expected several chunks, got ${long.length}`);
		assert.ok(long.every((chunk: string) => chunk.length <= 120));
		assert.ok(long.at(-1)!.includes("Lord Ashelin"), "the deep fact must survive chunking");
		const monster = archive.chunkText("x".repeat(950), 400);
		assert.equal(monster.length, 3);
	});

	ok("archive: hits return with neighbours, windows merge, no keywords → empty", () => {
		const lines = [
			{ uid: 1, who: "seeker", text: "Tell me of the sky." },
			{ uid: 2, who: "game", text: "The moon is always full." },
			{ uid: 3, who: "seeker", text: "And the mountains?" },
			{ uid: 4, who: "game", text: "Vorthaxes the dragon nests there." },
			{ uid: 5, who: "seeker", text: "I see." },
			{ uid: 6, who: "game", text: "Indeed." },
		];
		const hits = archive.searchArchive(lines, ["dragon"]);
		assert.deepEqual(hits.map((line: { uid: number }) => line.uid), [3, 4, 5]);
		const merged = archive.searchArchive(lines, ["moon", "mountain"]);
		assert.deepEqual(merged.map((line: { uid: number }) => line.uid), [1, 2, 3, 4]);
		assert.deepEqual(archive.searchArchive(lines, []), []);
		assert.equal(archive.formatArchiveLine(lines[3]), "*u4* game: Vorthaxes the dragon nests there.");
	});
}

// ---- 5¾. the open world on disk -------------------------------------------
{
	const world = await import(join(EXT, "world.ts"));
	const { rmSync: rm, readFileSync: readFile, existsSync: exists } = await import("node:fs");
	const root = "/tmp/wc-test/world-unit";
	rm(root, { recursive: true, force: true });
	const files = { root };

	ok("world: a place is founded once, revisits append, pages never shrink", () => {
		const first = world.visitPlace(files, "Millbrook Farm", "A carrot farm in the lower vale, smelling of wet earth.");
		assert.equal(first.created, true);
		assert.equal(first.slug, "millbrook-farm");
		assert.match(first.content, /## The place/);
		const sizeBefore = first.content.length;
		const again = world.visitPlace(files, "Millbrook Farm", "");
		assert.equal(again.created, false);
		assert.equal(again.title, "Millbrook Farm");
		assert.ok(again.content.length > sizeBefore, "revisit must append, never shrink");
		assert.match(again.content, /the party returns/);
		assert.equal(world.extendPlace(files, "Millbrook Farm", "A scarecrow wears a knight's helm."), true);
		assert.match(readFile(`${root}/places/millbrook-farm.md`, "utf8"), /scarecrow/);
		assert.equal(world.extendPlace(files, "Nowhere", "x"), false);
	});

	ok("world: personas dwell where recorded and move only with a recorded reason", () => {
		const created = world.recordPersona(files, "Farmer Aldwin", "An old carrot farmer.", "He begged for help with the harvest.", "millbrook-farm");
		assert.equal(created.created, true);
		assert.equal(world.personaLocation(files, "Farmer Aldwin"), "millbrook-farm");
		assert.deepEqual(world.personasAt(files, "millbrook-farm"), ["Farmer Aldwin"]);
		world.visitPlace(files, "Village Square", "The cobbled heart of the village.");
		assert.equal(world.movePersona(files, "Farmer Aldwin", "village-square", "Recovered, he walks to market day."), true);
		assert.equal(world.personaLocation(files, "Farmer Aldwin"), "village-square");
		assert.match(readFile(`${root}/personas/farmer-aldwin.md`, "utf8"), /Reason: Recovered/);
		assert.deepEqual(world.personasAt(files, "millbrook-farm"), []);
	});

	ok("world: places chronicled from afar found pages without any arrival", () => {
		const found = world.foundPlace(files, "Tor's House", "A stout timber house on the lane past the well.");
		assert.equal(found.created, true);
		assert.equal(found.slug, "tor-s-house");
		const page = readFile(`${root}/places/tor-s-house.md`, "utf8");
		assert.match(page, /chronicled from afar/);
		assert.doesNotMatch(page, /arrival|returns/);
		assert.equal(world.foundPlace(files, "Tor's House", "ignored").created, false);
		assert.equal(world.placeExists(files, "Tor's House"), true);
	});

	ok("world: quests advance open → done → rewarded and feed the items file", () => {
		world.grantQuest(files, {
			title: "Carrots for Millbrook",
			giver: "Farmer Aldwin",
			task: "Pluck the carrot field before the frost.",
			reward: "three copper pennies",
			placeSlug: "millbrook-farm",
		});
		assert.throws(() => world.grantQuest(files, { title: "Carrots for Millbrook", giver: "x", task: "y", reward: "z", placeSlug: "p" }));
		const quest = world.questBySlug(files, "carrots-for-millbrook");
		assert.ok(quest);
		assert.equal(quest!.status, "open");
		assert.equal(quest!.giverSlug, "farmer-aldwin");
		assert.equal(quest!.reward, "three copper pennies");
		assert.deepEqual(world.openQuestLines(files), ["[open] Carrots for Millbrook (id: carrots-for-millbrook)"]);
		assert.equal(world.setQuestStatus(files, "carrots-for-millbrook", "done", "the field is cleared"), true);
		assert.equal(world.questBySlug(files, "carrots-for-millbrook")!.status, "done");
		assert.equal(world.setQuestStatus(files, "carrots-for-millbrook", "rewarded", "collected"), true);
		assert.deepEqual(world.openQuestLines(files), []);
		world.addItem(files, "three copper pennies — reward");
		assert.match(readFile(`${root}/items.md`, "utf8"), /three copper pennies/);
		assert.equal(exists(`${root}/quests.md`), true);
	});

	ok("world: a giver-less quest is self-set (persona sentinel \"self\")", () => {
		world.grantQuest(files, {
			title: "Return the treasure",
			task: "Bring the found coin back to its rightful owner.",
			reward: "a clear conscience",
			placeSlug: "millbrook-farm",
		});
		const quest = world.questBySlug(files, "return-the-treasure");
		assert.ok(quest);
		assert.equal(quest!.giver, "the seeker");
		assert.equal(quest!.giverSlug, "self");
		assert.equal(quest!.status, "open");
		assert.deepEqual(world.openQuestLines(files), ["[open] Return the treasure (id: return-the-treasure)"]);
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
	const { existsSync, mkdirSync, rmSync, statSync, writeFileSync } = await import("node:fs");
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

	const tooling = media.detectTooling(BASE);
	ok("video: tooling detection matches the filesystem", () => {
		assert.ok(tooling.ytDlpSource && existsSync(join(tooling.ytDlpSource, "yt_dlp")), "vendored yt-dlp missing");
		const bundled = join(BASE, "tools", "ffmpeg", "ffmpeg");
		assert.equal(tooling.ffmpegDir !== null, existsSync(bundled));
		const cookies = join(BASE, "config", "youtube-cookies.txt");
		assert.equal(tooling.cookiesFile, existsSync(cookies) ? cookies : null);
	});

	ok("video: cookie opt-ins picked up from config file and env", () => {
		const fakeRoot = "/tmp/wc-test/fake-app";
		rmSync(fakeRoot, { recursive: true, force: true });
		mkdirSync(join(fakeRoot, "config"), { recursive: true });
		writeFileSync(join(fakeRoot, "config", "youtube-cookies.txt"), "# Netscape HTTP Cookie File\n");
		assert.equal(media.detectTooling(fakeRoot).cookiesFile, join(fakeRoot, "config", "youtube-cookies.txt"));
		const prev = process.env.WORLD_CONSOLE_YT_BROWSER;
		process.env.WORLD_CONSOLE_YT_BROWSER = "firefox";
		try {
			assert.equal(media.detectTooling(fakeRoot).cookiesFromBrowser, "firefox");
		} finally {
			if (prev === undefined) delete process.env.WORLD_CONSOLE_YT_BROWSER;
			else process.env.WORLD_CONSOLE_YT_BROWSER = prev;
		}
		const home = process.env.HOME ?? "";
		const firefoxProfiles =
			existsSync(join(home, ".mozilla", "firefox")) ||
			existsSync(join(home, "snap", "firefox", "common", ".mozilla", "firefox"));
		if (firefoxProfiles) assert.equal(media.detectTooling(fakeRoot).browserFallback, "firefox");
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
