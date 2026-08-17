/**
 * The open world on disk: places, personas, quests and items live as plain
 * markdown under data/world/<world-id>/ — the persistent chronicle that
 * outlives sittings. Unlike the session ledger, world files are never
 * rewound by /tree and never deleted; they only grow.
 *
 * All writes go through the engine (this module); the model supplies content
 * through tool parameters. Code owns the invariants:
 *   - place and persona identity is the slug of the name — the same name is
 *     the same page, so returning somewhere loads its whole history;
 *   - a persona dwells where last recorded ("now at:") and moves only with a
 *     recorded reason;
 *   - quests advance open → done → rewarded, never backwards, and the reward
 *     is collectable only where the giver dwells (checked by the caller via
 *     personaLocation).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WorldFiles {
	/** data/world/<worldId>/<chronicle> (or the test override). */
	root: string;
}

export function slugify(text: string, max = 48): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9äöüß]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, max) || "unnamed"
	);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function ensureDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

function read(file: string): string {
	return existsSync(file) ? readFileSync(file, "utf8") : "";
}

// ---- the seat's world choice (/worlds — R30, revised 2026-08-10) ----------

/** The world bound for the NEXT /new: one id in a plain file in the data
 * volume — process memory would lose the choice at the reaper's stop.
 * Absent or blank → no choice; whether the id still names a world is the
 * caller's question (a removed world must cost the seat nothing but the
 * default, never the boot). */
export function readWorldChoice(file: string): string | undefined {
	const id = read(file).trim();
	return id.length > 0 ? id : undefined;
}

export function writeWorldChoice(file: string, worldId: string): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, worldId + "\n", "utf8");
}

// ---- places ---------------------------------------------------------------

const placeFile = (world: WorldFiles, slug: string) => join(world.root, "places", `${slug}.md`);

export function placeExists(world: WorldFiles, name: string): boolean {
	return existsSync(placeFile(world, slugify(name)));
}

export interface PlaceVisit {
	created: boolean;
	slug: string;
	title: string;
	/** The full page after the visit was recorded. */
	content: string;
}

/**
 * Arrive at a place: founds the page on first visit (description required by
 * the caller then), appends an arrival line on every return.
 */
export function visitPlace(world: WorldFiles, name: string, description: string): PlaceVisit {
	const slug = slugify(name);
	const file = placeFile(world, slug);
	ensureDir(join(world.root, "places"));
	if (!existsSync(file)) {
		writeFileSync(
			file,
			`# ${name.trim()}\n` +
				`- first recorded: ${stamp()}\n\n` +
				`## The place\n${description.trim()}\n\n` +
				`## Chronicle of visits\n### ${stamp()} — first arrival\n`,
			"utf8",
		);
		return { created: true, slug, title: name.trim(), content: read(file) };
	}
	appendFileSync(file, `### ${stamp()} — the party returns\n`, "utf8");
	const content = read(file);
	const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? name.trim();
	return { created: false, slug, title, content };
}

/**
 * Chronicle a place WITHOUT the party traveling there — somewhere merely
 * spoken of (a neighbor's house, a quest's destination). Founds the page if
 * missing; never appends an arrival and never moves anyone.
 */
export function foundPlace(
	world: WorldFiles,
	name: string,
	description: string,
): { created: boolean; slug: string; title: string } {
	const slug = slugify(name);
	const file = placeFile(world, slug);
	if (existsSync(file)) {
		const title = read(file).match(/^# (.+)$/m)?.[1]?.trim() ?? name.trim();
		return { created: false, slug, title };
	}
	ensureDir(join(world.root, "places"));
	writeFileSync(
		file,
		`# ${name.trim()}\n` +
			`- first recorded: ${stamp()} (chronicled from afar)\n\n` +
			`## The place\n${description.trim()}\n\n` +
			`## Chronicle of visits\n`,
		"utf8",
	);
	return { created: true, slug, title: name.trim() };
}

/** The full page of a place by SLUG ("" when none exists) — for the fate
 * planner's grounding and the /place command. */
export function placePage(world: WorldFiles, slug: string): string {
	return read(placeFile(world, slug));
}

/** The full page of a persona by SLUG ("" when none exists) — for /persons. */
export function personaPage(world: WorldFiles, slug: string): string {
	return read(personaFile(world, slug));
}

/** All place pages: slug + title + first body line, for the /place list. */
export function listPages(
	world: WorldFiles,
	kind: "places" | "personas",
): { slug: string; title: string; firstLine: string }[] {
	const dir = join(world.root, kind);
	if (!existsSync(dir)) return [];
	const pages: { slug: string; title: string; firstLine: string }[] = [];
	for (const entry of readdirSync(dir).sort()) {
		if (!entry.endsWith(".md")) continue;
		const content = read(join(dir, entry));
		const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? entry.replace(/\.md$/, "");
		const bodyAt = content.indexOf(kind === "places" ? "## The place" : "## Who they are");
		const firstLine =
			bodyAt === -1
				? ""
				: (content.slice(bodyAt).split("\n")[1] ?? "").trim();
		pages.push({ slug: entry.replace(/\.md$/, ""), title, firstLine });
	}
	return pages;
}

/** Extend the page of an existing place with new details (never deletes). */
export function extendPlace(world: WorldFiles, name: string, details: string): boolean {
	const file = placeFile(world, slugify(name));
	if (!existsSync(file)) return false;
	appendFileSync(file, `### ${stamp()}\n${details.trim()}\n`, "utf8");
	return true;
}

// ---- personas -------------------------------------------------------------

const personaFile = (world: WorldFiles, slug: string) => join(world.root, "personas", `${slug}.md`);

export function personaExists(world: WorldFiles, name: string): boolean {
	return existsSync(personaFile(world, slugify(name)));
}

/** Where a persona currently dwells (a place slug), or null if unknown. */
export function personaLocation(world: WorldFiles, name: string): string | null {
	const content = read(personaFile(world, slugify(name)));
	return content.match(/^- now at: (.+)$/m)?.[1]?.trim() ?? null;
}

/**
 * Record a notable soul at a place — founds the page on first meeting,
 * appends the new dealings on every later one. Never changes "now at" for an
 * existing persona (that is movePersona's job, with a reason).
 */
export function recordPersona(
	world: WorldFiles,
	name: string,
	role: string,
	dealings: string,
	placeSlug: string,
): { created: boolean; slug: string } {
	const slug = slugify(name);
	const file = personaFile(world, slug);
	ensureDir(join(world.root, "personas"));
	if (!existsSync(file)) {
		writeFileSync(
			file,
			`# ${name.trim()}\n` +
				`- met at: ${placeSlug} (${stamp()})\n` +
				`- now at: ${placeSlug}\n\n` +
				`## Who they are\n${role.trim()}\n\n` +
				`## Dealings with the seeker\n### ${stamp()} — at ${placeSlug}\n${dealings.trim()}\n`,
			"utf8",
		);
		return { created: true, slug };
	}
	appendFileSync(file, `### ${stamp()} — at ${placeSlug}\n${dealings.trim()}\n`, "utf8");
	return { created: false, slug };
}

/**
 * Move a persona to another (existing) place — the reason is recorded on
 * their page, so a convenient relocation is always auditable.
 */
export function movePersona(world: WorldFiles, name: string, toPlaceSlug: string, reason: string): boolean {
	const file = personaFile(world, slugify(name));
	const content = read(file);
	if (!content) return false;
	const updated = content.replace(/^- now at: .+$/m, `- now at: ${toPlaceSlug}`);
	writeFileSync(file, updated, "utf8");
	appendFileSync(file, `### ${stamp()} — moved to ${toPlaceSlug}\nReason: ${reason.trim()}\n`, "utf8");
	return true;
}

/** Names of all personas whose "now at" is the given place. */
export function personasAt(world: WorldFiles, placeSlug: string): string[] {
	const dir = join(world.root, "personas");
	if (!existsSync(dir)) return [];
	const names: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (!entry.endsWith(".md")) continue;
		const content = read(join(dir, entry));
		if (content.match(/^- now at: (.+)$/m)?.[1]?.trim() === placeSlug) {
			names.push(content.match(/^# (.+)$/m)?.[1]?.trim() ?? entry.replace(/\.md$/, ""));
		}
	}
	return names;
}

// ---- quests ---------------------------------------------------------------

const questsFile = (world: WorldFiles) => join(world.root, "quests.md");

export interface Quest {
	slug: string;
	title: string;
	/** "shelved" = set aside by the seeker to free one of the four slots;
	 * only /quest accept (at the granting place) reopens it. */
	status: "open" | "done" | "rewarded" | "failed" | "shelved";
	giver: string;
	giverSlug: string;
	task: string;
	reward: string;
	/** Where the quest was granted (place slug) — revival happens only there. */
	grantedAt: string | null;
	/** Readable mirror of the undertaking clock; the branch-derived ledger is
	 * authoritative (files never rewind with /tree). Null on legacy quests. */
	clock: { filled: number; size: number } | null;
}

const STATUSES = "open|done|rewarded|failed|shelved";

export function grantQuest(
	world: WorldFiles,
	quest: { title: string; giver?: string; task: string; reward: string; placeSlug: string; clockSize?: number },
): { slug: string } {
	const slug = slugify(quest.title);
	if (questBySlug(world, slug)) throw new Error(`a quest named "${quest.title}" already exists in the chronicle`);
	ensureDir(world.root);
	const file = questsFile(world);
	if (!existsSync(file)) writeFileSync(file, `# Quests\n`, "utf8");
	// No giver = a task the seeker set for themselves (persona sentinel "self":
	// redeeming skips the at-the-giver check, there is nobody to collect from).
	const giverLine = quest.giver?.trim()
		? `${quest.giver.trim()} (persona: ${slugify(quest.giver)})`
		: "the seeker (persona: self)";
	appendFileSync(
		file,
		`\n## [open] ${quest.title.trim()} (id: ${slug})\n` +
			`- giver: ${giverLine}\n` +
			`- granted at: ${quest.placeSlug}, ${stamp()}\n` +
			`- task: ${quest.task.trim()}\n` +
			`- reward: ${quest.reward.trim()}\n` +
			(quest.clockSize ? `- clock: 0/${quest.clockSize}\n` : "") +
			`### progress\n`,
		"utf8",
	);
	return { slug };
}

export function questBySlug(world: WorldFiles, slug: string): Quest | null {
	const content = read(questsFile(world));
	const heading = content.match(new RegExp(`^## \\[(${STATUSES})\\] (.+) \\(id: ${slug}\\)$`, "m"));
	if (!heading) return null;
	const section = content.slice(content.indexOf(heading[0]));
	const body = section.slice(0, section.indexOf("\n## ", 1) === -1 ? undefined : section.indexOf("\n## ", 1));
	const giverLine = body.match(/^- giver: (.+) \(persona: (.+)\)$/m);
	const clockLine = body.match(/^- clock: (\d+)\/(\d+)$/m);
	return {
		slug,
		title: heading[2].trim(),
		status: heading[1] as Quest["status"],
		giver: giverLine?.[1]?.trim() ?? "unknown",
		giverSlug: giverLine?.[2]?.trim() ?? "unknown",
		task: body.match(/^- task: (.+)$/m)?.[1]?.trim() ?? "(task unrecorded)",
		reward: body.match(/^- reward: (.+)$/m)?.[1]?.trim() ?? "nothing",
		grantedAt: body.match(/^- granted at: ([^,]+),/m)?.[1]?.trim() ?? null,
		clock: clockLine ? { filled: Number(clockLine[1]), size: Number(clockLine[2]) } : null,
	};
}

/** Every quest currently standing [shelved] — for /quest's set-aside list. */
export function shelvedQuests(world: WorldFiles): Quest[] {
	const content = read(questsFile(world));
	const quests: Quest[] = [];
	for (const match of content.matchAll(/^## \[shelved\] .+ \(id: (.+)\)$/gm)) {
		const quest = questBySlug(world, match[1]);
		if (quest) quests.push(quest);
	}
	return quests;
}

/** Rewrite (or insert) the quest's readable clock-mirror line. */
export function setQuestClock(world: WorldFiles, slug: string, filled: number, size: number): boolean {
	const file = questsFile(world);
	let content = read(file);
	const heading = content.match(new RegExp(`^## \\[(${STATUSES})\\] (.+) \\(id: ${slug}\\)$`, "m"));
	if (!heading) return false;
	const sectionStart = content.indexOf(heading[0]);
	const nextHeading = content.indexOf("\n## ", sectionStart + 1);
	const sectionEnd = nextHeading === -1 ? content.length : nextHeading;
	let section = content.slice(sectionStart, sectionEnd);
	const line = `- clock: ${Math.max(0, filled)}/${size}`;
	if (/^- clock: \d+\/\d+$/m.test(section)) {
		section = section.replace(/^- clock: \d+\/\d+$/m, line);
	} else {
		// Legacy quest: the clock line joins the section just above progress.
		section = section.includes("### progress")
			? section.replace("### progress", `${line}\n### progress`)
			: section + `${line}\n`;
	}
	content = content.slice(0, sectionStart) + section + content.slice(sectionEnd);
	writeFileSync(file, content, "utf8");
	return true;
}

/** How many quests currently stand [open] (the Christmas-tree cap reads this). */
export function countOpenQuests(world: WorldFiles): number {
	return read(questsFile(world))
		.split("\n")
		.filter((line) => line.startsWith("## [open] ")).length;
}

/** Advance a quest (open → done → rewarded, or → failed), shelve it, or
 * revive it ("open" from shelved); notes always append. The CALLER owns the
 * transition rules — this writes what it is told. */
export function setQuestStatus(
	world: WorldFiles,
	slug: string,
	status: "open" | "done" | "rewarded" | "failed" | "shelved" | null,
	note: string,
): boolean {
	const quest = questBySlug(world, slug);
	if (!quest) return false;
	const file = questsFile(world);
	let content = read(file);
	if (status) {
		content = content.replace(
			new RegExp(`^## \\[(${STATUSES})\\] (.+) \\(id: ${slug}\\)$`, "m"),
			`## [${status}] $2 (id: ${slug})`,
		);
	}
	// Progress lines live under the quest's "### progress" heading. A page
	// missing that heading (hand-edited) still gets its status change — the
	// note is dropped rather than inserted somewhere corrupting.
	const marker = `(id: ${slug})`;
	const sectionStart = content.indexOf(marker);
	const progressAt = content.indexOf("### progress", sectionStart);
	if (progressAt !== -1) {
		const insertAt = content.indexOf("\n", progressAt) + 1;
		const line = `- ${stamp()}${status ? ` [${status}]` : ""} — ${note.trim()}\n`;
		content = content.slice(0, insertAt) + line + content.slice(insertAt);
	}
	writeFileSync(file, content, "utf8");
	return true;
}

/** Headings of every quest not yet rewarded — the standing "open matters". */
export function openQuestLines(world: WorldFiles): string[] {
	return read(questsFile(world))
		.split("\n")
		.filter((line) => /^## \[(open|done)\] /.test(line))
		.map((line) => line.replace(/^## /, ""));
}

// ---- the chronicler's own page --------------------------------------------
// G16 (2026-08-04): the voice fronting the keeper — Bernd in the dragon
// realm — is the realm's witness, not its inhabitant: never a soul under
// personas/, never a dwelling, never a wound. He gets THIS page instead, at
// the chronicle root beside the ledger: crafted by a side call only after
// the seeker's first few turns (so he can shape himself to this player),
// then read back into the keeper's own context every turn — the being the
// player meets stays the being the record holds. Code appends what he
// witnesses; the page only grows.

const chroniclerFile = (world: WorldFiles) => join(world.root, "chronicler.md");

export function chroniclerExists(world: WorldFiles): boolean {
	return existsSync(chroniclerFile(world));
}

export function chroniclerPage(world: WorldFiles): string {
	return read(chroniclerFile(world));
}

/** The fixed creed every chronicler page opens with — the canonized nature
 * (it began as an improvised GM answer the maintainer kept). */
export function chroniclerCreed(voiceName: string): string {
	return (
		`${voiceName} dwells nowhere because he dwells everywhere the quill's reach extends. ` +
		`He is the realm's witness, not its inhabitant: no place binds him, no hour ages him, ` +
		`no wound may find him. There is no page for him among the souls — only this one, ` +
		`beside the ledger itself. What is written of him here, he holds to.`
	);
}

/** Write the crafted page (once per chronicle; recrafting is refused —
 * the witness does not change his nature mid-tale). */
export function craftChroniclerPage(
	world: WorldFiles,
	voiceName: string,
	crafted: { shows: string; noted: string },
): boolean {
	const file = chroniclerFile(world);
	if (existsSync(file)) return false;
	ensureDir(world.root);
	writeFileSync(
		file,
		`# ${voiceName.trim()}\n` +
			`- crafted: ${stamp()} — after the seeker's first steps, shaped to them\n\n` +
			`## The witness's creed\n${chroniclerCreed(voiceName.trim())}\n\n` +
			`## How he shows himself to this seeker\n${crafted.shows.trim()}\n\n` +
			`## What the quill has noted of the seeker\n${crafted.noted.trim()}\n\n` +
			`## Witnessed\n`,
		"utf8",
	);
	return true;
}

/** Append one dated line of what the witness saw (quest turns, wounds,
 * truths…). Deterministic, code-owned; never breaks a turn. */
export function extendChronicler(world: WorldFiles, line: string): void {
	try {
		const file = chroniclerFile(world);
		if (!existsSync(file)) return; // not crafted yet — the ledger holds it anyway
		appendFileSync(file, `- ${stamp()} · ${line.trim()}\n`, "utf8");
	} catch {
		// the witness's page must never break a turn
	}
}

// ---- the readable ledger log ----------------------------------------------

/**
 * Append one human-readable line to the story's ledger.md — the player-facing
 * mirror of the session's game events (the real ledger lives as custom
 * entries inside pi's session JSONL). Append-only across ALL branches: /tree
 * rewinds the session, never this log. Must never break a turn.
 */
export function logEvent(world: WorldFiles, line: string): void {
	try {
		ensureDir(world.root);
		const file = join(world.root, "ledger.md");
		if (!existsSync(file)) {
			writeFileSync(
				file,
				`# Ledger log\n` +
					`Readable mirror of this story's game events. The authoritative ledger lives inside pi's\n` +
					`session file (custom entries); this log is append-only across all branches — /tree\n` +
					`rewinds the session, never this file. *uN* = the entry's number in the session record.\n\n`,
				"utf8",
			);
		}
		appendFileSync(file, `${line}\n`, "utf8");
	} catch {
		// the log must never break a turn
	}
}

// ---- notes to the makers ---------------------------------------------------

/**
 * Append one line of the seeker's own words to the story's notes file — the
 * in-play tester notes (R13; ruled 2026-08-17: the player console asks every
 * few turns, /note writes). Out-of-world by design: nothing reads it back
 * into play; it ships with the story folder. Must never break a turn.
 */
export function addNote(world: WorldFiles, text: string): void {
	try {
		ensureDir(world.root);
		const file = join(world.root, "notes.md");
		if (!existsSync(file)) {
			writeFileSync(
				file,
				`# Notes to the makers\n` +
					`What the seeker set down in play (/note). Out-of-world: the game never reads this;\n` +
					`it travels with the story folder to the makers.\n\n`,
				"utf8",
			);
		}
		appendFileSync(file, `- ${stamp()} · ${text.trim()}\n`, "utf8");
	} catch {
		// a note must never break a turn
	}
}

// ---- items ----------------------------------------------------------------

const itemsFile = (world: WorldFiles) => join(world.root, "items.md");

export function addItem(world: WorldFiles, text: string): void {
	ensureDir(world.root);
	const file = itemsFile(world);
	if (!existsSync(file)) writeFileSync(file, `# Items of the seeker\n`, "utf8");
	appendFileSync(file, `- ${stamp()} · ${text.trim()}\n`, "utf8");
}

/** Whether the seeker's items file mentions the given thing (blue options). */
export function hasItem(world: WorldFiles, text: string): boolean {
	return read(itemsFile(world)).toLowerCase().includes(text.trim().toLowerCase());
}
