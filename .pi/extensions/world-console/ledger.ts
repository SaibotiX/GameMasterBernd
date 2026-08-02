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
 * Unlike app/data/ledger.jsonl there is exactly one world per ledger: the
 * first event of every session is a "world" stamp, and resuming a session
 * keeps its stamped world no matter what --world says (worlds never mix).
 */

export const LEDGER_TYPE = "world-console.ledger";
/** Mood entries written by the pre-ledger milestone build; still honored. */
export const LEGACY_MOOD_TYPE = "world-console.mood";

export type GameEvent =
	| { ev: "world"; world: string }
	| { ev: "player_named"; name: string }
	| { ev: "mood_set"; mood: string; reason: string }
	| { ev: "websearch_ban" }
	| { ev: "redemption"; reason: string }
	| { ev: "search_requested"; query: string; kind?: string }
	| { ev: "search_performed"; query: string; source: string; ref: string; title: string; kind?: string }
	| { ev: "search_refused"; category: string; kind?: string }
	| { ev: "search_failed"; reason: string; kind?: string };

export interface DerivedState {
	world?: string;
	playerName?: string;
	mood: string;
	banned: boolean;
	chats: number;
	searches: number;
	refusals: number;
	/** ISO timestamp of the newest entry on the branch, if any. */
	lastEntryAt?: string;
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
	};
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
	}
}
