/**
 * The 2×2 board: a bordered four-slot grid shared by the open-quests window
 * (/quest) and the choice panel (a twist's paths, an open offer's courses).
 * Pure string layout — no pi imports — so plain node can unit-test it. The
 * caller colors the frame (accent for calm boards, error-red for a burning
 * choice) via the `frame` function; cell TEXT stays uncolored so widths are
 * honest (ANSI inside cells would break the box).
 *
 * Layout, per the design sketch (four equal slots; empty slots stay empty):
 *   ╭──────┬──────╮
 *   │ .... │ .... │
 *   ├──────┼──────┤
 *   │ .... │ .... │
 *   ╰──────┴──────╯
 */

/** Word-wrap plain text to a width; long words hard-split; "" stays []. */
export function wrapText(text: string, width: number): string[] {
	const flat = text.replace(/\s+/g, " ").trim();
	if (!flat || width < 1) return [];
	const lines: string[] = [];
	let current = "";
	for (let word of flat.split(" ")) {
		while (word.length > width) {
			if (current) {
				lines.push(current);
				current = "";
			}
			lines.push(word.slice(0, width));
			word = word.slice(width);
		}
		if (!word) continue;
		if (!current) current = word;
		else if (current.length + 1 + word.length <= width) current += ` ${word}`;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

export interface GridCell {
	/** The slot's lines, top first; each is wrapped to the cell width. */
	lines: string[];
}

/**
 * Render up to four cells as a 2×2 board of total `width` columns. Row
 * heights follow the tallest cell of the row (cap `maxCellRows`); the board
 * always shows all four slots — missing cells render empty. Every returned
 * line is exactly the box; the caller pads/indents.
 */
export function gridBox(
	cells: GridCell[],
	width: number,
	frame: (border: string) => string = (border) => border,
	maxCellRows = 4,
): string[] {
	// Total width = 2 cells + 3 border columns; each cell pads 1 left + 1 right.
	const cellWidth = Math.max(8, Math.floor((width - 3) / 2));
	const innerWidth = cellWidth - 2;
	const slot = (index: number): string[] => {
		const cell = cells[index];
		if (!cell) return [];
		const wrapped = cell.lines.flatMap((line) => wrapText(line, innerWidth));
		return wrapped.length > maxCellRows
			? [...wrapped.slice(0, maxCellRows - 1), truncate(wrapped[maxCellRows - 1] ?? "", innerWidth, true)]
			: wrapped;
	};
	const bar = "─".repeat(cellWidth);
	const top = frame(`╭${bar}┬${bar}╮`);
	const mid = frame(`├${bar}┼${bar}┤`);
	const bottom = frame(`╰${bar}┴${bar}╯`);
	const lines: string[] = [top];
	for (const row of [0, 1]) {
		const left = slot(row * 2);
		const right = slot(row * 2 + 1);
		const height = Math.max(1, left.length, right.length);
		for (let i = 0; i < height; i++) {
			const pad = (text: string) => ` ${text.padEnd(innerWidth)} `;
			lines.push(
				frame("│") + pad(truncate(left[i] ?? "", innerWidth, false)) + frame("│") + pad(truncate(right[i] ?? "", innerWidth, false)) + frame("│"),
			);
		}
		lines.push(row === 0 ? mid : bottom);
	}
	return lines;
}

function truncate(text: string, width: number, ellipsis: boolean): string {
	if (text.length <= width) return text;
	return ellipsis ? `${text.slice(0, Math.max(0, width - 1))}…` : text.slice(0, width);
}
