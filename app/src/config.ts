/**
 * Config tree: constitution (fixed rules), one active world, moods, web sites.
 * Everything humans edit is markdown with frontmatter; sites are JSON.
 * `refresh()` re-reads the markdown so edits apply without a restart.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config, Mood, Sites, World } from "./types.ts";
import { parseFrontmatter } from "./util.ts";

const DEFAULT_SITES: Sites = {
  text: [{ host: "en.wikipedia.org" }],
  picture: [{ host: "commons.wikimedia.org" }],
};

function loadWorld(dir: string, id: string): World {
  const file = join(dir, `${id}.md`);
  if (!existsSync(file)) {
    const available = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .join(", ");
    throw new Error(`unknown world "${id}" — available: ${available}`);
  }
  const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
  return {
    id,
    title: meta.title ?? id,
    voice: meta.voice ?? "the Keeper",
    register: meta.register ?? "neutral",
    model: meta.model ?? "anthropic/claude-opus-5",
    defaultMood: meta.default_mood ?? "neutral",
    body,
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

export function loadConfig(root: string, worldId: string): Config {
  const configDir = join(root, "config");
  const sitesFile = join(configDir, "sites.json");

  let sites: Sites;
  if (existsSync(sitesFile)) {
    sites = JSON.parse(readFileSync(sitesFile, "utf8")) as Sites;
    sites.text ??= [];
    sites.picture ??= [];
  } else {
    sites = structuredClone(DEFAULT_SITES);
    writeFileSync(sitesFile, JSON.stringify(sites, null, 2) + "\n");
  }

  const config: Config = {
    root,
    constitution: "",
    world: loadWorld(join(configDir, "worlds"), worldId),
    moods: loadMoods(join(configDir, "moods")),
    sites,
    refresh() {
      try {
        this.constitution = readFileSync(join(configDir, "constitution.md"), "utf8").trim();
        this.world = loadWorld(join(configDir, "worlds"), worldId);
        this.moods = loadMoods(join(configDir, "moods"));
      } catch {
        // A broken edit mid-session keeps the last good config in memory.
      }
    },
    saveSites() {
      writeFileSync(sitesFile, JSON.stringify(this.sites, null, 2) + "\n");
    },
  };
  config.constitution = readFileSync(join(configDir, "constitution.md"), "utf8").trim();

  /** The angry mood is whichever has the highest severity. */
  return config;
}

export function angriestMood(config: Config): string {
  let angriest = config.world.defaultMood;
  let top = -1;
  for (const mood of config.moods.values()) {
    if (mood.severity > top) {
      top = mood.severity;
      angriest = mood.id;
    }
  }
  return angriest;
}
