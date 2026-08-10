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

/** The quiet opener under the title — the mood and the first commands a
 * seeker needs (the friend intro deliberately names none; this line is
 * where a player first learns the console answers to /). */
export function bannerHint(mood: string): string {
	return `mood: ${mood} · /quest opens the board · typing / lists every command`;
}
