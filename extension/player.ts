/**
 * Player mode (R30), the pure pieces: the house mark, banner assembly.
 * Like ui.ts this file imports nothing of pi and colors nothing — the
 * caller styles and truncates — so unit.ts exercises it without a TUI.
 */

/** The house mark (R16: the game is World Console) — the banner when a
 * world brings no art of its own (config/worlds/<id>.banner.txt). */
export const WORLD_CONSOLE_MARK = [
	"██╗    ██╗ ██████╗ ██████╗ ██╗     ██████╗ ",
	"██║    ██║██╔═══██╗██╔══██╗██║     ██╔══██╗",
	"██║ █╗ ██║██║   ██║██████╔╝██║     ██║  ██║",
	"██║███╗██║██║   ██║██╔══██╗██║     ██║  ██║",
	"╚███╔███╔╝╚██████╔╝██║  ██║███████╗██████╔╝",
	" ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═════╝ ",
	"            C  O  N  S  O  L  E",
];

/** Art fits only whole: a letterform cut mid-glyph reads as breakage, not
 * style — narrower terminals get the title lines alone. */
export function fitArt(art: string[], width: number): string[] {
	if (art.length === 0 || !art.every((line) => line.length <= width)) return [];
	return art;
}

/** The one hint under the world's face (refined at the seen-gate, R30):
 * the friend intro deliberately names no commands, so this line is where
 * a player first learns the console answers to / — and nothing more; the
 * world is theirs to explore. */
export function bannerHint(): string {
	return "typing / lists every command";
}

// ---- the command surface (R30) -------------------------------------------

/** pi's built-in slash commands as pinned (0.84.1). The unit drift test
 * holds this list against pi's own BUILTIN_SLASH_COMMANDS file — a pi
 * upgrade that grows or shrinks the set turns unit red, and the block
 * list gets re-judged before the new pin serves anyone (pi-upgrades.md). */
export const PI_BUILTIN_COMMANDS = [
	"settings", "model", "scoped-models", "export", "import", "share", "copy",
	"name", "session", "changelog", "hotkeys", "fork", "clone", "tree", "trust",
	"login", "logout", "new", "compact", "resume", "reload", "quit",
];

/** Workshop commands pi dispatches without listing (its debug trio) plus
 * the retired /limits (iced with R11; the icebox entry remembers it). */
export const HIDDEN_EXTRA_COMMANDS = ["limits", "debug", "arminsayshi", "dementedelves"];

/** The player's seventeen (R30, revised 2026-08-17: /note joins — the
 * in-play tester-notes ruling): the game's fourteen plus pi's /tree /new
 * /resume — /compact ruled off the list (auto-compaction carries it). */
export const PLAYER_COMMANDS = [
	"web", "pick", "roll", "ledger", "quest", "place", "persons", "record",
	"thoughts", "history", "gm", "dm", "worlds", "note",
	"tree", "new", "resume",
];

const BLOCKED_COMMANDS = new Set(
	[...PI_BUILTIN_COMMANDS, ...HIDDEN_EXTRA_COMMANDS].filter((name) => !PLAYER_COMMANDS.includes(name)),
);

/** App keys the workshop copies onto custom editors that die in player
 * mode: model and thinking-LEVEL switching, suspend (a frozen pane in a
 * browser tab), the external editor. ctrl+o (expand) and ctrl+t (thinking
 * visibility) LIVE — the game leans on both. */
export const PLAYER_BLOCKED_ACTIONS = new Set([
	"app.model.cycleForward", "app.model.cycleBackward", "app.model.select",
	"app.thinking.cycle", "app.suspend", "app.editor.external",
]);

/**
 * The submit gate (R30): a known workshop command or the !/!! bash escape
 * is refused with an in-register notice; an unknown /word still passes to
 * the keeper, who deflects in character. Returns the notice when blocked,
 * null when the text may flow.
 */
export function playerGate(text: string): string | null {
	const t = text.trim();
	if (t.startsWith("!")) {
		return "the console keeps its machinery behind the curtain — typing / lists the seeker's commands";
	}
	if (t.startsWith("/")) {
		const token = (t.slice(1).split(/\s/, 1)[0] ?? "").toLowerCase();
		if (BLOCKED_COMMANDS.has(token)) {
			return `/${token} is not at this table — typing / lists the seeker's commands`;
		}
	}
	return null;
}

/**
 * The popup filter (R30): at the command position — mirroring pi's own
 * isSlashCommand test (a "/"-led first token, nothing before it, no path
 * separator) — only the player's commands appear; argument and file
 * suggestions pass untouched (command items carry bare names, no slash).
 */
export function filterPlayerSuggestions<T extends { value: string }>(
	items: T[],
	prefix: string,
	beforePrefix: string,
): T[] {
	const commandPosition =
		prefix.startsWith("/") && beforePrefix.trim() === "" && !prefix.slice(1).includes("/");
	if (!commandPosition) return items;
	return items.filter((item) => PLAYER_COMMANDS.includes(item.value));
}
