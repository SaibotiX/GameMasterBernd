/**
 * /ai — which mind serves each duty. The game has five AI roles: the keeper
 * (pi's own main loop — every in-character turn) and four side-call duties
 * (the GM table, the truth guardian, the fate weaver, the saga scribe). Side
 * calls mirror the keeper's model unless a standing override names another —
 * any provider pi speaks, one routing surface. Pure logic only; the command
 * wiring, settings persistence and call sites live in index.ts (the pi seam).
 */

export const AI_ROLES = ["keeper", "table", "guardian", "fate", "saga"] as const;
export type AiRole = (typeof AI_ROLES)[number];
/** The four side-call duties — everything but pi's own main loop. */
export type SideRole = Exclude<AiRole, "keeper">;
export const SIDE_ROLES = AI_ROLES.filter((role): role is SideRole => role !== "keeper");

export const ROLE_DUTY: Record<AiRole, string> = {
	keeper: "the story's voice — every in-character turn (pi's main model; /model switches it too)",
	table: "the GM table's out-of-character answers (/gm, /dm)",
	guardian: "the truth judge — constitution and record checks before anything binds as canon",
	fate: "the hidden fate weaver — twist plans sealed away from the keeper",
	saga: "record prose — /history long and the chronicler's page crafting",
};

/** Words the command accepts per role; the world's voice name (e.g. "bernd")
 * is matched by the caller against the keeper. */
const ROLE_WORDS: Record<string, AiRole> = {
	keeper: "keeper",
	table: "table",
	gm: "table",
	dm: "table",
	guardian: "guardian",
	judge: "guardian",
	fate: "fate",
	weaver: "fate",
	saga: "saga",
	summary: "saga",
	chronicler: "saga",
};

export function roleFromWord(word: string, voiceName?: string): AiRole | null {
	const bare = word.trim().toLowerCase();
	if (!bare) return null;
	if (voiceName && bare === voiceName.trim().toLowerCase()) return "keeper";
	return ROLE_WORDS[bare] ?? null;
}

export interface ModelListing {
	provider: string;
	id: string;
}

/** "provider/id" — the stored and displayed shape of a model reference. */
export function refOf(model: ModelListing): string {
	return `${model.provider}/${model.id}`;
}

/** Splits on the FIRST slash only — model ids may themselves contain slashes
 * (OpenRouter's "openrouter/anthropic/claude-…" is provider "openrouter"). */
export function splitRef(ref: string): { provider: string; id: string } | null {
	const slash = ref.indexOf("/");
	if (slash <= 0 || slash === ref.length - 1) return null;
	return { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

/** Resolve a typed pattern against the available catalogue: exact provider/id,
 * then exact id, then substring of provider/id. A unique hit is a match;
 * anything else returns the candidates so the command can list them. */
export function resolvePattern(
	pattern: string,
	available: ModelListing[],
): { match?: ModelListing; candidates: ModelListing[] } {
	const bare = pattern.trim().toLowerCase();
	if (!bare) return { candidates: [] };
	const exact = available.find((model) => refOf(model).toLowerCase() === bare);
	if (exact) return { match: exact, candidates: [exact] };
	const byId = available.filter((model) => model.id.toLowerCase() === bare);
	if (byId.length === 1) return { match: byId[0], candidates: byId };
	const pool = byId.length > 1 ? byId : available.filter((model) => refOf(model).toLowerCase().includes(bare));
	return pool.length === 1 ? { match: pool[0], candidates: pool } : { candidates: pool };
}
