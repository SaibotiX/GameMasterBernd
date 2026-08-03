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
	/** Quest lifecycle mirror of quests.md. */
	| { ev: "quest"; action: "granted" | "done" | "rewarded" | "failed"; title: string }
	/** Loot, pay or gifts mirrored from items.md. */
	| { ev: "item"; text: string }
	/** A granted quest's drawn shape: clock size and (hidden) twist beat, 0 = plain. */
	| { ev: "quest_shape"; slug: string; clock: number; twist: number }
	/** One beat of real work on a quest; add is the segment delta. */
	| { ev: "quest_tick"; slug: string; add: number; filled: number; size: number; note?: string }
	/** The sealed fate plan for a quest's twist (hidden answer sheet; veiled in /ledger). */
	| { ev: "fate"; slug: string; plan: FatePlan }
	/** The fate planner could not be reached — the quest continues plain. */
	| { ev: "fate_skipped"; slug: string }
	/** A twist presented to the seeker: the visible options only. */
	| { ev: "complication"; slug: string; text: string; options: PresentedOption[] }
	/** The seeker's pick (option id from the presented list). */
	| { ev: "pick"; slug: string; option: number; label: string; extra?: string }
	/** The engine's resolution of a pick: band is public once resolved. */
	| { ev: "outcome"; slug: string; band: string; add: number; text: string };

/** Branch-derived state of one quest's undertaking (clock + twist machinery).
 * The ledger is authoritative; the clock line in quests.md is a mirror. */
export interface Undertaking {
	slug: string;
	size: number;
	filled: number;
	/** Twist beat (1-based), 0 = plain quest. Neutralized to 0 by fate_skipped. */
	twist: number;
	/** Beats consumed so far (ticks + the complication presentation). */
	beatsDone: number;
	/** The sealed plan, once woven. */
	plan?: FatePlan;
	/** True once the complication was presented (twists fire once). */
	presented: boolean;
	/** True once a pick resolved the complication. */
	resolved: boolean;
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
	/** The one complication awaiting the seeker's pick, if any (P1: max one). */
	pendingChoice?: { slug: string; text: string; options: PresentedOption[] };
	/** Shapes of recently granted quests, oldest first (variety guard). */
	recentShapes: { clock: number; twist: number }[];
	/** Trouble kinds of recent fate plans, oldest first (variety guard). */
	recentSuits: string[];
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
	};
	const undertaking = (slug: string): Undertaking =>
		(state.undertakings[slug] ??= {
			slug,
			size: 0,
			filled: 0,
			twist: 0,
			beatsDone: 0,
			presented: false,
			resolved: false,
		});
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
				break;
			case "truth_retracted":
				state.truths = state.truths.filter((truth) => truth !== event.text);
				break;
			case "place":
				state.place = { slug: event.slug, title: event.title };
				break;
			case "chronicle":
				state.chronicle = event.key;
				break;
			case "quest_shape": {
				const u = undertaking(event.slug);
				u.size = event.clock;
				u.twist = event.twist;
				state.recentShapes.push({ clock: event.clock, twist: event.twist });
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
				state.pendingChoice = { slug: event.slug, text: event.text, options: event.options };
				break;
			}
			case "pick":
				if (state.pendingChoice?.slug === event.slug) state.pendingChoice = undefined;
				break;
			case "outcome": {
				const u = undertaking(event.slug);
				u.filled = Math.min(u.size, Math.max(0, u.filled + event.add));
				u.resolved = true;
				break;
			}
			default:
				break; // search_requested / search_failed carry no derived state
		}
	}
	return state;
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
			return `quest ${event.action}: "${event.title}"`;
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
		case "outcome":
			return `the fates answer (${event.band}): ${event.text}`;
	}
}
