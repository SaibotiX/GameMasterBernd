/**
 * Unit tests for the world-console extension — pure modules only, no pi
 * runtime needed:  node extension/test/unit.ts
 *
 * Covers: ledger derivation + code-owned invariants (ban/redemption),
 * branch isolation, config-loader equivalence with the app's original
 * loader, prompt assembly, and the live MediaWiki search adapter.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(EXT, ".."); // the IA folder: config/, data/, tools/ live here

const {
	derive, describeEvent, planSetMood, planRedemption, asGameEvent,
	rollBand, BAND_TICKS, TIERS, drawQuestShape, LEDGER_TYPE, LEGACY_MOOD_TYPE,
	renown, drawPerilTier, drawFuseTurns, MAX_WOUNDS,
} = await import(join(EXT, "ledger.ts"));
const { listWorldIds, loadConfig, moodIdsBySeverity } = await import(join(EXT, "config.ts"));
const { readWorldChoice, writeWorldChoice } = await import(join(EXT, "world.ts"));
const { assembleSystemPrompt, unfinishedWorkRefusal } = await import(join(EXT, "prompt.ts"));
const { searchText } = await import(join(EXT, "textsearch.ts"));
const { wrapText, gridBox } = await import(join(EXT, "ui.ts"));
const {
	WORLD_CONSOLE_MARK, fitArt, bannerHint,
	PI_BUILTIN_COMMANDS, HIDDEN_EXTRA_COMMANDS, PLAYER_COMMANDS,
	playerGate, filterPlayerSuggestions,
} = await import(join(EXT, "player.ts"));

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
		wounds: 0,
		dead: false,
		untakenOffers: [],
		tally: {
			granted: 0, done: 0, rewarded: 0, failed: 0, shelved: 0, revived: 0,
			placesVisited: 0, placesChronicled: 0, personasMet: 0, items: 0,
			picks: 0, rolls: 0, perils: 0, truthsBound: 0,
		},
		score: 0,
		level: 1,
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
	assert.deepEqual(mid.recentShapes, [{ clock: 6, twist: 2, check: 0, mids: [], selfSet: undefined }]);
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

ok("drawQuestShape: finale always armed; opening twists; difficulty, cooldowns and the ≤1-autoresolve map hold", () => {
	// Exhaustive-ish rand functions: every constant residue pattern.
	const every = (n: number) => Array.from({ length: n }, (_, i) => (k: number) => i % k);
	const draw = (
		opts: Partial<Parameters<typeof drawQuestShape>[0]>,
		rand: (n: number) => number,
	) => drawQuestShape({ level: 1, last: undefined, selfSet: false, opening: false, rand, ...opts });
	for (const rand of every(12)) {
		// Every draw arms a finale — the completing stroke is always contested.
		assert.ok(draw({ opening: true }, rand).check > 0);
		// The opening is scripted: the first GIVEN quest carries a twist on a 6+ clock.
		const opening = draw({ opening: true }, rand);
		assert.ok(opening.twist > 0, "opening twistless");
		assert.ok(opening.clock >= 6, "opening clock too small to twist");
		// Self-set tasks carry no twist (their finale still stands).
		const selfSet = draw({ selfSet: true }, rand);
		assert.equal(selfSet.twist, 0);
		assert.ok(selfSet.check > 0);
		// Cooldown: no twist right after a twisted quest.
		assert.equal(draw({ last: { clock: 6, twist: 2, check: 1 } }, rand).twist, 0);
		// Never the identical (clock, twistiness) twice.
		const afterSmall = draw({ last: { clock: 4, twist: 0, check: 1 } }, rand);
		assert.ok(!(afterSmall.clock === 4 && afterSmall.twist === 0), "identical shape repeated");
		// The keeper's named weight pins the clock.
		assert.equal(draw({ weight: "hard" }, rand).clock, 8);
		assert.equal(draw({ weight: "easy", last: { clock: 6, twist: 2, check: 1 } }, rand).clock, 4);
		// The ≤1-autoresolve map: twist-free clocks carry drawn checkpoints.
		assert.deepEqual(draw({ selfSet: true, weight: "easy" }, rand).mids, []);
		const m6 = draw({ selfSet: true, weight: "middling" }, rand);
		assert.ok(m6.mids!.length === 1 && [1, 2].includes(m6.mids![0]), `6-clock mids ${m6.mids}`);
		const m8 = draw({ selfSet: true, weight: "hard" }, rand);
		assert.equal(m8.mids!.length, 2, "an 8-clock without twist needs two checkpoints");
		assert.ok(m8.mids![0] < m8.mids![1] && m8.mids!.every((beat: number) => beat >= 1 && beat <= 3));
		// Twisted 8-clocks keep one checkpoint (beat 1; clues at 2, twist at 3).
		const hardTwist = draw({ opening: true, weight: "hard" }, rand);
		assert.equal(hardTwist.clock, 8);
		assert.equal(hardTwist.twist, 3);
		assert.deepEqual(hardTwist.mids, [1]);
	}
	// Difficulty follows renown: at level 5 a rand that lands past easy+middling draws hard.
	assert.equal(draw({ level: 5 }, () => 99).clock, 8);
	assert.equal(draw({ level: 1 }, () => 0).clock, 4);
});

ok("renown & perils: score/level math, severity and fuse draws stay in bounds", () => {
	assert.deepEqual(renown({ rewarded: 0, failed: 0, placesVisited: 0, personasMet: 0 }), { score: 0, level: 1 });
	assert.deepEqual(renown({ rewarded: 2, failed: 1, placesVisited: 3, personasMet: 2 }), { score: 14, level: 2 });
	assert.equal(renown({ rewarded: 20, failed: 5, placesVisited: 30, personasMet: 30 }).level, 5, "level caps at 5");
	for (const level of [1, 3, 5]) {
		for (const rand of [() => 0, () => 50, () => 99, (n: number) => n - 1]) {
			assert.ok([4, 6, 8].includes(drawPerilTier(level, rand)));
			const turns = drawFuseTurns(level, (n: number) => rand(n) % n || 0);
			assert.ok(turns >= 4 && turns <= 12, `fuse ${turns} out of bounds`);
		}
	}
	assert.equal(MAX_WOUNDS, 3);
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

ok("derive: twist_dropped dissolves a standing twist, opens the sheet, frees the gate", () => {
	const plan = {
		suit: "material failure",
		complication: "The orchard is warded.",
		clues: ["c1", "c2"],
		options: [
			{ id: 1, label: "A", risk: "risky", promise: "p", band: "clean", reveal: "r", reason: "law" },
			{ id: 2, label: "B", risk: "safe", promise: "p", band: "cost", reveal: "r", reason: "law" },
		],
	};
	const st = derive(
		[
			ev({ ev: "quest_shape", slug: "apple", clock: 6, twist: 2, check: 1 }),
			ev({ ev: "quest_tick", slug: "apple", add: 2, filled: 2, size: 6 }),
			ev({ ev: "fate", slug: "apple", plan }),
			ev({ ev: "complication", slug: "apple", text: plan.complication, options: [] }),
			ev({ ev: "twist_dropped", slug: "apple", reason: "the invasion overtook the garden" }),
		],
		"neutral",
	);
	assert.equal(st.pendingChoice, undefined, "the dropped twist frees the gate");
	assert.equal(st.undertakings.apple.twist, 0, "the quest continues twist-free");
	assert.equal(st.undertakings.apple.resolved, true, "the sealed plan opens (A4)");
	assert.ok(st.undertakings.apple.plan, "the plan stays on record");
	assert.match(describeEvent({ ev: "twist_dropped", slug: "apple", reason: "r" }), /dissolves — overtaken/);
});

ok("derive: checkpoints fold and fire in order; the finale flag stays untouched", () => {
	const st = derive(
		[
			ev({ ev: "quest_shape", slug: "q", clock: 8, twist: 0, check: 1, mids: [3, 1] }),
			ev({ ev: "check", slug: "q", tier: "a hard trial", dc: 20, trial: "the first stretch", kind: "checkpoint" }),
			ev({ ev: "roll", slug: "q", dice: [15], kept: 15, dc: 20, band: "cost", grit: false }),
			ev({ ev: "outcome", slug: "q", band: "cost", add: 2, text: "t" }),
		],
		"neutral",
	);
	assert.deepEqual(st.undertakings.q.mids, [1, 3], "mids sort on fold");
	assert.equal(st.undertakings.q.checkpointsFired, 1);
	assert.equal(st.undertakings.q.checkFired, false, "a checkpoint never spends the finale");
	assert.equal(st.undertakings.q.beatsDone, 1, "the checkpoint consumes the beat");
});

ok("derive: wounds, healing, death and the peril fuse", () => {
	const hurt = derive(
		[
			ev({ ev: "peril_fuse", at: 0, turns: 5 }),
			ev({ ev: "peril", kind: "a thief's quick hand", tier: "an easy trial", dc: 10, text: "t" }),
			ev({ ev: "check", slug: "", tier: "an easy trial", dc: 10, trial: "t", kind: "peril" }),
			ev({ ev: "roll", slug: "", dice: [2], kept: 2, dc: 10, band: "setback", grit: false }),
			ev({ ev: "outcome", slug: "", band: "setback", add: 0, text: "t" }),
			ev({ ev: "wound", add: 1, reason: "the thief's knife" }),
			ev({ ev: "peril_fuse", at: 6, turns: 7 }),
		],
		"neutral",
	);
	assert.equal(hurt.wounds, 1);
	assert.equal(hurt.tally.perils, 1);
	assert.deepEqual(hurt.fuse, { at: 6, turns: 7 }, "a new fuse winds after the strike");
	assert.equal(hurt.pendingRoll, undefined, "the peril's die resolved");
	assert.equal(Object.keys(hurt.undertakings).length, 0, "a peril binds no quest");
	const healed = derive([ev({ ev: "wound", add: 2, reason: "r" }), ev({ ev: "heal", reason: "a healer's care" })], "n");
	assert.equal(healed.wounds, 1);
	const dead = derive(
		[ev({ ev: "wound", add: 2, reason: "r" }), ev({ ev: "wound", add: 1, reason: "r" }), ev({ ev: "death", reason: "the beast" })],
		"n",
	);
	assert.equal(dead.wounds, MAX_WOUNDS);
	assert.equal(dead.dead, true);
	assert.match(describeEvent({ ev: "death", reason: "the beast" }), /tale ends/);
});

ok("derive: untaken offers accumulate, anchor to their place, and /quest accept removes them", () => {
	const options = [
		{ id: 1, label: "The wolf hunt", risk: "", promise: "" },
		{ id: 2, label: "The flooded cellar", risk: "", promise: "" },
		{ id: 3, label: "The stolen bell", risk: "", promise: "" },
	];
	const lapsed = derive(
		[ev({ ev: "offer", text: "Which task calls?", options, place: "millbrook" }), ev({ ev: "offer_dropped" })],
		"n",
	);
	assert.equal(lapsed.untakenOffers.length, 1);
	assert.equal(lapsed.untakenOffers[0].n, 1);
	assert.equal(lapsed.untakenOffers[0].place, "millbrook");
	assert.equal(lapsed.untakenOffers[0].options.length, 3, "all courses untaken on a lapse");
	const picked = derive(
		[
			ev({ ev: "offer", text: "Which task calls?", options, place: "millbrook" }),
			ev({ ev: "pick", slug: "", option: 2, label: "The flooded cellar" }),
		],
		"n",
	);
	assert.equal(picked.untakenOffers[0].options.length, 2, "the picked course is not untaken");
	assert.ok(!picked.untakenOffers[0].options.some((o: { id: number }) => o.id === 2));
	const taken = derive(
		[
			ev({ ev: "offer", text: "Which task calls?", options, place: "millbrook" }),
			ev({ ev: "offer_dropped" }),
			ev({ ev: "offer_taken", n: 1, option: 1 }),
			ev({ ev: "offer_taken", n: 1, option: 3 }),
		],
		"n",
	);
	assert.deepEqual(
		taken.untakenOffers[0].options.map((o: { id: number }) => o.id),
		[2],
		"accepted courses leave the untaken list",
	);
});

ok("derive: the tally counts everything and renown follows it", () => {
	const st = derive(
		[
			ev({ ev: "quest", action: "granted", title: "A" }),
			ev({ ev: "quest", action: "done", title: "A" }),
			ev({ ev: "quest", action: "rewarded", title: "A" }),
			ev({ ev: "quest", action: "granted", title: "B" }),
			ev({ ev: "quest", action: "failed", title: "B" }),
			ev({ ev: "quest", action: "shelved", title: "C" }),
			ev({ ev: "quest", action: "revived", title: "C" }),
			ev({ ev: "place", slug: "p1", title: "P1" }),
			ev({ ev: "place", slug: "p2", title: "P2" }),
			ev({ ev: "place", slug: "p1", title: "P1" }), // a return is not a new place
			ev({ ev: "place_chronicled", slug: "afar", title: "Afar" }),
			ev({ ev: "persona", name: "Marta", place: "p1" }),
			ev({ ev: "persona", name: "Marta", place: "p1" }),
			ev({ ev: "item", text: "a rope" }),
			ev({ ev: "pick", slug: "x", option: 1, label: "l" }),
			ev({ ev: "roll", slug: "x", dice: [9], kept: 9, dc: 10, band: "cost", grit: false }),
			ev({ ev: "truth", text: "T.", source: "decree" }),
		],
		"n",
	);
	assert.equal(st.tally.granted, 2);
	assert.equal(st.tally.rewarded, 1);
	assert.equal(st.tally.failed, 1);
	assert.equal(st.tally.shelved, 1);
	assert.equal(st.tally.revived, 1);
	assert.equal(st.tally.placesVisited, 2);
	assert.equal(st.tally.placesChronicled, 1);
	assert.equal(st.tally.personasMet, 1);
	assert.equal(st.tally.items, 1);
	assert.equal(st.tally.picks, 1);
	assert.equal(st.tally.rolls, 1);
	assert.equal(st.tally.truthsBound, 1);
	// score = 3*(1 rewarded + 1 failed) + 2 places + 1 persona = 9 → level 1.
	assert.equal(st.score, 9);
	assert.equal(st.level, 1);
	assert.equal(st.undertakings.x.resolved, true, "a pick resolves its twist");
	assert.equal(st.undertakings.x.pickedOption, 1);
});

ok("ui: wrapText and the four-slot board keep honest widths", () => {
	assert.deepEqual(wrapText("a quick brown fox", 7), ["a quick", "brown", "fox"]);
	assert.deepEqual(wrapText("overlongword", 5), ["overl", "ongwo", "rd"]);
	assert.deepEqual(wrapText("", 10), []);
	const box = gridBox(
		[{ lines: ["[1] Rope", "risky · quick"] }, { lines: ["[2] Smith"] }, { lines: ["[3] Ford the stream unaided now"] }],
		33,
	);
	assert.equal(box[0].length, 33, "top border spans the width");
	assert.ok(box.every((line: string) => line.length === 33), "every line spans the width");
	assert.match(box[0], /^╭─+┬─+╮$/);
	assert.match(box.at(-1)!, /^╰─+┴─+╯$/);
	assert.ok(box.some((line: string) => line.includes("[1] Rope")));
	assert.ok(box.some((line: string) => line.includes("├")), "the middle bar divides the rows");
	const height = box.filter((line: string) => line.startsWith("│")).length;
	assert.ok(height >= 3, "cells wrap to multiple rows");
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
			"shelve_quest", "heal_wounds",
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
		assert.match(p, /EFFORT IS THE PRICE/);
		assert.match(p, /Nothing is given to the idle/);
		assert.match(p, /the WORLD ITSELF strikes/);
		assert.match(p, /at three wounds the seeker DIES/);
		assert.match(p, /at most FOUR open matters/);
		assert.match(p, /the offer lapses/);
		assert.match(p, /WORK ADVANCED ON A TASK, A TRIAL, OR DICE/);
		assert.match(p, /dice you announce in words are dice nobody can cast/);
		assert.match(p, /A list of courses in prose alone is NOT a choice/);
		assert.match(p, /that reply MUST include attempt_quest/);
		assert.doesNotMatch(p, /Messages beginning with \[engine\] /); // the unmarked form must be gone
		assert.match(p, /story's author/);
		assert.match(p, /invent the tale at once/);
		assert.match(p, /renown: level 1 of 5/);
		assert.match(p, /The seeker is unhurt/);
		assert.match(p, /NEVER ask the seeker where they are/);
		assert.match(p, /EVERY place the story NAMES gets its page/);
		assert.match(p, /EVERY soul the story NAMES gets their page/);
		assert.match(p, /the moment work is AGREED/);
		assert.match(p, /Engine refusals are COURSE CORRECTIONS/);
		assert.match(p, /never repeat the same failing call unchanged/);
	});

	ok("prompt: WC-10 — the work is scenes, and the refusals redirect the narration", () => {
		assert.match(p, /EVERY scene of effort toward an open task/);
		assert.match(p, /travel legs of an escort or a delivery are its work/);
		const partial = unfinishedWorkRefusal("Escort to Port Ashvin", 2, 6);
		assert.match(partial, /The deed is not done — the work stands at 2\/6/);
		assert.match(partial, /one attempt_quest per scene/);
		assert.match(partial, /NO payment, NO reward, NO closing scene before then/);
		assert.match(partial, /steer it back into the work that remains/);
		const unstarted = unfinishedWorkRefusal("Archive Work", 0, 0);
		assert.match(unstarted, /No work on "Archive Work" is recorded at all/);
		assert.match(unstarted, /NO payment, NO reward, NO closing scene before then/);
	});

	ok("prompt: wounds, a standing gate and death each surface to the keeper", () => {
		const wounded = assembleSystemPrompt(config, {
			state: {
				...derive([ev({ ev: "wound", add: 2, reason: "r" })], "neutral"),
				pendingRoll: { slug: "", tier: "an easy trial", dc: 10, trial: "a thief's quick hand", kind: "peril" },
			},
			engineNonce: "t3stn0nc3",
			justArrived: false,
		});
		assert.match(wounded, /Wounds borne: 2 of 3/);
		assert.match(wounded, /A PERIL bars everything/);
		const gated = assembleSystemPrompt(config, {
			state: {
				...derive([], "neutral"),
				pendingChoice: { kind: "twist", slug: "wagon", text: "t", options: [] },
			},
			engineNonce: "t3stn0nc3",
			justArrived: false,
		});
		assert.match(gated, /A CHOICE stands unresolved on "wagon"/);
		assert.match(gated, /no work anywhere advances/);
		const ended = assembleSystemPrompt(config, {
			state: derive([ev({ ev: "death", reason: "the beast" })], "neutral"),
			engineNonce: "t3stn0nc3",
			justArrived: false,
		});
		assert.match(ended, /3¼ · the tale has ended/);
		assert.match(ended, /narrate only aftermath/i);
		assert.doesNotMatch(p, /the tale has ended/);
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

	ok("gmchat: laneModel routes anthropic side calls through the lane's /side prefix, leaves all else untouched", () => {
		const anthropic = { provider: "anthropic", baseUrl: "https://api.anthropic.com" };
		assert.deepEqual(gm.laneModel(anthropic, "http://gateway:8402"), {
			provider: "anthropic",
			baseUrl: "http://gateway:8402/side",
		}, "side calls carry the tag the ledger subtracts at reconcile (the 2026-08-09 ruling)");
		assert.deepEqual(gm.laneModel(anthropic, "http://gateway:8402/"), {
			provider: "anthropic",
			baseUrl: "http://gateway:8402/side",
		}, "a trailing slash never doubles");
		assert.equal(gm.laneModel(anthropic, undefined), anthropic, "laneless play untouched");
		assert.equal(gm.laneModel(anthropic, ""), anthropic, "an empty env var means unset (the compose forwarding lesson)");
		const foreign = { provider: "openai", baseUrl: "https://api.openai.com" };
		assert.equal(gm.laneModel(foreign, "http://gateway:8402"), foreign, "only anthropic rides the lane");
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
		const repairs = gm.parseGmAnswer(
			'{"say": "The story outran the record.", "bind": null, "invite": false, "fixes": [' +
				'{"kind": "untwist", "title": "The King\'s Apple", "reason": "the invasion overtook the garden (*u45*)"},' +
				'{"kind": "clock", "title": "The King\'s Apple", "filled": 6, "note": "the apple was delivered (*u52*)"}]}',
		);
		assert.deepEqual(
			repairs.fixes.map((fix: { kind: string }) => fix.kind),
			["untwist", "clock"],
			"the stuck-quest repair kinds parse",
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
		assert.equal(
			variant((c) => {
				for (const label of ["C", "D", "E"]) {
					c.options.push({ label, risk: "risky", promise: "p", band: "clean", reveal: "r", reason: "law" });
				}
			}),
			null,
			"five options overflow the four-slot board",
		);
		assert.equal(gm.parseFatePlan("no json at all", "s"), null);
	});

	ok("gmchat: a reason must come FROM the laws — citation is checked mechanically", () => {
		const laws = "Iron rusts within a day of touching river water. Oath-magic binds spoken promises.";
		assert.equal(gm.citesGrounding("the iron rusted overnight, as iron here does", laws), true);
		assert.equal(gm.citesGrounding("bad luck, plain and simple", laws), false, "no shared law word");
		assert.equal(gm.citesGrounding("", laws), false);
		const plan = {
			complication: "The ford's wagon-iron gives way.",
			clues: ["red flakes on the axle", "a damp creak at each turn"],
			options: [
				{ label: "A", risk: "risky", promise: "p", band: "clean", reveal: "r", reason: "iron rusts fast near river water here" },
				{ label: "B", risk: "risky", promise: "p", band: "cost", reveal: "r", reason: "an oath-magic promise still binds the smith" },
			],
		};
		assert.ok(gm.parseFatePlan(JSON.stringify(plan), "s", laws), "grounded reasons pass");
		const ungrounded = JSON.parse(JSON.stringify(plan));
		ungrounded.options[1].reason = "sheer misfortune struck";
		assert.equal(gm.parseFatePlan(JSON.stringify(ungrounded), "s", laws), null, "one uncited reason sinks the plan");
		assert.ok(gm.parseFatePlan(JSON.stringify(ungrounded), "s"), "without grounding the check is off");
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
		assert.equal(quest!.grantedAt, "millbrook-farm", "the granting place is parsed");
		assert.deepEqual(world.openQuestLines(files), ["[open] Return the treasure (id: return-the-treasure)"]);
	});

	ok("world: shelving frees the slot; revival reopens; shelved quests hide from the keeper", () => {
		const openBefore = world.countOpenQuests(files);
		assert.equal(world.setQuestStatus(files, "return-the-treasure", "shelved", "set aside for the wolf hunt"), true);
		assert.equal(world.questBySlug(files, "return-the-treasure")!.status, "shelved");
		assert.equal(world.countOpenQuests(files), openBefore - 1, "shelving frees an open slot");
		assert.ok(
			!world.openQuestLines(files).some((line: string) => line.includes("return-the-treasure")),
			"shelved quests leave the keeper's open matters",
		);
		const shelved = world.shelvedQuests(files);
		assert.equal(shelved.length, 1);
		assert.equal(shelved[0].slug, "return-the-treasure");
		assert.equal(world.setQuestStatus(files, "return-the-treasure", "open", "taken up again"), true);
		assert.equal(world.questBySlug(files, "return-the-treasure")!.status, "open");
		assert.equal(world.countOpenQuests(files), openBefore);
		assert.deepEqual(world.shelvedQuests(files), []);
	});

	ok("world: pages list and read back for /place and /persons", () => {
		const places = world.listPages(files, "places");
		assert.ok(places.some((page: { slug: string }) => page.slug === "millbrook-farm"));
		const millbrook = places.find((page: { slug: string }) => page.slug === "millbrook-farm")!;
		assert.equal(millbrook.title, "Millbrook Farm");
		assert.match(millbrook.firstLine, /carrot farm/);
		assert.match(world.placePage(files, "millbrook-farm"), /## The place/);
		assert.equal(world.placePage(files, "no-such-place"), "");
		const personas = world.listPages(files, "personas");
		assert.ok(personas.some((page: { title: string }) => page.title === "Farmer Aldwin"));
		assert.match(world.personaPage(files, "farmer-aldwin"), /## Who they are/);
	});
}

// ---- 6. asGameEvent guards ------------------------------------------------
ok("asGameEvent: non-custom entries → null", () => {
	assert.equal(asGameEvent(userMsg()), null);
	assert.equal(asGameEvent({ type: "compaction", id: "x" } as never), null);
});

// ---- 7. media search (picture and video live, Commons) --------------------
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

	const vid = await media.searchVideo([{ host: "commons.wikimedia.org" }], "komodo dragon", downloadDir);
	ok("video: commons hit downloads a real short clip with its credit", () => {
		assert.ok(vid, "expected a video result");
		assert.equal(vid!.site, "commons.wikimedia.org");
		assert.ok(vid!.title.length > 0 && vid!.pageUrl.startsWith("https://"));
		assert.ok(vid!.durationSeconds > 0 && vid!.durationSeconds <= 240, `duration out of bounds: ${vid!.durationSeconds}`);
		assert.ok(/\.(webm|ogv|ogg)$/.test(vid!.path), `unexpected container: ${vid!.path}`);
		assert.ok(existsSync(vid!.path), `file missing: ${vid!.path}`);
		assert.ok(statSync(vid!.path).size > 50_000, "downloaded clip suspiciously small");
		assert.ok(vid!.license, "commons files carry a machine-readable license");
	});

	await assert.rejects(
		() => media.searchVideo([{ host: "commons.wikimedia.org" }], "komodo dragon", downloadDir, controller.signal),
		(err: unknown) => err === reason,
	);
	console.log("ok  video: abort propagates the abort reason");
	passed++;
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

// ---- the chronicler round (2026-08-04): names, ventures, the witness ------
{
	const { extractCandidateNames, nameKey } = await import(join(EXT, "names.ts"));

	ok("names: batch-2 misses all caught (souls and places, spoken-of)", () => {
		const known = ["Marta", "The Salt Road North", "Dragon Realm of Aeldenmoor"];
		const u21 =
			"The stables lie just south of here, past the market square—old Torvin keeps them. Tell him Marta sent you. " +
			"They will carry you north on the Salt Road. The Crossed Stones waystone lies a day's ride north. Garrick keeps a small lodge there.";
		const found = extractCandidateNames(u21, known);
		assert.ok(found.includes("Torvin") && found.includes("Garrick") && found.includes("Crossed Stones"));
		assert.ok(!found.some((name) => nameKey(name) === "marta" || nameKey(name) === "salt road"));
	});
	ok("names: clean narration and known-run styles stay silent", () => {
		assert.deepEqual(
			extractCandidateNames("Marta the dye-merchant nods. Promise me you will be careful, Kael.", ["Marta", "Kael"]),
			[],
		);
		assert.deepEqual(
			extractCandidateNames("The pottage is hearty; the bread is warm. You eat slowly and sleep.", []),
			[],
		);
	});
	ok("names: comma breaks a run; joiners hold one together; cap holds", () => {
		const found = extractCandidateNames("I am Bernd, Keeper of the Chronicle. West lies the Vale of Cinders.", []);
		assert.ok(found.includes("Bernd"));
		assert.ok(found.includes("Vale of Cinders"));
		assert.ok(!found.some((name) => name.startsWith("Bernd ")));
		const many = extractCandidateNames(
			"Ada met Bogo, Cyra, Dov, Eron, Fife, Gorm and Hix beyond the Ninth Gate.",
			[],
			6,
		);
		assert.equal(many.length, 6);
	});

	ok("venture: check derives a pending roll with kind and flesh; roll clears it", () => {
		const st = derive(
			[
				ev({ ev: "check", slug: "", tier: "a middling trial", dc: 15, trial: "pick the lock", kind: "venture", flesh: true }),
			],
			"neutral",
		);
		assert.equal(st.pendingRoll?.kind, "venture");
		assert.equal(st.pendingRoll?.flesh, true);
		assert.equal(st.pendingRoll?.slug, "");
		const after = derive(
			[
				ev({ ev: "check", slug: "", tier: "a middling trial", dc: 15, trial: "pick the lock", kind: "venture" }),
				ev({ ev: "roll", slug: "", dice: [12], kept: 12, dc: 15, band: "cost", grit: false }),
				ev({ ev: "outcome", slug: "", band: "cost", add: 0, text: 'the venture "pick the lock" — cost' }),
			],
			"neutral",
		);
		assert.equal(after.pendingRoll, undefined);
		assert.equal(after.wounds, 0); // no flesh on the resolved one, no wound either way from the outcome
	});
	ok("venture: describeEvent names the venture and its stakes", () => {
		const line = describeEvent({
			ev: "check", slug: "", tier: "a hard trial", dc: 20, trial: "lift the purse", kind: "venture", flesh: true,
		});
		assert.match(line, /the seeker's own venture/);
		assert.match(line, /\[venture\]/);
		assert.match(line, /flesh at stake/);
	});

	const { craftChroniclerPage, chroniclerExists, chroniclerPage, extendChronicler, chroniclerCreed } = await import(
		join(EXT, "world.ts")
	);
	const { mkdtempSync, rmSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	ok("chronicler: crafted once, creed fixed, witnessed lines append, never recrafts", () => {
		const root = mkdtempSync(join(tmpdir(), "wc-chronicler-"));
		const world = { root };
		assert.equal(chroniclerExists(world), false);
		assert.equal(
			craftChroniclerPage(world, "Bernd", { shows: "A dry, patient witness.", noted: "The seeker is brisk." }),
			true,
		);
		assert.equal(chroniclerExists(world), true);
		const page = chroniclerPage(world);
		assert.match(page, /^# Bernd/m);
		assert.ok(page.includes(chroniclerCreed("Bernd")));
		assert.match(page, /## How he shows himself to this seeker\nA dry, patient witness\./);
		assert.match(page, /## Witnessed\n$/m);
		extendChronicler(world, 'quest granted: "The Faceless Thief"');
		assert.match(chroniclerPage(world), /· quest granted: "The Faceless Thief"/);
		assert.equal(
			craftChroniclerPage(world, "Bernd", { shows: "Another form.", noted: "Other notes." }),
			false, // the witness does not change his nature mid-tale
		);
		assert.ok(chroniclerPage(world).includes("A dry, patient witness."));
		rmSync(root, { recursive: true, force: true });
	});

	const media2 = await import(join(EXT, "mediasearch.ts"));
	ok("video derivative pick: webm before ogg, largest ≤480p, size ladder honored", () => {
		const webm240 = { src: "a.240p.webm", type: 'video/webm; codecs="vp9"', height: 240, bandwidth: 400_000 };
		const webm480 = { src: "a.480p.webm", type: 'video/webm; codecs="vp9"', height: 480, bandwidth: 900_000 };
		const webm720 = { src: "a.720p.webm", type: 'video/webm; codecs="vp9"', height: 720, bandwidth: 2_000_000 };
		const ogg316 = { src: "a.ogv", type: 'video/ogg; codecs="theora"', height: 316, bandwidth: 1_300_000 };
		// browser-ready webm outranks the taller legacy ogg original
		assert.equal(media2.pickVideoDerivative([ogg316, webm240], 60), webm240);
		// the largest webm that stays ≤480p wins; 720p is never preferred
		assert.equal(media2.pickVideoDerivative([webm240, webm480, webm720], 60), webm480);
		// a long file walks the ladder down until bandwidth × duration fits 30 MB
		assert.equal(media2.pickVideoDerivative([webm240, webm480], 300), webm240);
		// nothing fitting → null (caller skips the candidate)
		assert.equal(media2.pickVideoDerivative([webm720], 3_000), null);
		// non-video rungs (captions etc.) and missing srcs never surface
		assert.equal(media2.pickVideoDerivative([{ type: "text/vtt", src: "a.vtt" }, { type: "video/webm" }], 60), null);
	});
	ok("video credit: extmetadata license kept, artist HTML stripped, absence stays null", () => {
		const credit = media2.videoCredit({
			LicenseShortName: { value: "CC BY-SA 3.0" },
			Artist: { value: '<a href="https://example.org/">The Bearded Filmer</a>' },
		});
		assert.equal(credit.license, "CC BY-SA 3.0");
		assert.equal(credit.credit, "The Bearded Filmer");
		assert.deepEqual(media2.videoCredit(undefined), { license: null, credit: null });
		assert.deepEqual(media2.videoCredit({}), { license: null, credit: null });
	});

	ok("prompt: unpaged names ride the standing layer; venture gate holds; chronicler layer appears", () => {
		const config = loadConfig(BASE, "dragon-realm");
		const base = derive([], config.world.defaultMood);
		const prompt = assembleSystemPrompt(config, {
			state: { ...base, pendingRoll: { slug: "", tier: "an easy trial", dc: 10, trial: "charm the guard", kind: "venture" } },
			engineNonce: "t",
			justArrived: false,
			unpagedNames: ["Garrick", "Crossed Stones"],
			chronicler: "Bernd dwells nowhere because he dwells everywhere.",
		});
		assert.match(prompt, /NAMES THE TELLING HAS SPOKEN THAT STILL LACK PAGES: Garrick, Crossed Stones/);
		assert.match(prompt, /own VENTURE stands untried: charm the guard/);
		assert.match(prompt, /1¾ · the chronicler himself/);
		assert.match(prompt, /YOU NEVER ASK/);
		assert.match(prompt, /stage_trial/);
		const bare = assembleSystemPrompt(config, { state: base, engineNonce: "t", justArrived: true });
		assert.ok(!bare.includes("STILL LACK PAGES"));
		assert.ok(!bare.includes("1¾ · the chronicler himself"));
	});
}

// ---- player mode (R30): banner pieces and the per-world art loader --------
{
	ok("player: art fits whole or not at all; the mark itself fits 80 columns", () => {
		const artWidth = Math.max(...WORLD_CONSOLE_MARK.map((line: string) => line.length));
		assert.ok(artWidth <= 58, `the mark must fit modest terminals (widest line ${artWidth})`);
		assert.deepEqual(fitArt(WORLD_CONSOLE_MARK, 80), WORLD_CONSOLE_MARK);
		assert.deepEqual(fitArt(WORLD_CONSOLE_MARK, artWidth - 1), [], "a cut letterform is breakage, not style");
		assert.deepEqual(fitArt([], 80), []);
	});

	ok("player: the banner hint names / and nothing more (seen-gate ruling)", () => {
		const hint = bannerHint();
		assert.match(hint, /typing \/ lists every command/);
		assert.ok(!hint.includes("mood"), "mood lives in the footer, not the hint");
		assert.ok(!hint.includes("/quest"), "the world is theirs to explore");
	});

	ok("config: per-world banner art and intro load; absences stay quiet", () => {
		const dragon = loadConfig(BASE, "dragon-realm");
		assert.ok(dragon.world.banner.length > 0, "dragon-realm ships banner art");
		assert.ok(dragon.world.banner.every((line: string) => !line.includes("\r") && line === line.trimEnd()));
		assert.ok(Math.max(...dragon.world.banner.map((line: string) => line.length)) <= 58);
		const frontier = loadConfig(BASE, "star-frontier");
		assert.deepEqual(frontier.world.banner, [], "no banner file → the mark takes over");
		// Both worlds wear a face; the face describes, never instructs.
		for (const world of [dragon.world, frontier.world]) {
			assert.ok(world.intro.length > 0, `${world.id} ships an intro`);
			assert.ok(!/you should/i.test(world.intro), "the intro never instructs");
		}
	});

	ok("player: the submit gate refuses the workshop, lets the game and the unknown flow", () => {
		// blocked: pi built-ins off the list, the hidden extras, the bash escape
		for (const text of ["/model claude", "/settings", "/compact", "/limits", "/share", "/quit", "/debug", "  /MODEL x", "!ls -la", "!!rm -rf /", "!"]) {
			assert.ok(playerGate(text) !== null, `must block: ${text}`);
		}
		const notice = playerGate("/model x");
		assert.match(notice ?? "", /\/model is not at this table/);
		assert.match(playerGate("!pwd") ?? "", /behind the curtain/);
		// flowing: the sixteen, prose, unknown /words (the keeper deflects), lone "/"
		for (const text of ["/quest", "/gm the footer is stale", "/pick 2 with care", "/tree", "/new", "/resume", "/worlds star-frontier", "plain words of the tale", "/waves at the guard", "/", "a ! mid-sentence stays talk"]) {
			assert.equal(playerGate(text), null, `must flow: ${text}`);
		}
	});

	ok("player: the popup filters only at the command position", () => {
		const items = [
			{ value: "quest" }, { value: "model" }, { value: "settings" },
			{ value: "gm" }, { value: "tree" }, { value: "limits" }, { value: "worlds" },
		];
		const atCommand = filterPlayerSuggestions(items, "/", "");
		assert.deepEqual(atCommand.map((i) => i.value), ["quest", "gm", "tree", "worlds"]);
		assert.deepEqual(filterPlayerSuggestions(items, "/mo", "").map((i) => i.value), ["quest", "gm", "tree", "worlds"], "prefix narrowing is pi's job; the fence is ours");
		// argument position (text before the token) and paths pass untouched
		assert.equal(filterPlayerSuggestions(items, "te", "/web ").length, items.length);
		assert.equal(filterPlayerSuggestions(items, "/etc/hosts", "").length, items.length, "a path is not a command");
		assert.equal(filterPlayerSuggestions(items, "/mo", "tell me about ").length, items.length);
	});

	ok("player: the block list holds pi's whole built-in set (upgrade drift turns this red)", async () => {
		// unit.ts stays pi-runtime-free; this reads pi's command TABLE as a
		// file, resolved through the pinned binary on PATH — the same pi the
		// probes boot. Drift in either direction re-judges R30's lists.
		const { execSync } = await import("node:child_process");
		const { realpathSync } = await import("node:fs");
		const { pathToFileURL } = await import("node:url");
		const piBin = realpathSync(execSync("command -v pi", { encoding: "utf8" }).trim());
		const table = join(dirname(piBin), "core", "slash-commands.js");
		const mod = (await import(pathToFileURL(table).href)) as {
			BUILTIN_SLASH_COMMANDS: { name: string }[];
		};
		const live = mod.BUILTIN_SLASH_COMMANDS.map((c) => c.name).sort();
		assert.deepEqual(live, [...PI_BUILTIN_COMMANDS].sort(), "pi's built-in set moved — re-judge R30's block and allow lists");
		for (const name of PLAYER_COMMANDS.filter((n) => PI_BUILTIN_COMMANDS.includes(n))) {
			assert.ok(live.includes(name), `allowlisted built-in vanished from pi: /${name}`);
		}
		assert.ok(HIDDEN_EXTRA_COMMANDS.includes("limits"), "the icebox rider expects /limits named here");
		assert.equal(PLAYER_COMMANDS.length, 16, "R30 revised 2026-08-10: the player's sixteen");
		assert.ok(PLAYER_COMMANDS.includes("worlds"), "the sixteenth command is /worlds");
	});

	ok("worlds: the console lists exactly the config worlds; the /worlds choice round-trips", () => {
		assert.deepEqual(listWorldIds(BASE), ["dragon-realm", "star-frontier"], "annex files (.laws/.intro/.banner) are not worlds");
		const dir = mkdtempSync(join(tmpdir(), "wc-choice-"));
		try {
			const file = join(dir, "world-choice");
			assert.equal(readWorldChoice(file), undefined, "no file → no choice");
			writeWorldChoice(file, "star-frontier");
			assert.equal(readWorldChoice(file), "star-frontier");
			writeFileSync(file, " \n");
			assert.equal(readWorldChoice(file), undefined, "blank → no choice");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}

console.log(`\n${passed} checks passed`);
