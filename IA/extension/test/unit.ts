/**
 * Unit tests for the world-console extension — pure modules only, no pi
 * runtime needed:  node IA/extension/test/unit.ts
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

const {
	derive, describeEvent, planSetMood, planRedemption, asGameEvent,
	rollBand, BAND_TICKS, TIERS, drawQuestShape, LEDGER_TYPE, LEGACY_MOOD_TYPE,
} = await import(join(EXT, "ledger.ts"));
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
	assert.deepEqual(st, {
		mood: "neutral",
		banned: false,
		chats: 0,
		searches: 0,
		refusals: 0,
		truths: [],
		undertakings: {},
		recentShapes: [],
		recentSuits: [],
	});
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

ok("derive: an undertaking folds shape → ticks → fate → twist → pick → outcome", () => {
	const plan = {
		suit: "material failure",
		complication: "The axle snaps at the ford.",
		clues: ["a hairline crack", "the wheel's wobble"],
		options: [
			{ id: 1, label: "Lash it with rope", risk: "risky", promise: "quick", band: "clean", reveal: "It holds.", reason: "rope is honest" },
			{ id: 2, label: "Ford unaided", risk: "desperate", promise: "no delay", band: "fail", reveal: "The cart drowns.", reason: "spring rivers run mean" },
		],
	};
	const presented = [
		{ id: 1, label: "Lash it with rope", risk: "risky", promise: "quick" },
		{ id: 2, label: "Ford unaided", risk: "desperate", promise: "no delay" },
	];
	const mid = derive(
		[
			ev({ ev: "quest_shape", slug: "wagon", clock: 6, twist: 2 }),
			ev({ ev: "quest_tick", slug: "wagon", add: 2, filled: 2, size: 6 }),
			ev({ ev: "fate", slug: "wagon", plan }),
			ev({ ev: "complication", slug: "wagon", text: plan.complication, options: presented }),
		],
		"neutral",
	);
	assert.equal(mid.undertakings.wagon.filled, 2);
	assert.equal(mid.undertakings.wagon.beatsDone, 2); // tick + twist beat
	assert.equal(mid.undertakings.wagon.twist, 2);
	assert.ok(mid.undertakings.wagon.plan, "plan folds into state");
	assert.equal(mid.pendingChoice?.slug, "wagon");
	assert.deepEqual(mid.recentShapes, [{ clock: 6, twist: 2, check: 0 }]);
	assert.deepEqual(mid.recentSuits, ["material failure"]);

	const done = derive(
		[
			ev({ ev: "quest_shape", slug: "wagon", clock: 6, twist: 2 }),
			ev({ ev: "quest_tick", slug: "wagon", add: 2, filled: 2, size: 6 }),
			ev({ ev: "fate", slug: "wagon", plan }),
			ev({ ev: "complication", slug: "wagon", text: plan.complication, options: presented }),
			ev({ ev: "pick", slug: "wagon", option: 1, label: "Lash it with rope" }),
			ev({ ev: "outcome", slug: "wagon", band: "clean", add: 2, text: "It holds." }),
		],
		"neutral",
	);
	assert.equal(done.pendingChoice, undefined, "a pick clears the pending choice");
	assert.equal(done.undertakings.wagon.filled, 4);
	assert.equal(done.undertakings.wagon.resolved, true);
});

ok("drawQuestShape: every shape has a finale; opening carries a twist; cooldowns hold", () => {
	const SHAPES = [
		{ clock: 4, twist: 0, check: 1 },
		{ clock: 6, twist: 0, check: 1 },
		{ clock: 6, twist: 2, check: 1 },
		{ clock: 8, twist: 3, check: 1 },
	];
	const every = (n: number) => Array.from({ length: n }, (_, i) => (k: number) => i % k);
	// Every draw arms a finale — the completing stroke is always contested.
	for (const rand of every(8)) assert.ok(drawQuestShape(SHAPES, undefined, false, rand).check > 0);
	// The opening is scripted: the first given quest carries a twist.
	for (const rand of every(8)) assert.ok(drawQuestShape(SHAPES, undefined, false, rand).twist > 0, "opening twistless");
	// Self-set tasks carry no twist (their finale still stands).
	for (const rand of every(8)) {
		const drawn = drawQuestShape(SHAPES, undefined, true, rand);
		assert.equal(drawn.twist, 0);
		assert.ok(drawn.check > 0);
	}
	// Cooldown: no twist right after a twisted quest.
	const afterTwist = { clock: 6, twist: 2, check: 1 };
	for (const rand of every(8)) assert.equal(drawQuestShape(SHAPES, afterTwist, false, rand).twist, 0);
	// Never the identical shape twice while another is available.
	const afterSmall = { clock: 4, twist: 0, check: 1 };
	for (const rand of every(8)) {
		const drawn = drawQuestShape(SHAPES, afterSmall, false, rand);
		assert.ok(!(drawn.clock === 4 && drawn.twist === 0));
	}
});

ok("derive: offers lapse, twists bind; hazard trials never spend the finale", () => {
	const options = [
		{ id: 1, label: "The wolf hunt", risk: "", promise: "" },
		{ id: 2, label: "The flooded cellar", risk: "", promise: "" },
	];
	const open = derive([ev({ ev: "offer", text: "Which task calls to you?", options })], "neutral");
	assert.equal(open.pendingChoice?.kind, "offer");
	assert.equal(open.pendingChoice?.options.length, 2);
	const lapsed = derive(
		[ev({ ev: "offer", text: "Which task calls to you?", options }), ev({ ev: "offer_dropped" })],
		"neutral",
	);
	assert.equal(lapsed.pendingChoice, undefined, "speaking past an offer drops it");
	const picked = derive(
		[
			ev({ ev: "offer", text: "Which task calls to you?", options }),
			ev({ ev: "pick", slug: "", option: 1, label: "The wolf hunt" }),
		],
		"neutral",
	);
	assert.equal(picked.pendingChoice, undefined, "a pick resolves an offer");

	const hazarded = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 6, twist: 0, check: 1 }),
			ev({ ev: "check", slug: "q", tier: "a middling trial", dc: 15, trial: "a reckless charge", kind: "hazard", edge: "hindered" }),
			ev({ ev: "roll", slug: "q", dice: [12, 4], kept: 4, dc: 15, band: "setback", grit: false }),
			ev({ ev: "outcome", slug: "q", band: "setback", add: -1, text: "thrown back" }),
		],
		"neutral",
	);
	assert.equal(hazarded.undertakings.q.checkFired, false, "a hazard never spends the finale");
	assert.equal(hazarded.pendingRoll, undefined);
	const finale = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 6, twist: 0, check: 1 }),
			ev({ ev: "check", slug: "q", tier: "a middling trial", dc: 15, trial: "the last stroke", kind: "finale" }),
		],
		"neutral",
	);
	assert.equal(finale.undertakings.q.checkFired, true, "a finale fires once");
});

ok("rollBand: margin bands with natural overrides; ticks bounded", () => {
	assert.equal(rollBand(20, 25), "great", "a natural 20 is always a triumph");
	assert.equal(rollBand(1, 5), "setback", "a natural 1 always stumbles");
	assert.equal(rollBand(19, 15), "success");
	assert.equal(rollBand(20, 15), "great");
	assert.equal(rollBand(15, 15), "success");
	assert.equal(rollBand(14, 15), "cost");
	assert.equal(rollBand(11, 15), "cost");
	assert.equal(rollBand(10, 15), "setback");
	assert.deepEqual(
		[BAND_TICKS.great, BAND_TICKS.success, BAND_TICKS.cost, BAND_TICKS.setback],
		[3, 2, 2, -1],
	);
	assert.deepEqual(TIERS[4], { tier: "an easy trial", dc: 10 });
	assert.equal(TIERS[8].dc, 20);
});

ok("derive: a trial folds check → pendingRoll → roll clears it; grit and cold streaks tracked", () => {
	const pending = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 4, twist: 0, check: 2 }),
			ev({ ev: "quest_tick", slug: "q", add: 2, filled: 2, size: 4 }),
			ev({ ev: "check", slug: "q", tier: "an easy trial", dc: 10, trial: "truing the wheel", edge: "favored", edgeReason: "good tools" }),
		],
		"neutral",
	);
	assert.equal(pending.undertakings.q.check, 2);
	assert.equal(pending.undertakings.q.checkFired, true);
	assert.equal(pending.undertakings.q.beatsDone, 2, "the trial consumes the beat");
	assert.equal(pending.pendingRoll?.slug, "q");
	assert.equal(pending.pendingRoll?.dc, 10);
	assert.equal(pending.pendingRoll?.edge, "favored");

	const rolled = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 4, twist: 0, check: 2 }),
			ev({ ev: "check", slug: "q", tier: "an easy trial", dc: 10, trial: "t" }),
			ev({ ev: "roll", slug: "q", dice: [7, 3], kept: 7, dc: 10, band: "setback", grit: true }),
			ev({ ev: "outcome", slug: "q", band: "setback", add: -1, text: "slips" }),
			ev({ ev: "outcome", slug: "q", band: "setback", add: -1, text: "slips again" }),
		],
		"neutral",
	);
	assert.equal(rolled.pendingRoll, undefined, "the roll clears the trial");
	assert.equal(rolled.undertakings.q.gritUsed, true);
	assert.equal(rolled.undertakings.q.coldStreak, 2, "two straight setbacks — the fates should relent");
	const warmed = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 4, twist: 0, check: 2 }),
			ev({ ev: "outcome", slug: "q", band: "setback", add: -1, text: "s" }),
			ev({ ev: "outcome", slug: "q", band: "cost", add: 2, text: "c" }),
		],
		"neutral",
	);
	assert.equal(warmed.undertakings.q.coldStreak, 0, "any brighter band breaks the streak");
});

ok("derive: setback clamps at zero; fate_skipped neutralizes the twist", () => {
	const st = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 4, twist: 2 }),
			ev({ ev: "outcome", slug: "q", band: "setback", add: -1, text: "worse" }),
			ev({ ev: "fate_skipped", slug: "q" }),
		],
		"neutral",
	);
	assert.equal(st.undertakings.q.filled, 0, "never below zero");
	assert.equal(st.undertakings.q.twist, 0, "skipped fate means a plain quest");
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
	ok(`config[${worldId}]: constitution, world, laws, moods and sites load`, () => {
		assert.ok(cfg.constitution.length > 100, "constitution missing or empty");
		assert.equal(cfg.world.id, worldId);
		assert.ok(cfg.world.title.length > 0 && cfg.world.voice.length > 0);
		assert.ok(cfg.world.body.length > 100, "world body suspiciously short");
		assert.ok(cfg.world.laws.length > 200, "laws file missing or suspiciously short");
		assert.match(cfg.world.laws, /What goes wrong here/i);
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
	const p = assembleSystemPrompt(config, {
		state: banned,
		engineNonce: "t3stn0nc3",
		resumedFrom: "2026-08-01T10:00:00.000Z",
		justArrived: false,
	});
	ok("prompt: layers in order (laws between world and mood)", () => {
		const layers = [...p.matchAll(/<section layer="([^"]+)">/g)].map((m) => m[1]);
		assert.deepEqual(layers, [
			"0 · constitution",
			"1 · world: dragon-realm",
			"1½ · the laws of this world",
			"2 · mood: angry",
			"3 · the seeker's standing",
			"4 · control protocol",
		]);
		assert.match(p, /Oath-magic/); // the laws body itself is in the layer
	});
	ok("prompt: standing shows name, ban, counters, resume line", () => {
		assert.match(p, /The seeker before you: Bbaba\./);
		assert.match(p, /You have BARRED this seeker/);
		assert.match(p, /1 messages, 0 searches granted, 0 requests refused/);
		assert.match(p, /they last spoke 2026-08-01T10:00:00\.000Z/);
		assert.doesNotMatch(p, /just arrived/);
	});
	ok("prompt: protocol names every game tool and the anti-theater rule", () => {
		for (const tool of [
			"set_mood", "find_text", "find_picture", "find_video", "grant_redemption", "record_name",
			"set_place", "chronicle_place", "update_place", "record_persona", "move_persona",
			"grant_quest", "attempt_quest", "update_quest", "redeem_quest", "add_item", "offer_choices",
		]) {
			assert.match(p, new RegExp(tool));
		}
		assert.match(p, /it has NOT happened/);
		assert.match(p, /set_mood\("angry"\)/);
		assert.match(p, /\[engine:t3stn0nc3\]/);
		assert.match(p, /a stretch of work is a TRIAL/);
		assert.match(p, /Never roll for them/);
		assert.match(p, /COMPLETING stroke of every task/);
		assert.match(p, /LOGIC OVER BOLDNESS/);
		assert.match(p, /the offer lapses/);
		assert.match(p, /WORK ADVANCED ON A TASK, A TRIAL, OR DICE/);
		assert.match(p, /dice you announce in words are dice nobody can cast/);
		assert.match(p, /A list of courses in prose alone is NOT a choice/);
		assert.match(p, /that reply MUST include attempt_quest/);
		assert.doesNotMatch(p, /Messages beginning with \[engine\] /); // the unmarked form must be gone
		assert.match(p, /story's author/);
		assert.match(p, /invent the tale at once/);
	});
	const fresh = assembleSystemPrompt(config, { state: derive([], "neutral"), engineNonce: "t3stn0nc3", justArrived: true });
	ok("prompt: fresh sitting shows arrival note, no resume line", () => {
		assert.match(fresh, /just arrived/);
		assert.doesNotMatch(fresh, /last spoke/);
		assert.match(fresh, /an unnamed stranger/);
	});
	ok("prompt: archive recall appears as its own hidden layer only when present", () => {
		const withRecall = assembleSystemPrompt(config, {
			state: derive([], "neutral"),
			engineNonce: "t3stn0nc3",
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
			engineNonce: "t3stn0nc3",
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

	ok("gmchat: parseFatePlan accepts a fair plan and stamps ids", () => {
		const raw = JSON.stringify({
			complication: "The axle snaps at the ford.",
			clues: ["a hairline crack in the axle", "the wheel wobbles on stones"],
			options: [
				{ label: "Lash it with rope", risk: "risky", promise: "quick and cheap", band: "clean", reveal: "It holds.", reason: "rope is honest — iron rusts honestly" },
				{ label: "Ford the stream unaided", risk: "desperate", promise: "no delay", band: "fail", reveal: "The cart drowns.", reason: "rivers in spring run high and mean" },
				{ label: "Beg the smith", risk: "safe", promise: "sure but slow", band: "cost", reveal: "He helps, for the morning.", reason: "the seven houses feud politely" },
				{ label: "Use the spare axle", risk: "safe", promise: "sound repair", band: "windfall", reveal: "Better than before.", loot: "a spare iron pin", reason: "carts break on real stones", requires: { item: "spare axle" } },
			],
		});
		const plan = gm.parseFatePlan(raw, "material failure");
		assert.ok(plan, "a fair plan must parse");
		assert.equal(plan!.suit, "material failure");
		assert.deepEqual(plan!.options.map((option: { id: number }) => option.id), [1, 2, 3, 4]);
		assert.equal(plan!.clues.length, 2);
		assert.equal(plan!.options[3].requires?.item, "spare axle");
	});

	ok("gmchat: parseFatePlan rejects unfair or malformed plans", () => {
		const base = {
			complication: "Trouble.",
			clues: ["sign one", "sign two"],
			options: [
				{ label: "A", risk: "risky", promise: "p", band: "clean", reveal: "r", reason: "law" },
				{ label: "B", risk: "risky", promise: "p", band: "cost", reveal: "r", reason: "law" },
			],
		};
		const variant = (patch: (copy: any) => void) => {
			const copy = JSON.parse(JSON.stringify(base));
			patch(copy);
			return gm.parseFatePlan(JSON.stringify(copy), "s");
		};
		assert.ok(gm.parseFatePlan(JSON.stringify(base), "s"), "the base plan is fair");
		assert.equal(variant((c) => (c.options[1].band = "fail")), null, "fail on a non-desperate path");
		assert.equal(variant((c) => { c.options[0].risk = "safe"; c.options[0].band = "setback"; c.options[1].band = "windfall"; c.options[1].loot = "x"; }), null, "safe may never set back");
		assert.equal(variant((c) => (c.options[0].band = "cost")), null, "no good path at all");
		assert.equal(variant((c) => (c.clues = ["only one"])), null, "one clue is not a telegraph");
		assert.equal(variant((c) => { c.options[0].band = "windfall"; delete c.options[0].loot; }), null, "windfall must name loot");
		assert.equal(variant((c) => (c.options = [c.options[0]])), null, "one option is no choice");
		assert.equal(
			variant((c) => {
				c.options[0].requires = { item: "rope" };
				c.options[1].requires = { persona: "hedda" };
				c.options.push({ label: "C", risk: "risky", promise: "p", band: "clean", reveal: "r", reason: "law" });
			}),
			null,
			"at most one blue option",
		);
		assert.equal(gm.parseFatePlan("no json at all", "s"), null);
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

	ok("world: quest clocks — granted, mirrored, ticked, inserted on legacy, counted, failed", () => {
		world.grantQuest(files, {
			title: "Mend the mill wheel",
			task: "True the warped wheel before market day.",
			reward: "a sack of flour",
			placeSlug: "millbrook-farm",
			clockSize: 6,
		});
		const quest = world.questBySlug(files, "mend-the-mill-wheel");
		assert.ok(quest);
		assert.deepEqual(quest!.clock, { filled: 0, size: 6 });
		assert.equal(quest!.task, "True the warped wheel before market day.");
		assert.equal(world.setQuestClock(files, "mend-the-mill-wheel", 4, 6), true);
		assert.deepEqual(world.questBySlug(files, "mend-the-mill-wheel")!.clock, { filled: 4, size: 6 });
		// Legacy quest (granted without a clock): the mirror line is inserted.
		assert.equal(world.questBySlug(files, "carrots-for-millbrook")!.clock, null);
		assert.equal(world.setQuestClock(files, "carrots-for-millbrook", 2, 4), true);
		assert.deepEqual(world.questBySlug(files, "carrots-for-millbrook")!.clock, { filled: 2, size: 4 });
		assert.ok(world.countOpenQuests(files) >= 1);
		const openBefore = world.countOpenQuests(files);
		assert.equal(world.setQuestStatus(files, "mend-the-mill-wheel", "failed", "the wheel shattered"), true);
		assert.equal(world.questBySlug(files, "mend-the-mill-wheel")!.status, "failed");
		assert.equal(world.countOpenQuests(files), openBefore - 1, "failed quests leave the open count");
		assert.ok(!world.openQuestLines(files).some((line: string) => line.includes("mill-wheel")), "failed quests leave open matters");
		assert.equal(world.hasItem(files, "three copper pennies"), true);
		assert.equal(world.hasItem(files, "the crown of aeldenmoor"), false);
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
