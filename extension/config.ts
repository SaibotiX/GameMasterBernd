/**
 * Read-only loader for the World Console config tree (config):
 * constitution.md, worlds/<id>.md, moods/*.md, sites.json.
 *
 * Markdown-with-frontmatter, inherited from the retired app's format. This
 * loader never writes files and returns plain data — hot reload is "call
 * again".
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface World {
	id: string;
	title: string;
	voice: string;
	register: string;
	defaultMood: string;
	body: string;
	/** The world's laws (worlds/<id>.laws.md): physics, biology, special
	 * mechanics, hard limits, interruption palette. "" when the file is absent. */
	laws: string;
	/** The world's banner art (worlds/<id>.banner.txt, raw lines — no
	 * frontmatter; leading spaces are the drawing). [] when the file is
	 * absent: player mode then shows the World Console mark (R30). */
	banner: string[];
}

export interface Mood {
	id: string;
	tone: string;
	severity: number;
	body: string;
}

export interface SiteEntry {
	host: string;
}

export interface WorldConfig {
	constitution: string;
	world: World;
	moods: Map<string, Mood>;
	textSites: SiteEntry[];
	pictureSites: SiteEntry[];
	videoSites: SiteEntry[];
}

/** Inherited from the retired app's util.ts parseFrontmatter — same format. */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
	const meta: Record<string, string> = {};
	if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // a BOM must not hide the fence
	if (!raw.startsWith("---")) return { meta, body: raw.trim() };
	// The closing fence is "---" on a line of its own (not any line that merely
	// starts with dashes).
	const fence = /\n---(?:\r?\n|$)/.exec(raw.slice(3));
	if (!fence) return { meta, body: raw.trim() };
	const end = 3 + fence.index;
	for (const line of raw.slice(3, end).split("\n")) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		let value = line.slice(colon + 1).trim();
		const quoted =
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
		if (quoted) value = value.slice(1, -1);
		if (key) meta[key] = value;
	}
	return { meta, body: raw.slice(end + fence[0].length).trim() };
}

function loadWorld(dir: string, id: string): World {
	const file = join(dir, `${id}.md`);
	if (!existsSync(file)) {
		const available = existsSync(dir)
			? readdirSync(dir)
					.filter((f) => f.endsWith(".md") && !f.endsWith(".laws.md"))
					.map((f) => f.replace(/\.md$/, ""))
					.join(", ")
			: `(none — missing directory ${dir})`;
		throw new Error(`unknown world "${id}" — available: ${available}`);
	}
	const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
	const lawsFile = join(dir, `${id}.laws.md`);
	const laws = existsSync(lawsFile) ? parseFrontmatter(readFileSync(lawsFile, "utf8")).body : "";
	const bannerFile = join(dir, `${id}.banner.txt`);
	const banner = existsSync(bannerFile)
		? readFileSync(bannerFile, "utf8").replace(/\s+$/, "").split("\n").map((line) => line.replace(/\r$/, "").trimEnd())
		: [];
	return {
		id,
		title: meta.title ?? id,
		voice: meta.voice ?? "the Keeper",
		register: meta.register ?? "neutral",
		defaultMood: meta.default_mood ?? "neutral",
		body,
		laws,
		banner,
	};
}

function loadMoods(dir: string): Map<string, Mood> {
	const moods = new Map<string, Mood>();
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".md")) continue;
		const { meta, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
		const id = file.replace(/\.md$/, "");
		moods.set(id, {
			id,
			tone: meta.tone ?? id,
			severity: Number(meta.severity ?? 1),
			body,
		});
	}
	if (moods.size === 0) throw new Error(`no mood files in ${dir}`);
	return moods;
}

export function loadConfig(appDir: string, worldId: string): WorldConfig {
	const configDir = join(appDir, "config");
	if (!existsSync(configDir)) {
		throw new Error(`World Console config directory not found: ${configDir}`);
	}

	let textSites: SiteEntry[] = [{ host: "en.wikipedia.org" }];
	let pictureSites: SiteEntry[] = [{ host: "commons.wikimedia.org" }];
	let videoSites: SiteEntry[] = [{ host: "commons.wikimedia.org" }];
	const sitesFile = join(configDir, "sites.json");
	if (existsSync(sitesFile)) {
		const sites = JSON.parse(readFileSync(sitesFile, "utf8")) as {
			text?: SiteEntry[];
			picture?: SiteEntry[];
			video?: SiteEntry[];
		};
		const valid = (list?: SiteEntry[]) =>
			(list ?? []).filter((s) => typeof s?.host === "string" && s.host.length > 0);
		textSites = valid(sites.text);
		if (textSites.length === 0) textSites = [{ host: "en.wikipedia.org" }];
		pictureSites = valid(sites.picture);
		if (pictureSites.length === 0) pictureSites = [{ host: "commons.wikimedia.org" }];
		videoSites = valid(sites.video);
		if (videoSites.length === 0) videoSites = [{ host: "commons.wikimedia.org" }];
	}

	return {
		constitution: readFileSync(join(configDir, "constitution.md"), "utf8").trim(),
		world: loadWorld(join(configDir, "worlds"), worldId),
		moods: loadMoods(join(configDir, "moods")),
		textSites,
		pictureSites,
		videoSites,
	};
}

/** Mood ids ordered mildest → angriest, for prompts and tool schemas. */
export function moodIdsBySeverity(config: WorldConfig): string[] {
	return [...config.moods.values()].sort((a, b) => a.severity - b.severity).map((m) => m.id);
}
