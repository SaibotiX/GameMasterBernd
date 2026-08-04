/**
 * The game ledger, ported to pi: game events live inside the pi session file
 * as custom entries (customType "world-console.ledger"), so the ledger is
 * per session by construction — /new starts a fresh one, /fork copies one,
 * and /tree rewinds one, because state is always derived from the entries on
 * the CURRENT branch (pi's sessionManager.getBranch()).
 *
 * This module is pure and pi-free so plain `node` can unit-test it:
 *  - derive(entries, defaultMood): fold branch entries into DerivedState
 *  - planSetMood / planRedemption: the code-owned invariants from the app's
 *    Ledger (reaching the angriest mood always records the ban in the same
 *    step; redemption is a no-op unless currently banned)
 *
 * Unlike the retired app's global ledger.jsonl there is exactly one world per ledger: the
 * first event of every session is a "world" stamp, and resuming a session
 * keeps its stamped world no matter what --world says (worlds never mix).
 */

export const LEDGER_TYPE = "world-console.ledger";
/** Mood entries written by the pre-ledger milestone build; still honored. */
export const LEGACY_MOOD_TYPE = "world-console.mood";

/** One option of a fate plan. Visible fields are shown to the seeker before
 * the pick; `band`, `reveal`, `reason` (and `loot`) are the hidden answer
 * sheet, revealed only on resolution. */
export interface FateOption {
	id: number;
	label: string;
	risk: "safe" | "risky" | "desperate";
	/** Honest effect promise shown up front (the stakes contract). */
	promise: string;
	/** Hidden outcome band. */
	band: "clean" | "cost" | "setback" | "fail" | "windfall";
	/** Hidden: what actually happens when picked. */
	reveal: string;
	/** Hidden: why — must trace to a world law or palette entry. */
	reason: string;
	/** Windfall only: the item that lands in the seeker's coffer. */
	loot?: string;
	/** Blue option: rendered only when the chronicle proves the requirement. */
	requires?: { item?: string; persona?: string; place?: string };
}

/** A pre-decided complication for one quest, produced by the fate planner. */
export interface FatePlan {
	/** The trouble kind the engine drew (material failure, persona interruption, …). */
	suit: string;
	/** The twist itself, 1–2 sentences, visible when presented. */
	complication: string;
	/** Two warning signs the keeper weaves in BEFORE the twist. */
	clues: string[];
	options: FateOption[];
}

/** The visible face of an option as presented to the seeker. */
export interface PresentedOption {
	id: number;
	label: string;
	risk: string;
	promise: string;
	/** The chronicle fact that unlocked this blue option, if any. */
	unlockedBy?: string;
}

export type GameEvent =
	| { ev: "world"; world: string }
	| { ev: "player_named"; name: string }
	| { ev: "mood_set"; mood: string; reason: string }
	| { ev: "websearch_ban" }
	| { ev: "redemption"; reason: string }
	| { ev: "search_requested"; query: string; kind?: string }
	| { ev: "search_performed"; query: string; source: string; ref: string; title: string; kind?: string }
	| { ev: "search_refused"; category: string; kind?: string }
	| { ev: "search_failed"; reason: string; kind?: string }
	/** A fact settled at the GM table: engine's conviction, player's decree, or an evidence-backed amendment (ref = the *uN* record entry that proves it). */
	| { ev: "truth"; text: string; source: "conviction" | "decree" | "amendment"; ref?: number }
	/** Canon withdrawn because an amendment superseded it. */
	| { ev: "truth_retracted"; text: string }
	/** Which world-file chronicle this story writes to ("" = the legacy shared folder). Stamped once; /fork copies it, /new starts a fresh one. */
	| { ev: "chronicle"; key: string }
	/** The party moved to a place (world files hold the place's page). */
	| { ev: "place"; slug: string; title: string }
	/** A place written into the chronicle from afar — the party did not move. */
	| { ev: "place_chronicled"; slug: string; title: string }
	/** A notable soul recorded or moved in the world files. */
	| { ev: "persona"; name: string; place: string; note?: string }
	/** Quest lifecycle mirror of quests.md. "shelved" = set aside to free one of
	 * the four slots (only the seeker may take it up again); "revived" undoes it. */
	| { ev: "quest"; action: "granted" | "done" | "rewarded" | "failed" | "shelved" | "revived"; title: string }
	/** Loot, pay or gifts mirrored from items.md. */
	| { ev: "item"; text: string }
	/** A granted quest's drawn shape: clock size, (hidden) twist beat — 0 = none —
	 * and the finale flag. `mids` are (hidden) mid-quest checkpoint-trial beats
	 * (the ≤1-autoresolve rule); `selfSet` marks the seeker's own tasks (the
	 * scripted-opening rule needs to know). Older entries lack the new fields. */
	| {
			ev: "quest_shape";
			slug: string;
			clock: number;
			twist: number;
			check?: number;
			mids?: number[];
			selfSet?: boolean;
	  }
	/** One beat of real work on a quest; add is the segment delta. */
	| { ev: "quest_tick"; slug: string; add: number; filled: number; size: number; note?: string }
	/** The sealed fate plan for a quest's twist (hidden answer sheet; veiled in /ledger). */
	| { ev: "fate"; slug: string; plan: FatePlan }
	/** The fate planner could not be reached — the quest continues plain. */
	| { ev: "fate_skipped"; slug: string }
	/** A twist presented to the seeker: the visible options only. */
	| { ev: "complication"; slug: string; text: string; options: PresentedOption[] }
	/** The seeker's pick (option id from the presented list; slug "" = an open offer). */
	| { ev: "pick"; slug: string; option: number; label: string; extra?: string }
	/** Open alternatives laid before the seeker (a task board, a fork in the
	 * road) — no hidden outcomes; purely a clean way to point at a course.
	 * `place` (the party's place slug at laying) anchors untaken courses: only
	 * there may the seeker later take one up via /quest accept. */
	| { ev: "offer"; text: string; options: PresentedOption[]; place?: string }
	/** The seeker spoke past an open offer — it lapses (offers never bind). */
	| { ev: "offer_dropped" }
	/** A formerly offered, untaken course was taken up via /quest accept
	 * (n = the offer's ordinal on this branch, option = the course's id). */
	| { ev: "offer_taken"; n: number; option: number }
	/** A trial bars a stretch of work: the stakes contract, announced openly
	 * (tier and DC public before the die is cast — only the die is unknown).
	 * kind "finale" (default) contests the completing stroke and fires once;
	 * kind "hazard" contests a hindered attempt and may recur; kind
	 * "checkpoint" contests a drawn mid-quest beat (the ≤1-autoresolve rule);
	 * kind "peril" is a world interruption — slug "" (bound to no quest);
	 * kind "venture" is the seeker's own risky deed outside granted work
	 * (G17, 2026-08-04) — slug "", staged by the keeper via stage_trial;
	 * `flesh` marks a venture whose declared stakes include harm (a setback
	 * then wounds +1 — bounded, F5). */
	| {
			ev: "check";
			slug: string;
			tier: string;
			dc: number;
			trial: string;
			kind?: "finale" | "hazard" | "checkpoint" | "peril" | "venture";
			edge?: "favored" | "hindered";
			edgeReason?: string;
			flesh?: boolean;
	  }
	/** The die falls: every die thrown (edge shows two, grit rethrows), the
	 * kept face, and the band the margin earned. Engine-rolled, never narrated. */
	| { ev: "roll"; slug: string; dice: number[]; kept: number; dc: number; band: string; grit: boolean }
	/** The engine's resolution of a pick or a roll: band is public once resolved. */
	| { ev: "outcome"; slug: string; band: string; add: number; text: string }
	/** A woven or presented twist dissolves without a pick — a GM-table repair
	 * for records the played story outran (a crash, a lost presentation, the
	 * fiction moving past the garden). The plan opens like any resolved fate. */
	| { ev: "twist_dropped"; slug: string; reason: string }
	/** The fates wind a hidden spring: after `turns` more player messages past
	 * `at`, the world itself strikes. Veiled in /ledger (A4). */
	| { ev: "peril_fuse"; at: number; turns: number }
	/** The world strikes — a code-drawn interruption, open stakes (its trial
	 * follows as a check with slug ""). */
	| { ev: "peril"; kind: string; tier: string; dc: number; text: string }
	/** Harm taken (perils wound; three wounds end the tale). */
	| { ev: "wound"; add: number; reason: string }
	/** A wound tended — earned in the fiction, recorded by the engine. */
	| { ev: "heal"; reason: string }
	/** The seeker's tale ends. */
	| { ev: "death"; reason: string };

/** A quest's drawn structure: clock size, twist beat (0 = none), finale flag,
 * and mid-quest checkpoint beats (the ≤1-autoresolve rule). */
export interface QuestShape {
	clock: number;
	twist: number;
	check: number;
	mids?: number[];
	selfSet?: boolean;
}

/** Renown: how far the seeker's deeds have carried them. Score grows with
 * closed quests (won OR lost — losses teach, the Kenshi lesson), places
 * walked and souls met; the level (1–5) steers difficulty and perils. */
export function renown(tally: {
	rewarded: number;
	failed: number;
	placesVisited: number;
	personasMet: number;
}): { score: number; level: number } {
	const score =
		3 * (tally.rewarded + tally.failed) + tally.placesVisited + tally.personasMet;
	return { score, level: Math.min(5, 1 + Math.floor(score / 10)) };
}

/** Difficulty weights per renown level: % chance of an easy(4) / middling(6)
 * / hard(8) clock. Early tales lean easy with a real chance of worse; by the
 * end most work is hard. (The keeper may also NAME a weight when the fiction
 * plainly signals scale — a dragon's head is never an easy clock.) */
export const DIFFICULTY_BY_LEVEL: readonly [number, number, number][] = [
	[55, 35, 10],
	[45, 35, 20],
	[30, 40, 30],
	[20, 35, 45],
	[10, 30, 60],
];

const CLOCK_BY_WEIGHT = { easy: 4, middling: 6, hard: 8 } as const;

/** Pick 4/6/8 from the level's weights with one rand(100) throw. */
function drawClock(level: number, rand: (n: number) => number): number {
	const [easy, middling] = DIFFICULTY_BY_LEVEL[Math.max(0, Math.min(4, level - 1))];
	const throwv = rand(100);
	return throwv < easy ? 4 : throwv < easy + middling ? 6 : 8;
}

/**
 * Draw a quest's shape — the code-owned pacing rules (goals P2/P3/P5, G13).
 * Every shape arms a FINALE (check 1): the completing stroke is always
 * contested. Difficulty comes first (renown weights, or the keeper's named
 * weight), then the twist, then the checkpoint map:
 *  - self-set tasks carry no twist (their finale still stands);
 *  - the OPENING is scripted: a story's first GIVEN quest carries a twist
 *    (RimWorld's lesson) — its clock is at least 6 (4-clocks are too short
 *    to twist);
 *  - no twist right after a twisted quest (P2's breather); otherwise a
 *    6/8-clock twists 2 in 3;
 *  - never the identical (clock, twist) shape twice when avoidable;
 *  - ≤1 AUTORESOLVE per quest: at most one beat may pass as a plain
 *    uncontested tick — every other beat carries a twist, a clue weave or a
 *    drawn CHECKPOINT trial; the soft beat's position varies with the draw.
 * `rand(n)` returns an integer in [0, n) — injected so tests are exact.
 */
export function drawQuestShape(opts: {
	level: number;
	last: QuestShape | undefined;
	selfSet: boolean;
	/** True until a story's first GIVEN quest is granted. */
	opening: boolean;
	/** The keeper's named difficulty, when the fiction plainly signals scale. */
	weight?: "easy" | "middling" | "hard";
	rand: (n: number) => number;
}): QuestShape {
	const { last, selfSet, opening, rand } = opts;
	let clock = opts.weight ? CLOCK_BY_WEIGHT[opts.weight] : drawClock(opts.level, rand);
	// The twist: forced open on the scripted opening, barred after a twisted
	// quest and on self-set tasks, else a 2-in-3 draw on twist-able clocks.
	let twist = 0;
	if (!selfSet) {
		if (opening && !opts.weight && clock < 6) clock = 6; // the opening must be able to twist
		const barred = (last?.twist ?? 0) > 0;
		if (clock >= 6 && !barred) {
			twist = opening || rand(3) < 2 ? (clock === 6 ? 2 : 3) : 0;
		}
	}
	// Never the identical (clock, twist) twice when another size can serve —
	// unless the keeper NAMED the weight (the fiction's scale outranks variety).
	if (!opts.weight && last && last.clock === clock && (last.twist > 0) === (twist > 0)) {
		const alternatives = twist > 0 ? [6, 8] : [4, 6, 8];
		const others = alternatives.filter((size) => size !== clock);
		clock = others[rand(others.length)];
		if (twist > 0) twist = clock === 6 ? 2 : 3;
	}
	// The checkpoint map — one soft beat at most, its place drawn:
	//   4/0 → [] (beat 1 soft, finale ends it)   6/0 → one of beats 1|2
	//   6@2 → [] (the clue beat is the soft one)  8@3 → [1] (clues at 2)
	//   8/0 → two of beats 1..3 (one stays soft)
	let mids: number[] = [];
	if (twist === 0) {
		if (clock === 6) mids = [1 + rand(2)];
		else if (clock === 8) {
			const first = 1 + rand(3);
			const rest = [1, 2, 3].filter((beat) => beat !== first);
			mids = [first, rest[rand(2)]].sort((a, b) => a - b);
		}
	} else if (clock === 8) {
		mids = [1];
	}
	return { clock, twist, check: 1, mids, selfSet };
}

/** The perils a fuse may spring — code-drawn kind, keeper-narrated flesh. */
export const PERILS = [
	"a thief's quick hand",
	"a beast off its usual ground",
	"a sudden sickness",
	"foul weather turning fast",
	"a stranger spoiling for trouble",
	"an old debt resurfacing",
	"a rival moving first",
	"ground giving way",
] as const;

/** Peril severity weights per renown level: % easy / middling / hard. Even a
 * young tale can meet a hard peril — the world owes no one safety. */
export const PERIL_SEVERITY_BY_LEVEL: readonly [number, number, number][] = [
	[60, 30, 10],
	[50, 35, 15],
	[40, 40, 20],
	[30, 40, 30],
	[20, 40, 40],
];

export function drawPerilTier(level: number, rand: (n: number) => number): 4 | 6 | 8 {
	const [easy, middling] = PERIL_SEVERITY_BY_LEVEL[Math.max(0, Math.min(4, level - 1))];
	const throwv = rand(100);
	return throwv < easy ? 4 : throwv < easy + middling ? 6 : 8;
}

/** How many player messages until the world strikes again — shorter as the
 * tale grows (base 8 at level 1 down to 4 at level 5, plus 0–4 of slack). */
export function drawFuseTurns(level: number, rand: (n: number) => number): number {
	const base = Math.max(4, 9 - Math.max(1, Math.min(5, level)));
	return base + rand(5);
}

/** Three wounds end the tale. */
export const MAX_WOUNDS = 3;

/** Named difficulty tiers (bounded accuracy: the words stay meaningful). */
export const TIERS: Record<number, { tier: string; dc: number }> = {
	4: { tier: "an easy trial", dc: 10 },
	6: { tier: "a middling trial", dc: 15 },
	8: { tier: "a hard trial", dc: 20 },
};

/** Margin bands for a kept d20 face against a DC. Naturals override:
 * a 20 is always a triumph, a 1 always a stumble. No numeric modifiers
 * exist in this game — edge is a second die, never arithmetic. */
export function rollBand(kept: number, dc: number): "great" | "success" | "cost" | "setback" {
	if (kept === 20) return "great";
	if (kept === 1) return "setback";
	if (kept >= dc + 5) return "great";
	if (kept >= dc) return "success";
	if (kept >= dc - 4) return "cost";
	return "setback";
}

/** Clock segments each band earns (setback slips backwards, bounded). */
export const BAND_TICKS: Record<string, number> = { great: 3, success: 2, cost: 2, setback: -1 };

/** Branch-derived state of one quest's undertaking (clock + twist machinery).
 * The ledger is authoritative; the clock line in quests.md is a mirror. */
export interface Undertaking {
	slug: string;
	size: number;
	filled: number;
	/** Twist beat (1-based), 0 = plain quest. Neutralized to 0 by fate_skipped. */
	twist: number;
	/** Finale armed (fires on the completing stroke, not at a counted beat). */
	check: number;
	/** Mid-quest checkpoint-trial beats, sorted (the ≤1-autoresolve rule). */
	mids: number[];
	/** How many checkpoint trials have been declared so far. */
	checkpointsFired: number;
	/** Beats consumed so far (ticks + complication + trial presentations). */
	beatsDone: number;
	/** The sealed plan, once woven. */
	plan?: FatePlan;
	/** True once the complication was presented (twists fire once). */
	presented: boolean;
	/** True once a pick resolved the complication (feeds the GM table's
	 * post-resolution answer sheet and the /history stats). */
	resolved: boolean;
	/** The option id the seeker picked, once resolved. */
	pickedOption?: number;
	/** True once the finale was declared (finales fire once). */
	checkFired: boolean;
	/** The one grit token: spent on a reroll, gone for this quest. */
	gritUsed: boolean;
	/** Consecutive setbacks — at two, the fates relent (open advantage). */
	coldStreak: number;
}

/** Counters of everything the tale keeps track of — /history's achievements
 * and the renown score both read from here. */
export interface Tally {
	granted: number;
	done: number;
	rewarded: number;
	failed: number;
	shelved: number;
	revived: number;
	placesVisited: number;
	placesChronicled: number;
	personasMet: number;
	items: number;
	picks: number;
	rolls: number;
	perils: number;
	truthsBound: number;
}

/** A course once laid before the seeker and not taken — reachable again only
 * through /quest accept at the place where it was laid, never through play. */
export interface UntakenOffer {
	/** The offer's ordinal on this branch (1-based). */
	n: number;
	text: string;
	place?: string;
	options: PresentedOption[];
}

export interface DerivedState {
	world?: string;
	playerName?: string;
	mood: string;
	banned: boolean;
	chats: number;
	searches: number;
	refusals: number;
	/** Facts bound at the GM table, in binding order, deduplicated. */
	truths: string[];
	/** Where the party stands, per the newest place event on the branch. */
	place?: { slug: string; title: string };
	/** World-file chronicle key ("" = legacy shared folder); undefined until stamped. */
	chronicle?: string;
	/** ISO timestamp of the newest entry on the branch, if any. */
	lastEntryAt?: string;
	/** Per-quest undertaking state, keyed by quest slug. */
	undertakings: Record<string, Undertaking>;
	/** The one choice awaiting the seeker, if any (P1: max one). A "twist"
	 * binds (its quest holds until picked); an "offer" lapses when the seeker
	 * simply speaks on. */
	pendingChoice?: { kind: "twist" | "offer"; slug: string; text: string; options: PresentedOption[] };
	/** The one trial awaiting the seeker's die, if any (max one, like picks).
	 * slug "" = a peril or a venture (bound to no quest). */
	pendingRoll?: {
		slug: string;
		tier: string;
		dc: number;
		trial: string;
		kind?: "finale" | "hazard" | "checkpoint" | "peril" | "venture";
		edge?: "favored" | "hindered";
		flesh?: boolean;
	};
	/** Shapes of recently granted quests, oldest first (variety guard). */
	recentShapes: QuestShape[];
	/** Trouble kinds of recent fate plans, oldest first (variety guard). */
	recentSuits: string[];
	/** Wounds borne (MAX_WOUNDS ends the tale). */
	wounds: number;
	/** True once the seeker's tale has ended. */
	dead: boolean;
	/** The wound peril fuse, if wound and not yet sprung. */
	fuse?: { at: number; turns: number };
	/** Courses laid and not taken, oldest first. */
	untakenOffers: UntakenOffer[];
	/** Everything counted (achievements + renown inputs). */
	tally: Tally;
	/** Renown score and level (1–5), computed from the tally. */
	score: number;
	level: number;
}

/** Structural subset of pi's SessionEntry that derive() needs. */
export interface EntryLike {
	type: string;
	timestamp?: string;
	customType?: string;
	data?: unknown;
	message?: { role?: string };
}

export function asGameEvent(entry: EntryLike): GameEvent | null {
	if (entry.type !== "custom") return null;
	if (entry.customType === LEDGER_TYPE) {
		const data = entry.data as GameEvent | undefined;
		return data && typeof data.ev === "string" ? data : null;
	}
	if (entry.customType === LEGACY_MOOD_TYPE) {
		const data = entry.data as { mood?: string; reason?: string } | undefined;
		if (data?.mood) return { ev: "mood_set", mood: data.mood, reason: data.reason ?? "" };
	}
	return null;
}

/** Replay one branch of session entries into the current game state. */
export function derive(entries: EntryLike[], defaultMood: string): DerivedState {
	const state: DerivedState = {
		mood: defaultMood,
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
			granted: 0,
			done: 0,
			rewarded: 0,
			failed: 0,
			shelved: 0,
			revived: 0,
			placesVisited: 0,
			placesChronicled: 0,
			personasMet: 0,
			items: 0,
			picks: 0,
			rolls: 0,
			perils: 0,
			truthsBound: 0,
		},
		score: 0,
		level: 1,
	};
	const undertaking = (slug: string): Undertaking =>
		(state.undertakings[slug] ??= {
			slug,
			size: 0,
			filled: 0,
			twist: 0,
			check: 0,
			mids: [],
			checkpointsFired: 0,
			beatsDone: 0,
			presented: false,
			resolved: false,
			checkFired: false,
			gritUsed: false,
			coldStreak: 0,
		});
	const placesSeen = new Set<string>();
	const placesAfar = new Set<string>();
	const personasSeen = new Set<string>();
	let offersLaid = 0;
	let currentOfferN = 0;
	for (const entry of entries) {
		if (entry.timestamp) state.lastEntryAt = entry.timestamp;
		if (entry.type === "message" && entry.message?.role === "user") {
			state.chats++;
			continue;
		}
		const event = asGameEvent(entry);
		if (!event) continue;
		switch (event.ev) {
			case "world":
				state.world = event.world;
				break;
			case "player_named":
				state.playerName = event.name;
				break;
			case "mood_set":
				state.mood = event.mood;
				break;
			case "websearch_ban":
				state.banned = true;
				break;
			case "redemption":
				state.banned = false;
				break;
			case "search_performed":
				state.searches++;
				break;
			case "search_refused":
				state.refusals++;
				break;
			case "truth":
				if (!state.truths.includes(event.text)) state.truths.push(event.text);
				state.tally.truthsBound++;
				break;
			case "truth_retracted":
				state.truths = state.truths.filter((truth) => truth !== event.text);
				break;
			case "place":
				state.place = { slug: event.slug, title: event.title };
				if (!placesSeen.has(event.slug)) {
					placesSeen.add(event.slug);
					state.tally.placesVisited++;
				}
				break;
			case "place_chronicled":
				if (!placesAfar.has(event.slug) && !placesSeen.has(event.slug)) {
					placesAfar.add(event.slug);
					state.tally.placesChronicled++;
				}
				break;
			case "persona":
				if (!personasSeen.has(event.name)) {
					personasSeen.add(event.name);
					state.tally.personasMet++;
				}
				break;
			case "quest":
				if (event.action in state.tally) state.tally[event.action as keyof Tally]++;
				break;
			case "item":
				state.tally.items++;
				break;
			case "chronicle":
				state.chronicle = event.key;
				break;
			case "quest_shape": {
				const u = undertaking(event.slug);
				u.size = event.clock;
				u.twist = event.twist;
				u.check = event.check ?? 0;
				u.mids = [...(event.mids ?? [])].sort((a, b) => a - b);
				const shape: QuestShape = {
					clock: event.clock,
					twist: event.twist,
					check: event.check ?? 0,
					mids: event.mids ?? [],
					selfSet: event.selfSet,
				};
				state.recentShapes.push(shape);
				if (state.recentShapes.length > 4) state.recentShapes.shift();
				break;
			}
			case "quest_tick": {
				const u = undertaking(event.slug);
				u.size = event.size;
				u.filled = Math.min(u.size, Math.max(0, u.filled + event.add));
				u.beatsDone++;
				break;
			}
			case "fate": {
				const u = undertaking(event.slug);
				u.plan = event.plan;
				state.recentSuits.push(event.plan.suit);
				if (state.recentSuits.length > 3) state.recentSuits.shift();
				break;
			}
			case "fate_skipped":
				undertaking(event.slug).twist = 0; // the quest continues plain
				break;
			case "complication": {
				const u = undertaking(event.slug);
				u.presented = true;
				u.beatsDone++; // the twist consumes the beat
				state.pendingChoice = { kind: "twist", slug: event.slug, text: event.text, options: event.options };
				break;
			}
			case "offer":
				offersLaid++;
				currentOfferN = offersLaid;
				state.pendingChoice = { kind: "offer", slug: "", text: event.text, options: event.options };
				break;
			case "offer_dropped":
				if (state.pendingChoice?.kind === "offer") {
					// Untaken courses wait at the place they were laid (/quest accept).
					state.untakenOffers.push({
						n: currentOfferN,
						text: state.pendingChoice.text,
						place: offerPlace(entries, currentOfferN),
						options: state.pendingChoice.options,
					});
					state.pendingChoice = undefined;
				}
				break;
			case "offer_taken":
				state.untakenOffers = state.untakenOffers
					.map((offer) =>
						offer.n === event.n
							? { ...offer, options: offer.options.filter((option) => option.id !== event.option) }
							: offer,
					)
					.filter((offer) => offer.options.length > 0);
				break;
			case "pick":
				state.tally.picks++;
				if (event.slug) {
					const u = undertaking(event.slug);
					u.resolved = true;
					u.pickedOption = event.option;
				} else if (state.pendingChoice?.kind === "offer") {
					// The picked course is taken; its siblings become untaken.
					const rest = state.pendingChoice.options.filter((option) => option.id !== event.option);
					if (rest.length > 0) {
						state.untakenOffers.push({
							n: currentOfferN,
							text: state.pendingChoice.text,
							place: offerPlace(entries, currentOfferN),
							options: rest,
						});
					}
				}
				if (state.pendingChoice?.slug === event.slug) state.pendingChoice = undefined;
				break;
			case "check": {
				if (event.slug) {
					const u = undertaking(event.slug);
					if (event.kind === "checkpoint") u.checkpointsFired++;
					else if (event.kind !== "hazard") u.checkFired = true; // finales fire once
					u.beatsDone++; // the trial consumes the beat
				}
				state.pendingRoll = {
					slug: event.slug,
					tier: event.tier,
					dc: event.dc,
					trial: event.trial,
					kind: event.kind,
					edge: event.edge,
					...(event.flesh ? { flesh: true } : {}),
				};
				break;
			}
			case "roll": {
				state.tally.rolls++;
				if (state.pendingRoll?.slug === event.slug) state.pendingRoll = undefined;
				if (event.slug && event.grit) undertaking(event.slug).gritUsed = true;
				break;
			}
			case "outcome": {
				if (event.slug) {
					const u = undertaking(event.slug);
					u.filled = Math.min(u.size, Math.max(0, u.filled + event.add));
					// Two straight setbacks and the fates relent (open advantage on
					// the next trial); any brighter band breaks the streak.
					u.coldStreak = event.band === "setback" ? u.coldStreak + 1 : 0;
				}
				break;
			}
			case "twist_dropped": {
				const u = undertaking(event.slug);
				u.twist = 0; // the quest continues plain; the finale still stands
				u.resolved = true; // the sealed plan opens (A4 — overtaken, not veiled)
				if (state.pendingChoice?.kind === "twist" && state.pendingChoice.slug === event.slug) {
					state.pendingChoice = undefined;
				}
				break;
			}
			case "peril_fuse":
				state.fuse = { at: event.at, turns: event.turns };
				break;
			case "peril":
				state.fuse = undefined; // the spring is spent
				state.tally.perils++;
				break;
			case "wound":
				state.wounds = Math.min(MAX_WOUNDS, state.wounds + Math.max(1, event.add));
				break;
			case "heal":
				state.wounds = Math.max(0, state.wounds - 1);
				break;
			case "death":
				state.dead = true;
				break;
			default:
				break; // search_requested / search_failed carry no derived state
		}
	}
	const standing = renown(state.tally);
	state.score = standing.score;
	state.level = standing.level;
	return state;
}

/** The place slug an offer was laid at: the n-th offer event on the branch. */
function offerPlace(entries: EntryLike[], n: number): string | undefined {
	let seen = 0;
	for (const entry of entries) {
		const event = asGameEvent(entry);
		if (event?.ev === "offer" && ++seen === n) return event.place;
	}
	return undefined;
}

/**
 * Code-owned invariant (app Ledger.setMood): reaching the angriest mood
 * records the websearch ban in the same step — the model cannot bar the
 * glass by narration, only through this plan.
 */
export function planSetMood(
	state: DerivedState,
	mood: string,
	reason: string,
	angriestMood: string,
): GameEvent[] {
	const events: GameEvent[] = [{ ev: "mood_set", mood, reason }];
	if (mood === angriestMood && !state.banned) events.push({ ev: "websearch_ban" });
	return events;
}

/**
 * Code-owned invariant (app Ledger.redeem): a no-op unless currently banned;
 * lifting the ban always returns the mood to the world's default.
 */
export function planRedemption(state: DerivedState, defaultMood: string, reason: string): GameEvent[] | null {
	if (!state.banned) return null;
	return [
		{ ev: "redemption", reason },
		{ ev: "mood_set", mood: defaultMood, reason: "redemption granted" },
	];
}

/** Human-readable one-liner per event, for the /ledger inspection command. */
export function describeEvent(event: GameEvent): string {
	switch (event.ev) {
		case "world":
			return `world bound: ${event.world}`;
		case "player_named":
			return `seeker named: ${event.name}`;
		case "mood_set":
			return `mood → ${event.mood} (${event.reason})`;
		case "websearch_ban":
			return "the scrying glass is BARRED";
		case "redemption":
			return `redemption granted (${event.reason})`;
		case "search_requested":
			return `${event.kind ?? "text"} search requested: "${event.query}"`;
		case "search_performed":
			return `${event.kind ?? "text"} search performed: "${event.query}" → ${event.title} [${event.source}]`;
		case "search_refused":
			return `${event.kind ?? "text"} search refused (${event.category})`;
		case "search_failed":
			return `${event.kind ?? "text"} search failed (${event.reason})`;
		case "truth":
			return `truth bound (${event.source}): "${event.text}"${event.ref ? ` ← *u${event.ref}*` : ""}`;
		case "truth_retracted":
			return `truth retracted: "${event.text}"`;
		case "chronicle":
			return `chronicle bound: ${event.key || "the shared legacy chronicle"}`;
		case "place":
			return `journeyed to: ${event.title}`;
		case "place_chronicled":
			return `place chronicled from afar: ${event.title}`;
		case "persona":
			return `soul recorded: ${event.name} at ${event.place}${event.note ? ` (${event.note})` : ""}`;
		case "quest":
			return event.action === "shelved"
				? `quest shelved: "${event.title}" — set aside to free a slot (only the seeker may take it up again)`
				: event.action === "revived"
					? `quest revived: "${event.title}" — taken up again`
					: `quest ${event.action}: "${event.title}"`;
		case "item":
			return `item gained: ${event.text}`;
		case "quest_shape":
			// The twist beat stays unspoken — only the clock's size is public.
			return `the fates take measure of "${event.slug}" (a clock of ${event.clock})`;
		case "quest_tick":
			return `the work advances: ${event.slug} (${event.filled}/${event.size})${event.note ? ` — ${event.note}` : ""}`;
		case "fate":
			return `the fates weave around "${event.slug}" (sealed)`;
		case "fate_skipped":
			return `the fates hold their tongue over "${event.slug}"`;
		case "complication":
			return `the task twists: "${event.slug}" — ${event.text} · paths: ${event.options
				.map((option) => `${option.id}) ${option.label} [${option.risk}]`)
				.join(" · ")}`;
		case "pick":
			return `the seeker chooses [${event.option}] ${event.label}${event.extra ? ` — "${event.extra}"` : ""}`;
		case "offer":
			return `choices laid before the seeker: ${event.text} · ${event.options
				.map((option) => `${option.id}) ${option.label}`)
				.join(" · ")}`;
		case "offer_dropped":
			return "the choices pass unchosen — the seeker speaks their own course";
		case "offer_taken":
			return `a formerly offered course is taken up (offer ${event.n}, course ${event.option})`;
		case "check":
			return `a trial bars ${event.slug ? `"${event.slug}"` : event.kind === "venture" ? "the seeker's own venture" : "the seeker's path"}: ${event.tier} (DC ${event.dc})${
				event.kind && event.kind !== "finale" ? ` [${event.kind}]` : ""
			}${event.edge ? ` · ${event.edge}${event.edgeReason ? ` (${event.edgeReason})` : ""}` : ""}${
				event.flesh ? " · flesh at stake" : ""
			} — ${event.trial}`;
		case "roll":
			return `the die falls${event.slug ? ` for "${event.slug}"` : ""}: ${event.kept} against DC ${event.dc} — ${event.band}${
				event.grit ? " (grit spent)" : ""
			} [threw ${event.dice.join(", ")}]`;
		case "outcome":
			return `the fates answer (${event.band}): ${event.text}`;
		case "twist_dropped":
			return `the twist over "${event.slug}" dissolves — overtaken by events (${event.reason})`;
		case "peril_fuse":
			// The countdown stays unspoken — veiled, never lied about (A4).
			return "the fates wind a hidden spring";
		case "peril":
			return `the world strikes: ${event.kind} — ${event.tier} (DC ${event.dc}): ${event.text}`;
		case "wound":
			return `the seeker is wounded (+${event.add}) — ${event.reason}`;
		case "heal":
			return `a wound is tended — ${event.reason}`;
		case "death":
			return `☠ the seeker's tale ends — ${event.reason}`;
	}
}
