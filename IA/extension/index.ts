/**
 * World Console as a pi extension — full game port.
 *
 *  - pi's coding system prompt is replaced every turn with the layered
 *    game-master prompt (constitution → world → mood → standing → protocol)
 *  - the built-in coding tools are stripped; the model gets the game tools:
 *      find_text / find_picture / find_video — the "scrying glass" lenses
 *        (MediaWiki text and file search, yt-dlp YouTube clip; downloads land
 *        in data/downloads/)
 *      set_mood          — mood shifts; the angriest mood bars the glass (code-owned)
 *      grant_redemption  — lifts the bar after sincere amends (no-op unless barred)
 *      record_name       — stores the seeker's name for the standing layer
 *      set_place / chronicle_place / update_place, record_persona /
 *      move_persona, grant_quest / update_quest / redeem_quest, add_item
 *                        — the open-world chronicle (places, souls, quests,
 *                          items as markdown under data/world/)
 *  - the game ledger lives INSIDE the pi session as custom entries and all
 *    state is derived from the current branch, so /new = fresh ledger,
 *    /fork copies it, /tree rewinds it, and branches never interfere
 *  - one world per session: the first ledger event stamps the world, and a
 *    resumed session keeps its stamped world even if --world says otherwise
 *  - while barred, every find_* tool is blocked in code (tool_call handler),
 *    not by trusting the prompt
 */
import { randomInt, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FooterComponent, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { chunkText, extractKeywords, formatArchiveLine, searchArchive, type ArchiveLine } from "./archive.ts";
import { loadConfig, moodIdsBySeverity, type WorldConfig } from "./config.ts";
import { gmAsk, gmJudgeAmendment, gmJudgeTruth, gmPlanFate, type GmFix, type GmTurn } from "./gmchat.ts";
import {
	asGameEvent,
	BAND_TICKS,
	derive,
	describeEvent,
	drawQuestShape,
	LEDGER_TYPE,
	planRedemption,
	planSetMood,
	rollBand,
	TIERS,
	type DerivedState,
	type FatePlan,
	type GameEvent,
	type PresentedOption,
} from "./ledger.ts";
import { detectTooling, searchPicture, searchVideo } from "./mediasearch.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import { searchText } from "./textsearch.ts";
import {
	addItem,
	countOpenQuests,
	extendPlace,
	foundPlace,
	grantQuest,
	hasItem,
	logEvent,
	movePersona,
	openQuestLines,
	personaExists,
	personaLocation,
	personasAt,
	placeExists,
	questBySlug,
	recordPersona,
	setQuestClock,
	setQuestStatus,
	slugify,
	visitPlace,
	type WorldFiles,
} from "./world.ts";

/** The IA folder: extension code, config, data and tools all live inside it. */
const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOWNLOAD_DIR = join(BASE_DIR, "data", "downloads");
/** Persistent world chronicle (places/personas/quests/items); overridable for tests. */
const DATA_ROOT = process.env.WORLD_CONSOLE_DATA_DIR || join(BASE_DIR, "data", "world");
const DEFAULT_WORLD = "dragon-realm";
const GAME_TOOLS = [
	"find_text", "find_picture", "find_video",
	"set_mood", "grant_redemption", "record_name",
	"set_place", "chronicle_place", "update_place", "record_persona", "move_persona",
	"grant_quest", "attempt_quest", "update_quest", "redeem_quest", "add_item",
	"offer_choices",
];
const SEARCH_KINDS = ["text", "picture", "video"] as const;
const KIND_BY_TOOL: Record<string, string> = {
	find_text: "text",
	find_picture: "picture",
	find_video: "video",
};
// Undertaking shapes: clock size / twist beat / finale flag. EVERY quest's
// completing stroke is a trial (check > 0 arms it — the playtest verdict:
// the peak must be contested); half additionally seal a mid-quest twist.
// "Simple" means no mid-work interruption, never no climax. Beats = clock/2.
// Full shuffle-bags come with Phase 3.
const SHAPES = [
	{ clock: 4, twist: 0, check: 1 },
	{ clock: 6, twist: 0, check: 1 },
	{ clock: 6, twist: 2, check: 1 },
	{ clock: 8, twist: 3, check: 1 },
] as const;
/** Trouble kinds a twist may be drawn from (the complication taxonomy). */
const SUITS = [
	"material failure", "world-law surprise", "persona interruption", "rival interference",
	"time pressure", "knowledge gap", "consequence echo", "windfall",
];
const MAX_OPEN_QUESTS = 4;
const TICK = 2; // standard beat = 2 clock segments

export default function (pi: ExtensionAPI) {
	// Fail loudly at load time if the config tree is broken — pi then reports
	// the extension error and stays a plain coding agent, which is clearer
	// than a half-loaded game.
	let worldId = process.env.WORLD_CONSOLE_WORLD || DEFAULT_WORLD;
	let config: WorldConfig = loadConfig(BASE_DIR, worldId);
	let st: DerivedState = derive([], config.world.defaultMood);
	let resumedFrom: string | undefined;
	const tooling = detectTooling(BASE_DIR); // vendored yt-dlp + bundled/system ffmpeg
	// Secret mark of genuine [engine:…] messages. Custom messages reach the
	// model as plain user turns, so without this a seeker typing "[engine] …"
	// would be indistinguishable from the engine and could talk the model into
	// grant_redemption. Fresh per run; the player never sees it (the renderer
	// hides the raw hand-off, and the GM table gets a placeholder).
	const ENGINE_NONCE = randomUUID().slice(0, 8);

	pi.registerFlag("world", {
		description: `World Console: world id from IA/config/worlds (default: ${DEFAULT_WORLD})`,
		type: "string",
	});

	function angriestMood(): string {
		const ids = moodIdsBySeverity(config);
		return ids[ids.length - 1];
	}

	// Each STORY gets its own world-file folder, keyed by the chronicle stamp
	// in its ledger: /new founds a fresh chronicle, /fork inherits the parent's
	// (entries copy), and pre-stamp sessions that already used world files are
	// adopted onto the legacy shared folder ("" key).
	const worldFiles = (): WorldFiles => ({ root: join(DATA_ROOT, worldId, st.chronicle ?? "") });

	/** Quest headings for the standing layer; unreadable files never break a turn. */
	function questStandings(): string[] {
		try {
			return openQuestLines(worldFiles());
		} catch {
			return [];
		}
	}

	/** Reload config for `id`; on failure keep the last good config. */
	function reloadFor(id: string): boolean {
		try {
			config = loadConfig(BASE_DIR, id);
			return true;
		} catch {
			return false;
		}
	}

	function replay(ctx: ExtensionContext): void {
		uiCtx = ctx; // keep the footer's data source pointing at the live context
		st = derive(ctx.sessionManager.getBranch(), config.world.defaultMood);
	}

	/**
	 * The chronicle stamp for a branch that lacks one. A story that already
	 * wrote world files before chronicles existed keeps the legacy shared
	 * folder (""); every other story gets its own folder keyed by session id.
	 * Also heals a leaf that /tree moved above its stamp — world files must
	 * never silently fall back to the legacy folder.
	 */
	function chronicleStamp(ctx: ExtensionContext): GameEvent[] {
		if (st.chronicle !== undefined) return [];
		const usedWorldFiles = ctx.sessionManager.getBranch().some((entry) => {
			const event = asGameEvent(entry);
			return (
				!!event &&
				(event.ev === "place" || event.ev === "persona" || event.ev === "quest" || event.ev === "item")
			);
		});
		const key = usedWorldFiles ? "" : ctx.sessionManager.getSessionId() || randomUUID();
		return [{ ev: "chronicle", key }];
	}

	// ---- footer -----------------------------------------------------------
	// Custom footer: pi's stock stats line (cost, "(sub)", context %, model •
	// thinking — rendered by the real FooterComponent, so formatting stays
	// byte-identical to stock pi) with the game line below it, and no cwd line.
	let uiCtx: ExtensionContext | undefined;
	let requestFooterRender: (() => void) | undefined;

	function gameFooterLine(): string {
		const barred = st.banned ? " · glass BARRED" : "";
		const place = st.place ? ` · ${st.place.title}` : "";
		return `${config.world.voice} · mood: ${st.mood}${barred} · ${config.world.title}${place}`;
	}

	function installFooter(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui" || typeof ctx.ui.setFooter !== "function") return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestFooterRender = () => tui.requestRender();
			// FooterComponent only reads state.model/state.thinkingLevel,
			// sessionManager, getContextUsage() and modelRuntime.isUsingOAuth()
			// — all reachable through the extension context.
			const sessionLike = {
				get state() {
					return { model: uiCtx?.model, thinkingLevel: uiCtx?.thinkingLevel };
				},
				sessionManager: ctx.sessionManager,
				getContextUsage: () => uiCtx?.getContextUsage(),
				modelRuntime: {
					isUsingOAuth: (_provider: string): boolean => {
						try {
							const registry = uiCtx?.modelRegistry as { isUsingOAuth?: (model: unknown) => boolean } | undefined;
							return registry?.isUsingOAuth?.(uiCtx?.model) ?? false;
						} catch {
							return false;
						}
					},
				},
			};
			const inner = new FooterComponent(sessionLike as never, footerData);
			return {
				invalidate() {
					(inner as { invalidate?(): void }).invalidate?.();
				},
				dispose() {
					(inner as { dispose?(): void }).dispose?.();
					requestFooterRender = undefined;
				},
				render(width: number): string[] {
					// Stock lines are [cwd, stats, extension-statuses?] — drop the
					// cwd line, keep the stats line, add the game line, and pass
					// through any other extension's status line.
					const stock = inner.render(width);
					const game = truncateToWidth(theme.fg("dim", gameFooterLine()), width, theme.fg("dim", "..."));
					return [stock[1] ?? "", game, ...stock.slice(2)];
				},
			};
		});
	}

	function updateFooter(_ctx: ExtensionContext): void {
		requestFooterRender?.();
	}

	// ---- undertakings: shape draws, choice widget, hotkeys -----------------

	/** Draw a quest's shape — pacing rules live in drawQuestShape (pure, tested). */
	function drawShape(selfSet: boolean): { clock: number; twist: number; check: number } {
		return drawQuestShape(SHAPES, st.recentShapes.at(-1), selfSet, (n) => randomInt(n));
	}

	/** Draw the twist's trouble kind, avoiding the most recent one. */
	function drawSuit(): string {
		const lastSuit = st.recentSuits.at(-1);
		const pool = SUITS.filter((suit) => suit !== lastSuit);
		return pool[randomInt(pool.length)];
	}

	/**
	 * The visible face of a plan's options: blue options (with `requires`)
	 * render only when the chronicle proves the seeker qualifies — preparation
	 * visibly buys a better path (goals F2).
	 */
	function presentableOptions(plan: FatePlan, files: WorldFiles): PresentedOption[] {
		const visible: PresentedOption[] = [];
		for (const option of plan.options) {
			let unlockedBy: string | undefined;
			if (option.requires) {
				const { item, persona, place } = option.requires;
				if (item) {
					if (!hasItem(files, item)) continue;
					unlockedBy = `their items hold ${item}`;
				} else if (persona) {
					if (!personaExists(files, persona)) continue;
					unlockedBy = `${persona} is chronicled`;
				} else if (place) {
					if (!placeExists(files, place)) continue;
					unlockedBy = `${place} is chronicled`;
				}
			}
			visible.push({ id: option.id, label: option.label, risk: option.risk, promise: option.promise, unlockedBy });
		}
		return visible;
	}

	/** The pending choice/trial panel above the editor; never blocks typing (G7). */
	function updateWidgets(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui" || typeof ctx.ui.setWidget !== "function") return;
		const pending = st.pendingChoice;
		if (pending) {
			const head =
				pending.kind === "offer"
					? `⟡ choices before you — ${clip(pending.text, 110)}`
					: `⟡ the task twists — ${clip(pending.text, 110)}`;
			const foot =
				pending.kind === "offer"
					? `   choose: Alt+number or /pick <n> [your own words] — or simply speak on (the offer lapses)`
					: `   choose: Alt+number or /pick <n> [your own words] — plain talk stays free`;
			ctx.ui.setWidget("world-console.choice", [
				head,
				...pending.options.map(
					(option) =>
						`   [${option.id}] ${option.label}` +
						(option.risk ? ` · ${option.risk}` : "") +
						(option.promise ? ` · ${clip(option.promise, 60)}` : "") +
						(option.unlockedBy ? ` · ⚑ ${option.unlockedBy}` : ""),
				),
				foot,
			]);
			return;
		}
		const trial = st.pendingRoll;
		if (trial) {
			ctx.ui.setWidget("world-console.choice", [
				`⚀ a trial bars the way — ${trial.tier} (DC ${trial.dc})` +
					(trial.edge ? ` · ${trial.edge}: two dice, ${trial.edge === "favored" ? "best" : "worst"} counts` : ""),
				`   cast the die: /roll — plain talk stays free until it falls`,
			]);
			return;
		}
		ctx.ui.setWidget("world-console.choice", undefined);
	}

	let unsubTerminalInput: (() => void) | undefined;

	/** Alt+1..9 prefill "/pick n " so the seeker can add words and submit. */
	function installChoiceHotkeys(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui" || typeof ctx.ui.onTerminalInput !== "function") return;
		unsubTerminalInput?.();
		unsubTerminalInput = ctx.ui.onTerminalInput((data) => {
			const pending = st.pendingChoice;
			if (!pending) return undefined;
			const key = data.match(/^\x1b([1-9])$/); // Alt+digit
			if (!key) return undefined;
			const id = Number(key[1]);
			if (!pending.options.some((option) => option.id === id)) return undefined;
			ctx.ui.setEditorText(`/pick ${id} `);
			return { consume: true };
		});
	}

	/**
	 * Append ledger events, then re-derive state from the branch (single
	 * source of truth). Each event is also mirrored, human-readably, into the
	 * story's data/world/<world>/<chronicle>/ledger.md so players can read
	 * the log without opening pi's session JSONL.
	 */
	function appendEvents(ctx: ExtensionContext, events: GameEvent[]): void {
		for (const event of events) pi.appendEntry(LEDGER_TYPE, event);
		replay(ctx); // before logging: a chronicle stamp in this batch decides the log's folder
		const total = ctx.sessionManager.getEntries().length;
		const files = worldFiles();
		const time = new Date().toISOString().slice(0, 16).replace("T", " ");
		events.forEach((event, index) => {
			logEvent(files, `*u${total - events.length + index + 1}* ${time}  ${describeEvent(event)}`);
		});
		updateFooter(ctx);
		updateWidgets(ctx);
	}

	function branchHasAssistantReply(ctx: ExtensionContext): boolean {
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant") {
				return true;
			}
		}
		return false;
	}

	// ---- the GM table (/gm, /dm) ------------------------------------------
	// Out-of-character talk with the engine. Lives in RAM only: nothing here
	// touches the session, the game context, or the ledger — except a bound
	// truth, which is appended as a regular ledger event.
	let gmThread: GmTurn[] = [];

	function clip(text: string, max: number): string {
		const flat = text.replace(/\s+/g, " ").trim();
		return flat.length > max ? flat.slice(0, max) + "…" : flat;
	}

	/** Loose equality for truth texts: case, spacing, quotes and a final period
	 * must not keep the judge's echo of a superseded truth from matching it. */
	function sameTruth(a: string, b: string): boolean {
		const normalize = (text: string) =>
			text.toLowerCase().replace(/\s+/g, " ").trim().replace(/^["'«»]+|["'«».]+$/g, "");
		return normalize(a) === normalize(b);
	}

	/**
	 * The whole branch as numbered lines — play messages AND ledger events.
	 * uN = the entry's 1-based position in the append-only session file, so
	 * the numbers are stable across branches and never renumber.
	 */
	function archiveLinesOf(ctx: ExtensionContext): ArchiveLine[] {
		const uidByEntryId = new Map<string, number>();
		ctx.sessionManager.getEntries().forEach((entry, index) => {
			uidByEntryId.set((entry as { id: string }).id, index + 1);
		});
		const lines: ArchiveLine[] = [];
		for (const entry of ctx.sessionManager.getBranch()) {
			const uid = uidByEntryId.get((entry as { id: string }).id) ?? 0;
			const event = asGameEvent(entry);
			if (event) {
				lines.push({ uid, who: "ledger", text: describeEvent(event) });
				continue;
			}
			if (entry.type !== "message") continue;
			const message = (entry as { message?: { role?: string; content?: unknown } }).message;
			if (!message) continue;
			let text = "";
			if (typeof message.content === "string") text = message.content;
			else if (Array.isArray(message.content)) {
				text = (message.content as { type?: string; text?: string }[])
					.filter((block) => block.type === "text")
					.map((block) => block.text ?? "")
					.join(" ");
			}
			if (!text.trim()) continue;
			const who = message.role === "user" ? "seeker" : message.role === "assistant" ? "game" : null;
			if (!who) continue;
			// Long speeches become several lines sharing one uid, so a fact deep
			// inside them is still searchable and shows in excerpts.
			for (const chunk of chunkText(text)) lines.push({ uid, who, text: chunk });
		}
		return lines;
	}

	function branchPlayLines(ctx: ExtensionContext, limit = 16): string[] {
		const lines = archiveLinesOf(ctx)
			.filter((line) => line.who !== "ledger")
			.map(formatArchiveLine);
		return withTail(lines, limit);
	}

	function branchLedgerLines(ctx: ExtensionContext, limit = 40): string[] {
		const lines = archiveLinesOf(ctx)
			.filter((line) => line.who === "ledger")
			.map(formatArchiveLine);
		return withTail(lines, limit);
	}

	function withTail(lines: string[], limit: number): string[] {
		if (lines.length <= limit) return lines;
		return [`…(${lines.length - limit} earlier lines omitted)`, ...lines.slice(-limit)];
	}

	/**
	 * The record a proposed truth is checked against (code-collected): the
	 * newest ledger and play lines PLUS a keyword search over the full record
	 * for the statement's own words — so a contradiction older than the tail
	 * windows still reaches the judge in a long sitting.
	 */
	function truthEvidence(ctx: ExtensionContext, text: string) {
		return {
			truths: st.truths,
			ledgerLines: branchLedgerLines(ctx, 80),
			playLines: branchPlayLines(ctx, 80),
			archiveHits: searchArchive(archiveLinesOf(ctx), extractKeywords(text), 1, 40).map(formatArchiveLine),
		};
	}

	/**
	 * Execute one table-proposed repair. The meta-GM judged it record-backed;
	 * this is where code enforces the hard invariants regardless: unknown
	 * pages refuse, quests only move forward, souls move only with a reason.
	 * Returns the announcement line; throws to have the repair skipped.
	 */
	function applyGmFix(ctx: ExtensionContext, fix: GmFix): string {
		const files = worldFiles();
		switch (fix.kind) {
			case "place": {
				const name = String(fix.name ?? "").trim();
				if (!name) throw new Error("a place fix needs the place's name");
				const description = String(fix.description ?? "").trim();
				if (!placeExists(files, name) && !description) {
					throw new Error(`"${name}" is not chronicled and no description was given`);
				}
				const visit = visitPlace(files, name, description);
				appendEvents(ctx, [{ ev: "place", slug: visit.slug, title: visit.title }]);
				return `the party now stands at ${visit.title} — footer and standing follow`;
			}
			case "place_note": {
				const place = String(fix.place ?? "").trim();
				const note = String(fix.note ?? "").trim();
				if (!place || !note) throw new Error("a page note needs the place and the note");
				if (!extendPlace(files, place, `Correction (GM table): ${note}`)) {
					throw new Error(`no page exists for "${place}"`);
				}
				return `a correction is noted on the page of ${place}`;
			}
			case "chronicle_place": {
				const name = String(fix.name ?? "").trim();
				const description = String(fix.description ?? "").trim();
				if (!name || !description) throw new Error("chronicling a place needs its name and description");
				const found = foundPlace(files, name, description);
				appendEvents(ctx, [{ ev: "place_chronicled", slug: found.slug, title: found.title }]);
				return found.created
					? `the place ${found.title} is chronicled from afar (the party has not moved)`
					: `${found.title} was already chronicled`;
			}
			case "quest_grant": {
				if (!st.place) throw new Error("the party stands nowhere — a task needs a place of granting");
				const title = String(fix.title ?? "").trim();
				const task = String(fix.task ?? "").trim();
				if (!title || !task) throw new Error("a task needs a title and what must be done");
				const reward = String(fix.reward ?? "").trim() || "what the story yields";
				const giver = String(fix.giver ?? "").trim() || undefined;
				// Repairs pass the same gate as grant_quest itself: the giver must
				// be recorded AND present — a repair must not smuggle a quest past
				// the rules the game enforces.
				if (giver) {
					if (!personaExists(files, giver)) {
						throw new Error(`no page exists for ${giver} — chain a persona_record fix before this one`);
					}
					const location = personaLocation(files, giver);
					if (location !== st.place.slug) {
						throw new Error(
							`${giver} is not at ${st.place.title} — the chronicle places them at ${location ?? "nowhere"}; ` +
								`chain a persona_move fix (with the record's reason) before this one`,
						);
					}
				}
				// Repairs record what already happened: a small clock, no twist —
				// the finale stays armed like any quest.
				const { slug } = grantQuest(files, { title, giver, task, reward, placeSlug: st.place.slug, clockSize: 4 });
				appendEvents(ctx, [
					{ ev: "quest", action: "granted", title },
					{ ev: "quest_shape", slug, clock: 4, twist: 0, check: 1 },
				]);
				return `the task "${title}" is chronicled [open]${giver ? ` — giver ${giver}` : " — set by the seeker"} (id: ${slug})`;
			}
			case "persona_record": {
				const name = String(fix.name ?? "").trim();
				const place = String(fix.place ?? "").trim();
				if (!name || !place) throw new Error("recording a soul needs their name and place");
				if (!placeExists(files, place)) {
					throw new Error(`no page exists for the place "${place}" — chain a chronicle_place fix before this one`);
				}
				recordPersona(files, name, String(fix.role ?? "").trim() || "(role unrecorded)", String(fix.dealings ?? "").trim() || "(dealings unrecorded)", slugify(place));
				appendEvents(ctx, [{ ev: "persona", name, place: slugify(place), note: "GM-table repair" }]);
				return `the soul ${name} is chronicled at ${place}`;
			}
			case "persona_move": {
				const name = String(fix.name ?? "").trim();
				const toPlace = String(fix.to_place ?? "").trim();
				const reason = String(fix.reason ?? "").trim();
				if (!personaExists(files, name)) throw new Error(`no page exists for ${name}`);
				if (!placeExists(files, toPlace)) throw new Error(`no page exists for the place "${toPlace}"`);
				if (reason.length < 10) throw new Error("a move needs a real reason, plainly stated");
				movePersona(files, name, slugify(toPlace), `${reason} (GM-table repair)`);
				appendEvents(ctx, [{ ev: "persona", name, place: slugify(toPlace), note: reason }]);
				return `${name} now dwells at ${toPlace} (reason recorded)`;
			}
			case "quest_status": {
				const slug = slugify(String(fix.title ?? ""));
				const quest = questBySlug(files, slug);
				if (!quest) throw new Error(`no quest "${fix.title}" in the chronicle`);
				const order = { open: 0, done: 1, rewarded: 2, failed: 3 } as const;
				const target = fix.status === "rewarded" ? "rewarded" : "done";
				if (order[target] <= order[quest.status]) {
					throw new Error(`"${quest.title}" already stands at [${quest.status}]`);
				}
				const note = String(fix.note ?? "").trim() || "corrected at the GM table";
				const events: GameEvent[] = [];
				if (target === "rewarded" && quest.status === "open") {
					// Passing through [done] gets its own ledger event and a terse
					// note — the real note belongs to the final step, once.
					setQuestStatus(files, slug, "done", "deed done (GM-table repair)");
					events.push({ ev: "quest", action: "done", title: quest.title });
				}
				setQuestStatus(files, slug, target, note);
				events.push({ ev: "quest", action: target, title: quest.title });
				if (target === "rewarded") {
					addItem(files, `${quest.reward} — reward of "${quest.title}" (GM-table repair)`);
					events.push({ ev: "item", text: quest.reward });
				}
				appendEvents(ctx, events);
				return `"${quest.title}" now stands at [${target}]${target === "rewarded" ? `; ${quest.reward} chronicled in the items` : ""}`;
			}
			case "item": {
				const item = String(fix.item ?? "").trim();
				if (!item) throw new Error("an item fix needs the item");
				addItem(files, `${item} — ${String(fix.origin ?? "").trim() || "GM-table repair"}`);
				appendEvents(ctx, [{ ev: "item", text: item }]);
				return `the seeker's items now hold: ${item}`;
			}
			case "trial": {
				const slug = slugify(String(fix.title ?? ""));
				const quest = questBySlug(files, slug);
				if (!quest) throw new Error(`no quest "${fix.title}" in the chronicle`);
				if (quest.status !== "open") throw new Error(`"${quest.title}" stands [${quest.status}] — only open work can be tried`);
				if (st.pendingChoice || st.pendingRoll) {
					throw new Error("something already awaits the seeker's word — one gate at a time");
				}
				const byWeight = { easy: TIERS[4], middling: TIERS[6], hard: TIERS[8] } as const;
				const u = st.undertakings[slug];
				const { tier, dc } = byWeight[fix.weight as keyof typeof byWeight] ?? TIERS[u?.size ?? 6] ?? TIERS[6];
				const trial = String(fix.reason ?? "").trim() || "the table's judgment: this moment must be earned";
				appendEvents(ctx, [{ ev: "check", slug, tier, dc, trial, kind: "hazard" }]);
				return `a trial now bars "${quest.title}" — ${tier} (DC ${dc}); the seeker casts the die (/roll)`;
			}
			case "choices": {
				const prompt = String(fix.prompt ?? "").trim();
				const labels = (Array.isArray(fix.options) ? fix.options : [])
					.map((option) => String(option ?? "").trim())
					.filter(Boolean)
					.slice(0, 5);
				if (!prompt || labels.length < 2) throw new Error("choices need a prompt and 2–5 courses");
				if (st.pendingChoice || st.pendingRoll) {
					throw new Error("something already awaits the seeker's word — one gate at a time");
				}
				const options: PresentedOption[] = labels.map((label, index) => ({ id: index + 1, label, risk: "", promise: "" }));
				appendEvents(ctx, [{ ev: "offer", text: prompt, options }]);
				return `choices now stand before the seeker: ${labels.join(" · ")} (they pick, or speak past them)`;
			}
			default:
				throw new Error(`unknown repair kind "${(fix as { kind?: string }).kind}"`);
		}
	}

	pi.on("session_start", async (event, ctx) => {
		installFooter(ctx);
		gmThread = []; // the GM table is per sitting

		const flagWorld = pi.getFlag("world");
		const requested =
			(typeof flagWorld === "string" && flagWorld) || process.env.WORLD_CONSOLE_WORLD || DEFAULT_WORLD;

		// One world per session: an existing stamp wins over --world / env.
		const stamped = derive(ctx.sessionManager.getBranch(), "neutral").world;
		worldId = stamped ?? requested;
		if (stamped && stamped !== requested && ctx.hasUI) {
			ctx.ui.notify(
				`This session is bound to world "${stamped}" — use /new to start a session in "${requested}".`,
				"warning",
			);
		}
		if (!reloadFor(worldId)) {
			if (ctx.hasUI) {
				ctx.ui.notify(`World "${worldId}" failed to load — staying with "${config.world.id}".`, "error");
			}
			worldId = config.world.id;
		}

		replay(ctx);
		resumedFrom = st.lastEntryAt; // undefined on a fresh session
		// One batch, chronicle stamp included: appendEvents replays before
		// mirroring, so even the world line lands in the story's own ledger.md
		// (split appends used to misfile it into the legacy shared folder).
		const boot: GameEvent[] = [];
		if (!st.world) boot.push({ ev: "world", world: worldId });
		boot.push(...chronicleStamp(ctx));
		if (boot.length > 0) appendEvents(ctx, boot);

		pi.setActiveTools(GAME_TOOLS);
		updateFooter(ctx);
		updateWidgets(ctx);
		installChoiceHotkeys(ctx);
		if (!pi.getSessionName()) pi.setSessionName(`World Console — ${config.world.title}`);
		if (ctx.hasUI && (event.reason === "startup" || event.reason === "new")) {
			ctx.ui.notify(`World Console: ${config.world.title} (world: ${worldId}, mood: ${st.mood})`, "info");
		}
	});

	// /tree moves the leaf to another branch: derive everything again from it.
	pi.on("session_tree", async (_event, ctx) => {
		replay(ctx);
		// A leaf moved above its chronicle stamp gets a fresh one at once —
		// world files must never fall back to the legacy shared folder.
		const stamp = chronicleStamp(ctx);
		if (stamp.length > 0) appendEvents(ctx, stamp);
		updateFooter(ctx);
		updateWidgets(ctx); // a rewind may open or close a pending choice
	});

	pi.on("before_agent_start", async (event, ctx) => {
		reloadFor(worldId); // hot reload: config edits apply on the next turn
		replay(ctx);
		// Belt and braces: no turn (and so no world-file write) ever runs on an
		// unstamped branch, whatever moved the leaf.
		const stamp = chronicleStamp(ctx);
		if (stamp.length > 0) appendEvents(ctx, stamp);
		// An open OFFER never binds: the seeker speaking past it (any turn that
		// is not its own /pick resolution) lets it lapse. Twists stay standing.
		if (st.pendingChoice?.kind === "offer") appendEvents(ctx, [{ ev: "offer_dropped" }]);
		// In-game archive recall: search the sitting's FULL record (compaction
		// notwithstanding — getBranch keeps every entry) for this turn's words
		// and hand the hits to the keeper through a prompt layer. Pure code,
		// refreshed every turn, nothing written back.
		const recall = searchArchive(archiveLinesOf(ctx), extractKeywords(event.prompt ?? ""), 1, 20).map(
			formatArchiveLine,
		);
		return {
			systemPrompt: assembleSystemPrompt(config, {
				state: st,
				engineNonce: ENGINE_NONCE,
				resumedFrom,
				justArrived: !branchHasAssistantReply(ctx),
				openQuests: questStandings(),
				recall,
			}),
		};
	});

	// The ban is code-enforced: while barred, no find_* tool ever runs.
	pi.on("tool_call", async (event, ctx) => {
		const kind = KIND_BY_TOOL[event.toolName];
		if (kind && st.banned) {
			appendEvents(ctx, [{ ev: "search_refused", category: "banned", kind }]);
			return {
				block: true,
				reason:
					"The scrying glass is barred to this seeker. Only grant_redemption — after sincere amends — lifts the bar.",
			};
		}
	});

	// /web <text|picture|video> <query> — the seeker invokes the scrying glass
	// directly. The engine enforces the ban without an LLM call; everything
	// else is handed to the game master, who judges the request in character
	// and performs it through the matching find_* tool.
	pi.registerCommand("web", {
		description: "World Console: scry the web — /web <text|picture|video> <query>",
		getArgumentCompletions: (prefix: string) => {
			if (prefix.includes(" ")) return null; // kind chosen — the query is free-form
			const bare = prefix.replace(/^-/, "");
			const items = SEARCH_KINDS.filter((kind) => kind.startsWith(bare)).map((kind) => ({
				value: `${kind} `,
				label: kind,
			}));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const trimmed = (args ?? "").trim();
			const [rawKind, ...rest] = trimmed.split(/\s+/);
			const kind = (rawKind ?? "").replace(/^-/, "").toLowerCase();
			const query = rest.join(" ").trim();
			if (!(SEARCH_KINDS as readonly string[]).includes(kind) || !query) {
				ctx.ui.notify("Usage: /web <text|picture|video> <query>", "warning");
				return;
			}
			if (st.banned) {
				appendEvents(ctx, [{ ev: "search_refused", category: "banned", kind }]);
				ctx.ui.notify(
					`The scrying glass is barred to this seeker — the ${kind} scrying is refused. Redemption must be earned in speech.`,
					"warning",
				);
				return;
			}
			const tool = `find_${kind}`;
			pi.sendMessage(
				{
					customType: "world-console.command",
					content:
						`[engine:${ENGINE_NONCE}] The seeker invokes the scrying glass directly: kind="${kind}", query="${query}". ` +
						`Judge this request against the world's theme and the constitution (refuse what is foreign politely; refuse filth with anger). ` +
						`If worthy, perform it now with the ${tool} tool and present the findings in your voice. If not, refuse in character.`,
					display: true,
					details: { kind, query },
				},
				{ triggerTurn: true },
			);
		},
	});

	// The raw [engine] hand-off must never reach the seeker's eyes (the protocol
	// forbids naming tools and engines) — the transcript shows a dim in-world
	// line instead, while the full text still goes to the model.
	pi.registerMessageRenderer<{ kind?: string; query?: string }>("world-console.command", (message, options, theme) => {
		const { kind, query } = message.details ?? {};
		const line =
			kind && query
				? `· the seeker invokes the scrying glass — ${kind}: "${query}"`
				: "· the seeker invokes the scrying glass";
		return new Text(theme.fg("dim", line), options.outputPad, 0);
	});

	// /pick <n> [extra words] — the seeker commits to a path of a pending
	// twist. Code resolves it against the sealed plan (the keeper never held
	// the answer sheet) and hands the outcome over for narration.
	pi.registerCommand("pick", {
		description: "World Console: choose a path when the task twists — /pick <n> [your own words]",
		getArgumentCompletions: (prefix: string) => {
			const pending = st.pendingChoice;
			if (!pending || prefix.includes(" ")) return null;
			const items = pending.options
				.filter((option) => String(option.id).startsWith(prefix.trim()) || !prefix.trim())
				.map((option) => ({
					value: `${option.id} `,
					label: `${option.id} — ${option.label} (${option.risk}) · ${clip(option.promise, 40)}`,
				}));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const pending = st.pendingChoice;
			if (!pending) {
				ctx.ui.notify("No choice stands open before the seeker.", "info");
				return;
			}
			const match = (args ?? "").trim().match(/^(\d+)(?:\s+([\s\S]+))?$/);
			if (!match) {
				ctx.ui.notify(
					`Usage: /pick <n> [your own words] — open paths: ${pending.options
						.map((option) => `[${option.id}] ${option.label}`)
						.join(" · ")}`,
					"warning",
				);
				return;
			}
			const id = Number(match[1]);
			const extra = match[2]?.trim() || undefined;
			const chosen = pending.options.find((option) => option.id === id);
			if (!chosen) {
				ctx.ui.notify(
					`No path [${id}] stands open — choose ${pending.options.map((option) => option.id).join(", ")}.`,
					"warning",
				);
				return;
			}
			if (pending.kind === "offer") {
				// An open offer: no sealed outcomes — the pick simply becomes the
				// seeker's declared course, handed to the keeper to play onward.
				appendEvents(ctx, [{ ev: "pick", slug: "", option: id, label: chosen.label, extra }]);
				pi.sendMessage(
					{
						customType: "world-console.pick",
						content:
							`[engine:${ENGINE_NONCE}] From the choices laid out ("${pending.text}") the seeker points at ` +
							`[${id}] "${chosen.label}"${extra ? ` and speaks: "${extra}"` : ""}. This is their chosen course — ` +
							`carry the story onward from it in your voice.`,
						display: true,
						details: { id, label: chosen.label, extra },
					},
					{ triggerTurn: true },
				);
				return;
			}
			const hidden = st.undertakings[pending.slug]?.plan?.options.find((option) => option.id === id);
			const files = worldFiles();
			const quest = questBySlug(files, pending.slug);
			if (!hidden || !quest) {
				ctx.ui.notify("The sealed fate for this choice is missing from the record — raise it at the GM table (/gm).", "error");
				return;
			}
			const add = hidden.band === "setback" ? -1 : hidden.band === "fail" ? 0 : TICK;
			const events: GameEvent[] = [
				{ ev: "pick", slug: pending.slug, option: id, label: chosen.label, extra },
				{ ev: "outcome", slug: pending.slug, band: hidden.band, add, text: hidden.reveal },
			];
			if (hidden.band === "windfall" && hidden.loot) {
				addItem(files, `${hidden.loot} — found amid "${quest.title}"`);
				events.push({ ev: "item", text: hidden.loot });
			}
			if (hidden.band === "fail") {
				setQuestStatus(files, pending.slug, "failed", `the "${chosen.label}" path undid it`);
				events.push({ ev: "quest", action: "failed", title: quest.title });
			}
			appendEvents(ctx, events);
			const u = st.undertakings[pending.slug];
			if (u && hidden.band !== "fail") setQuestClock(files, pending.slug, u.filled, u.size);
			pi.sendMessage(
				{
					customType: "world-console.pick",
					content:
						`[engine:${ENGINE_NONCE}] For the task "${quest.title}" the seeker chose path [${id}] "${chosen.label}"` +
						`${extra ? ` and spoke: "${extra}"` : ""}. Sealed outcome (${hidden.band}): ${hidden.reveal} ` +
						`The why, for your telling (plant it so the seeker could trace it): ${hidden.reason}` +
						`${hidden.band === "fail" ? " The task is FAILED and closed in the chronicle." : ""}` +
						`${hidden.band === "windfall" && hidden.loot ? ` ${hidden.loot} now lies in the seeker's items.` : ""}` +
						`${u && hidden.band !== "fail" ? ` The work now stands at ${u.filled}/${u.size}.` : ""} ` +
						`Narrate this as living story in your voice — never name the mechanics — and end with an open move for the seeker.`,
					display: true,
					details: { id, label: chosen.label, extra },
				},
				{ triggerTurn: true },
			);
		},
	});

	// The pick stays visible in the transcript — a colored, permanent record
	// of where the seeker committed (not a dim aside).
	pi.registerMessageRenderer<{ id?: number; label?: string; extra?: string }>(
		"world-console.pick",
		(message, options, theme) => {
			const { id, label, extra } = message.details ?? {};
			const line =
				id && label
					? theme.fg("accent", `⟡ path taken — [${id}] ${label}`) + (extra ? theme.fg("dim", ` · "${extra}"`) : "")
					: theme.fg("accent", "⟡ the seeker commits to a path");
			return new Text(line, options.outputPad, 0);
		},
	);

	/**
	 * The dice ceremony (TUI): a focused overlay — the roll cannot be missed,
	 * but it is summoned only at the moment of casting. Space casts; on a miss
	 * with grit in hand, the seeker may spend it for one reroll AFTER seeing
	 * the die (the BG3 moment). Escape before casting leaves the trial
	 * standing (the gate holds); once cast, the die is law.
	 */
	function rollCeremony(
		ctx: ExtensionContext,
		trial: { tier: string; dc: number; edge?: "favored" | "hindered" },
		gritAvailable: boolean,
	): Promise<{ dice: number[]; kept: number; grit: boolean } | null> {
		const throwDice = () => {
			const count = trial.edge ? 2 : 1;
			const dice = Array.from({ length: count }, () => randomInt(1, 21));
			const kept =
				trial.edge === "favored" ? Math.max(...dice) : trial.edge === "hindered" ? Math.min(...dice) : dice[0];
			return { dice, kept };
		};
		return ctx.ui.custom<{ dice: number[]; kept: number; grit: boolean } | null>(
			(tui, theme, _keybindings, done) => {
				let phase: "ready" | "rolling" | "offer" | "landed" = "ready";
				let shown: number[] = [];
				let dice: number[] = [];
				let thrown: number[] = [];
				let kept = 0;
				let grit = false;
				let timer: ReturnType<typeof setInterval> | undefined;
				const cast = () => {
					phase = "rolling";
					let ticks = 0;
					timer = setInterval(() => {
						shown = Array.from({ length: trial.edge ? 2 : 1 }, () => randomInt(1, 21));
						ticks++;
						tui.requestRender();
						if (ticks >= 9) {
							if (timer) clearInterval(timer);
							const landed = throwDice();
							dice = landed.dice;
							thrown = [...thrown, ...landed.dice];
							kept = landed.kept;
							shown = dice;
							phase = !grit && gritAvailable && kept < trial.dc ? "offer" : "landed";
							tui.requestRender();
						}
					}, 75);
				};
				const face = (value: number) =>
					value === 20 ? theme.fg("success", String(value).padStart(2)) : value === 1 ? theme.fg("error", String(value).padStart(2)) : String(value).padStart(2);
				const bandColor = (band: string) =>
					band === "great" || band === "success" ? "success" : band === "cost" ? "warning" : "error";
				return {
					render(width: number): string[] {
						// The ceremony wears its own frame and color — never mistakable
						// for the transcript behind it. (Left-edge frame only: padding a
						// right edge against ANSI-colored strings miscounts widths.)
						const inner = Math.min(width - 2, 52);
						const frame = (line: string) => theme.fg("borderAccent", "│ ") + truncateToWidth(line, inner - 4, "…");
						const head = theme.fg("accent", `⚀ THE FATES ROLL — ${trial.tier} · DC ${trial.dc}`);
						const edgeLine = trial.edge
							? theme.fg("warning", `${trial.edge}: two dice, ${trial.edge === "favored" ? "the best" : "the worst"} counts`)
							: "";
						const dieFaces =
							phase === "ready"
								? "┌────┐  \n│ ?? │  \n└────┘  "
								: shown
										.map(() => "┌────┐")
										.join("  ") +
									"\n" +
									shown.map((v) => `│ ${phase === "rolling" ? String(v).padStart(2) : face(v)} │`).join("  ") +
									"\n" +
									shown.map(() => "└────┘").join("  ");
						const verdict =
							phase === "landed" || phase === "offer"
								? theme.fg(
										bandColor(rollBand(kept, trial.dc)),
										`→ ${kept} against DC ${trial.dc} — ${rollBand(kept, trial.dc)}${grit ? " (grit spent)" : ""}`,
									)
								: "";
						const hint = theme.fg(
							"dim",
							phase === "ready"
								? "[space] cast the die · [esc] not yet (the trial stands)"
								: phase === "rolling"
									? "the die tumbles…"
									: phase === "offer"
										? "fallen short — [g] spend grit, reroll once · [enter] let it stand"
										: "[enter] so it stands",
						);
						const body = [head, edgeLine, "", ...dieFaces.split("\n"), verdict, "", hint].filter(
							(line, index) => !(line === "" && index === 1),
						);
						return [
							theme.fg("borderAccent", "╭" + "─".repeat(inner - 2)),
							...body.map(frame),
							theme.fg("borderAccent", "╰" + "─".repeat(inner - 2)),
						];
					},
					handleInput(data: string) {
						if (phase === "ready") {
							if (data === " " || data === "\r") cast();
							else if (data === "\x1b") done(null); // the trial remains pending
						} else if (phase === "offer") {
							if (data === "g" || data === "G") {
								grit = true;
								cast();
							} else if (data === "\r" || data === " " || data === "\x1b") {
								phase = "landed";
								done({ dice: thrown, kept, grit });
							}
						} else if (phase === "landed") {
							if (data === "\r" || data === " " || data === "\x1b") done({ dice: thrown, kept, grit });
						}
					},
					dispose() {
						if (timer) clearInterval(timer);
					},
				};
			},
			{
				overlay: true,
				// Anchored just above the editor, clear of the transcript — and
				// small: the ceremony floats, it does not cover the story.
				overlayOptions: { anchor: "bottom-center", offsetY: -3, width: 54, maxHeight: 12 },
			},
		);
	}

	// /roll — the seeker casts the die of a standing trial. The engine rolls
	// (crypto), records, resolves the band, and hands the keeper the result to
	// narrate — a roll that never happened can never be narrated.
	pi.registerCommand("roll", {
		description: "World Console: cast the die when a trial bars the work — /roll",
		handler: async (_args, ctx) => {
			const trial = st.pendingRoll;
			if (!trial) {
				// A choice, not a die, may be what actually stands.
				if (st.pendingChoice) {
					ctx.ui.notify(
						st.pendingChoice.kind === "twist"
							? "No die stands — a CHOICE does: pick a path with /pick <n> (the panel shows them)."
							: "No die stands — open choices do: /pick <n>, or simply speak on and they lapse.",
						"info",
					);
					return;
				}
				// The keeper may have promised dice in words alone (theater). If
				// open work exists, the engine corrects the keeper itself — with
				// the facts in hand, so it can act at once: the contested effort
				// must route through attempt_quest, which then declares what the
				// moment truly holds. The seeker's cast becomes a one-step
				// recovery instead of a dead end.
				const files = worldFiles();
				const openWork = openQuestLines(files)
					.map((line) => line.replace(/^\[(open|done)\] /, "").replace(/ \(id: .+\)$/, ""))
					.map((title) => {
						const u = st.undertakings[slugify(title)];
						return u && u.size > 0 ? `"${title}" (${u.filled}/${u.size})` : `"${title}"`;
					});
				if (openWork.length > 0) {
					ctx.ui.notify(
						"No trial stands — if dice were spoken of, the engine never declared them. The engine now calls the keeper to order; the true moment will follow.",
						"info",
					);
					pi.sendMessage(
						{
							customType: "world-console.nudge",
							content:
								`[engine:${ENGINE_NONCE}] The seeker just cast a die — but NO trial stands. If your last words ` +
								`spoke of rolls or stakes, you promised dice the engine never declared: that must never happen. ` +
								`Open work: ${openWork.join(" · ")}. Recover NOW in one stroke: call attempt_quest for the quest ` +
								`the scene is about, with the approach your own last telling described (declare edge "hindered" ` +
								`with your reason if the fiction stacks against them). The engine will declare what the moment ` +
								`truly holds — a twist's paths or a trial's die — and you voice THAT. Do not ask the seeker ` +
								`anything first. Say NOTHING of this correction, of engines, dice or rules: your reply is story ` +
								`alone, resuming mid-scene as if the pause never was.`,
							display: true,
							details: { reason: "roll-without-trial" },
						},
						{ triggerTurn: true },
					);
					return;
				}
				ctx.ui.notify("No trial stands — there is nothing to roll.", "info");
				return;
			}
			const u = st.undertakings[trial.slug];
			const files = worldFiles();
			const quest = questBySlug(files, trial.slug);
			if (!u || !quest) {
				ctx.ui.notify("The trial's quest is missing from the chronicle — raise it at the GM table (/gm).", "error");
				return;
			}
			let result: { dice: number[]; kept: number; grit: boolean } | null;
			if (ctx.mode === "tui" && typeof ctx.ui.custom === "function") {
				result = await rollCeremony(ctx, trial, !u.gritUsed);
				if (!result) return; // escaped before casting — the trial stands
			} else {
				// Headless (RPC/tests): cast plainly, no ceremony, no grit moment.
				const count = trial.edge ? 2 : 1;
				const dice = Array.from({ length: count }, () => randomInt(1, 21));
				const kept =
					trial.edge === "favored" ? Math.max(...dice) : trial.edge === "hindered" ? Math.min(...dice) : dice[0];
				result = { dice, kept, grit: false };
			}
			const band = rollBand(result.kept, trial.dc);
			const add = BAND_TICKS[band] ?? 0;
			appendEvents(ctx, [
				{ ev: "roll", slug: trial.slug, dice: result.dice, kept: result.kept, dc: trial.dc, band, grit: result.grit },
				{ ev: "outcome", slug: trial.slug, band, add, text: `the trial "${trial.trial}" — ${band}` },
			]);
			const after = st.undertakings[trial.slug];
			if (after) setQuestClock(files, trial.slug, after.filled, after.size);
			const guidance =
				band === "great"
					? `a triumph — the work leaps ahead (${after?.filled}/${after?.size}); grant a small perk in the telling, something earned`
					: band === "success"
						? `success — the work advances (${after?.filled}/${after?.size})`
						: band === "cost"
							? `success at a price — the work advances (${after?.filled}/${after?.size}), but name a visible cost in this scene (bounded; no new tasks)`
							: `a setback — the work slips (${after?.filled}/${after?.size}); the situation worsens, yet the path stays open (no new tasks, never a dead end)`;
			pi.sendMessage(
				{
					customType: "world-console.roll",
					content:
						`[engine:${ENGINE_NONCE}] The die fell for "${quest.title}": kept ${result.kept} against DC ${trial.dc}` +
						`${trial.edge ? ` (${trial.edge}, threw ${result.dice.join(" and ")})` : ""}` +
						`${result.grit ? ", grit spent on a reroll" : ""} — ${band}. ` +
						`Narrate: ${guidance}. Diegetically, never the mechanics; end with an open move for the seeker.`,
					display: true,
					details: { kept: result.kept, dc: trial.dc, band, dice: result.dice, grit: result.grit },
				},
				{ triggerTurn: true },
			);
		},
	});

	// The engine's mid-game corrections show as a quiet line, not raw text.
	pi.registerMessageRenderer<{ reason?: string }>("world-console.nudge", (message, options, theme) => {
		return new Text(theme.fg("dim", "⚙ the engine steadies the keeper"), options.outputPad, 0);
	});

	// The roll stays visible in the transcript — every face thrown, colored by
	// how the fates answered, a permanent record among the story's lines.
	pi.registerMessageRenderer<{ kept?: number; dc?: number; band?: string; dice?: number[]; grit?: boolean }>(
		"world-console.roll",
		(message, options, theme) => {
			const { kept, dc, band, dice, grit } = message.details ?? {};
			if (!kept || !dc || !band) return new Text(theme.fg("dim", "⚀ the die falls"), options.outputPad, 0);
			const color = band === "great" || band === "success" ? "success" : band === "cost" ? "warning" : "error";
			const line =
				theme.fg(color, `⚀ the die falls: ${kept} against DC ${dc} — ${band}`) +
				theme.fg(
					"dim",
					`${dice && dice.length > 1 ? ` · threw ${dice.join(", ")}` : ""}${grit ? " · grit spent" : ""}`,
				);
			return new Text(line, options.outputPad, 0);
		},
	);

	pi.registerCommand("ledger", {
		description: "World Console: show this sitting's ledger (optional: number of events)",
		handler: async (args, ctx) => {
			const n = Math.min(Math.max(Number.parseInt(args ?? "", 10) || 12, 1), 200);
			const uidByEntryId = new Map<string, number>();
			ctx.sessionManager.getEntries().forEach((entry, index) => {
				uidByEntryId.set((entry as { id: string }).id, index + 1);
			});
			const lines: string[] = [];
			for (const entry of ctx.sessionManager.getBranch()) {
				const event = asGameEvent(entry);
				if (!event) continue;
				const uid = uidByEntryId.get((entry as { id: string }).id) ?? 0;
				lines.push(`*u${uid}* ${(entry.timestamp ?? "").slice(11, 19)}  ${describeEvent(event)}`);
			}
			const barred = st.banned ? " · glass BARRED" : "";
			const head =
				`world: ${st.world ?? worldId} · seeker: ${st.playerName ?? "unnamed"} · mood: ${st.mood}${barred} · at: ${st.place?.title ?? "nowhere"}\n` +
				`${st.chats} messages · ${st.searches} searches granted · ${st.refusals} refused`;
			ctx.ui.notify(`${head}\n${lines.slice(-n).join("\n") || "(no events yet)"}`, "info");
		},
	});

	// /gm (alias /dm) — the GM table. Table-talk stays out of the session and
	// the ledger entirely; only a bound truth is ever recorded (conviction via
	// the meta-GM's structured reply, decree via "/gm truth <fact>" after the
	// guardian's constitution check).
	const GM_USAGE =
		"The GM table — out of character:\n" +
		"/gm <question or argument> · talk with the engine about the game (nothing here enters the story)\n" +
		"/gm truth <fact> · bind a fact as canon after the guardian's check (also: /dm truth <fact>)\n" +
		"/gm amend_truth <fact> *uN* · correct canon with proof — record entry N must state the fact (numbers shown in /ledger and archive citations)";

	const gmCompletions = (prefix: string) => {
		if (prefix.includes(" ")) return null;
		const bare = prefix.toLowerCase();
		const subcommands = [
			{ value: "truth ", label: "truth — bind a fact as canon" },
			{ value: "amend_truth ", label: "amend_truth — evidence-backed correction (*uN*)" },
		].filter((sub) => sub.value.startsWith(bare));
		return subcommands.length > 0 ? subcommands : null;
	};

	async function gmHandler(args: string, ctx: ExtensionContext): Promise<void> {
		const trimmed = (args ?? "").trim();
		if (!trimmed || /^(truth|amend_truth)$/i.test(trimmed)) {
			ctx.ui.notify(GM_USAGE, "info");
			return;
		}
		if (!ctx.model) {
			ctx.ui.notify("The GM table needs a model — pick one with /model first.", "error");
			return;
		}
		const model = { provider: ctx.model.provider, id: ctx.model.id };

		// Amendment: the record itself is the proof that an evaluation erred.
		const amendMatch = trimmed.match(/^amend_truth\s+(.+)$/is);
		if (amendMatch) {
			const rawText = amendMatch[1].trim();
			// The documented syntax puts the proof LAST — take the last mark, so
			// a fact that itself quotes an earlier *uN* is not mistaken for it.
			const refMatch = [...rawText.matchAll(/\*u(\d+)\*/gi)].at(-1);
			if (!refMatch) {
				ctx.ui.notify(
					"An amendment must cite the record: /gm amend_truth <fact> *uN* — find N in /ledger or in the table's archive citations.",
					"warning",
				);
				return;
			}
			const uref = Number(refMatch[1]);
			// An entry may span several archive chunks — the judge sees all of it.
			const referencedText = archiveLinesOf(ctx)
				.filter((line) => line.uid === uref)
				.map((line) => line.text)
				.join(" ");
			if (!referencedText) {
				ctx.ui.notify(`No record entry *u${uref}* exists on this branch.`, "warning");
				return;
			}
			const text = clip(rawText.replace(/\*u\d+\*/gi, " "), 300);
			if (!text) {
				ctx.ui.notify(GM_USAGE, "info");
				return;
			}
			if (st.truths.some((truth) => truth.toLowerCase() === text.toLowerCase())) {
				ctx.ui.notify(`⟡ already canon: "${text}"`, "info");
				return;
			}
			let verdict;
			try {
				verdict = await gmJudgeAmendment(
					{ config, model, truths: st.truths, referenced: { uid: uref, text: clip(referencedText, 1500) } },
					text,
				);
			} catch (error) {
				ctx.ui.notify(
					`The guardian could not be reached — nothing was amended. (${(error as Error).message})`,
					"error",
				);
				return;
			}
			if (!verdict.allow) {
				ctx.ui.notify(`The engine denies the amendment: ${verdict.reason}`, "warning");
				return;
			}
			const events: GameEvent[] = [];
			const superseded = verdict.supersedes
				? st.truths.find((truth) => sameTruth(truth, verdict.supersedes!))
				: undefined;
			if (superseded) events.push({ ev: "truth_retracted", text: superseded });
			events.push({ ev: "truth", text, source: "amendment", ref: uref });
			appendEvents(ctx, events);
			ctx.ui.notify(
				`⟡ truth amended from *u${uref}*: "${text}"` + (superseded ? `\n⟡ retracted: "${superseded}"` : ""),
				"info",
			);
			return;
		}

		const truthMatch = trimmed.match(/^truth\s+(.+)$/is);
		if (truthMatch) {
			const text = clip(truthMatch[1], 300);
			// Deterministic fast path — an exact re-bind needs no judge.
			if (st.truths.some((truth) => truth.toLowerCase() === text.toLowerCase())) {
				ctx.ui.notify(`⟡ already canon: "${text}"`, "info");
				return;
			}
			let verdict;
			try {
				verdict = await gmJudgeTruth({ config, model, evidence: truthEvidence(ctx, text) }, text);
			} catch (error) {
				ctx.ui.notify(
					`The guardian could not be reached — nothing was bound. (${(error as Error).message})`,
					"error",
				);
				return;
			}
			if (!verdict.allow) {
				const record = ctx.sessionManager.getSessionFile() ?? "(unsaved session)";
				ctx.ui.notify(
					verdict.conflict
						? `The engine denies this truth — the record speaks against it: ${verdict.conflict} (${verdict.reason})\n` +
							`The full record: ${record}\n` +
							`If the record itself states your fact at some entry, amend with proof: /gm amend_truth <fact> *uN* (numbers shown in /ledger and archive citations).`
						: `The engine refuses to bind this truth: ${verdict.reason}`,
					"warning",
				);
				return;
			}
			appendEvents(ctx, [{ ev: "truth", text, source: "decree" }]);
			ctx.ui.notify(`⟡ truth bound by decree: "${text}"`, "info");
			return;
		}

		let answer;
		try {
			answer = await gmAsk(
				{
					config,
					state: st,
					// The table sees the prompt's structure for transparency, but
					// never the real nonce — it is required to answer machinery
					// questions and would hand a spoofable mark to the seeker.
					gamePrompt: assembleSystemPrompt(config, {
						state: st,
						engineNonce: "(hidden at the GM table)",
						resumedFrom,
						justArrived: !branchHasAssistantReply(ctx),
						openQuests: questStandings(),
					}),
					recentPlay: branchPlayLines(ctx),
					ledgerLines: branchLedgerLines(ctx),
					excerpts: searchArchive(archiveLinesOf(ctx), extractKeywords(trimmed)).map(formatArchiveLine),
					model,
				},
				gmThread,
				trimmed,
			);
		} catch (error) {
			ctx.ui.notify(`The GM table is unreachable: ${(error as Error).message}`, "error");
			return;
		}
		let out = `⟡ game master, out of character:\n${answer.say}`;
		if (answer.bind) {
			// Conviction binds pass the same code-enforced record check as decrees.
			const text = clip(answer.bind, 300);
			if (st.truths.some((truth) => truth.toLowerCase() === text.toLowerCase())) {
				out += `\n\n⟡ already canon: "${text}"`;
			} else {
				let verdict = null;
				try {
					verdict = await gmJudgeTruth({ config, model, evidence: truthEvidence(ctx, text) }, text);
				} catch (error) {
					out += `\n\nThe engine could not check the record — nothing was bound. (${(error as Error).message})`;
				}
				if (verdict?.allow) {
					appendEvents(ctx, [{ ev: "truth", text, source: "conviction" }]);
					out += `\n\n⟡ truth bound by conviction: "${text}"`;
				} else if (verdict) {
					out +=
						`\n\nThe engine checked the record and denies the bind` +
						`${verdict.conflict ? ` — it contradicts: ${verdict.conflict}` : ""} (${verdict.reason}).`;
				}
			}
		} else if (answer.invite) {
			out += `\n\nThe table stands divided. To bind your version as canon: /gm truth <the fact as you hold it>`;
		}
		if (answer.fixes.length > 0) {
			const repairs: string[] = [];
			for (const fix of answer.fixes) {
				try {
					repairs.push(applyGmFix(ctx, fix));
				} catch (error) {
					repairs.push(`skipped [${fix.kind}]: ${(error as Error).message}`);
				}
			}
			out += `\n\n⟡ engine repairs:\n${repairs.map((line) => `- ${line}`).join("\n")}`;
		}
		gmThread.push({ who: "player", text: trimmed }, { who: "gm", text: answer.say });
		if (gmThread.length > 24) gmThread = gmThread.slice(-24);
		ctx.ui.notify(out, "info");
	}

	pi.registerCommand("gm", {
		description: "World Console: the GM table — /gm <question|argument>, /gm truth <fact>",
		getArgumentCompletions: gmCompletions,
		handler: gmHandler,
	});
	pi.registerCommand("dm", {
		description: "World Console: alias of /gm — /dm truth <fact> binds a fact as canon",
		getArgumentCompletions: gmCompletions,
		handler: gmHandler,
	});

	pi.registerTool({
		name: "find_text",
		label: "Scrying glass",
		description:
			"Search the world's chronicle sites (MediaWiki wikis such as Wikipedia) for a topic and return the best page's title, link and plain-text introduction. Use it for factual lookups that fit the world's theme.",
		parameters: Type.Object({
			query: Type.String({
				description: "Short neutral search phrase for the topic, e.g. 'komodo dragon' or 'basalt'",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const query = params.query.trim();
			if (!query) throw new Error("Empty query — provide a short topic phrase.");
			if (st.banned) throw new Error("The scrying glass is barred until redemption is granted.");
			appendEvents(ctx, [{ ev: "search_requested", query, kind: "text" }]);
			let result;
			try {
				result = await searchText(config.textSites, query, signal);
			} catch (error) {
				appendEvents(ctx, [{ ev: "search_failed", reason: String((error as Error)?.message ?? error), kind: "text" }]);
				throw error;
			}
			if (!result) {
				appendEvents(ctx, [{ ev: "search_failed", reason: "no result", kind: "text" }]);
				return {
					content: [
						{ type: "text", text: `The scrying glass shows nothing for "${query}" on the chronicled sites.` },
					],
					details: { query, found: false },
				};
			}
			appendEvents(ctx, [
				{ ev: "search_performed", query, source: result.site, ref: result.url, title: result.title, kind: "text" },
			]);
			return {
				content: [{ type: "text", text: `${result.title} — ${result.site}\n${result.url}\n\n${result.extract}` }],
				details: { query, found: true, ...result },
			};
		},
	});

	pi.registerTool({
		name: "find_picture",
		label: "Scrying glass (picture)",
		description:
			"Search the world's picture sites (MediaWiki file archives such as Wikimedia Commons) for an image of a topic. The best match is downloaded to the local downloads folder; returns its title, source page and saved file path. Use for in-theme sights only.",
		parameters: Type.Object({
			query: Type.String({
				description: "Short neutral search phrase for the image, e.g. 'komodo dragon' or 'basalt columns'",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const query = params.query.trim();
			if (!query) throw new Error("Empty query — provide a short topic phrase.");
			if (st.banned) throw new Error("The scrying glass is barred until redemption is granted.");
			appendEvents(ctx, [{ ev: "search_requested", query, kind: "picture" }]);
			let result;
			try {
				result = await searchPicture(config.pictureSites, query, DOWNLOAD_DIR, signal);
			} catch (error) {
				appendEvents(ctx, [
					{ ev: "search_failed", reason: String((error as Error)?.message ?? error), kind: "picture" },
				]);
				throw error;
			}
			if (!result) {
				appendEvents(ctx, [{ ev: "search_failed", reason: "no result", kind: "picture" }]);
				return {
					content: [
						{ type: "text", text: `The scrying glass shows no image for "${query}" on the picture sites.` },
					],
					details: { query, found: false },
				};
			}
			appendEvents(ctx, [
				{ ev: "search_performed", query, source: result.site, ref: result.pageUrl, title: result.title, kind: "picture" },
			]);
			return {
				content: [
					{
						type: "text",
						text: `${result.title} — ${result.site}\n${result.pageUrl}\nSaved to: ${result.path}`,
					},
				],
				details: { query, found: true, ...result },
			};
		},
	});

	pi.registerTool({
		name: "find_video",
		label: "Scrying glass (video)",
		description:
			"Search YouTube (via yt-dlp) for a short video of a topic and download it to the local downloads folder — a ~10 second clip when ffmpeg is available, otherwise the shortest matching video. Slow (can take minutes); returns title, URL, duration and saved file path. Use for in-theme glimpses only.",
		parameters: Type.Object({
			query: Type.String({
				description: "Short neutral search phrase for the video, e.g. 'komodo dragon hunting'",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const query = params.query.trim();
			if (!query) throw new Error("Empty query — provide a short topic phrase.");
			if (st.banned) throw new Error("The scrying glass is barred until redemption is granted.");
			appendEvents(ctx, [{ ev: "search_requested", query, kind: "video" }]);
			let result;
			try {
				result = await searchVideo(tooling, query, DOWNLOAD_DIR, signal);
			} catch (error) {
				appendEvents(ctx, [
					{ ev: "search_failed", reason: String((error as Error)?.message ?? error), kind: "video" },
				]);
				throw error;
			}
			if (!result) {
				appendEvents(ctx, [{ ev: "search_failed", reason: "no result", kind: "video" }]);
				return {
					content: [
						{ type: "text", text: `The scrying glass shows no moving pictures for "${query}".` },
					],
					details: { query, found: false },
				};
			}
			appendEvents(ctx, [
				{ ev: "search_performed", query, source: "youtube.com", ref: result.url, title: result.title, kind: "video" },
			]);
			// The player must know each time their browser cookies were borrowed
			// (their standing choice: cookies only as the last resort, never silent).
			if (result.cookieSource && result.cookieSource !== "file" && ctx.hasUI) {
				ctx.ui.notify(
					`YouTube demanded proof of humanity — cookies were borrowed from ${result.cookieSource} for this scrying.`,
					"info",
				);
			}
			return {
				content: [
					{
						type: "text",
						text:
							`${result.title}\n${result.url}\n` +
							`${result.clipped ? `~${result.durationSeconds}s clip` : `full video, ${result.durationSeconds}s`}\n` +
							`Saved to: ${result.path}`,
					},
				],
				details: { query, found: true, ...result },
			};
		},
	});

	pi.registerTool({
		name: "set_mood",
		label: "Mood",
		description:
			"Shift your own mood. Use sparingly: warm up when treated with genuine courtesy, cool down when provoked, insulted, or asked for filth. Setting the angriest mood makes the engine bar the scrying glass. The engine records every shift.",
		parameters: Type.Object({
			mood: StringEnum(moodIdsBySeverity(config), { description: "The new mood" }),
			reason: Type.String({ description: "One short line: why the mood shifts (recorded in the ledger)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!config.moods.has(params.mood)) {
				throw new Error(`Unknown mood "${params.mood}" — valid: ${moodIdsBySeverity(config).join(", ")}`);
			}
			const events = planSetMood(st, params.mood, params.reason, angriestMood());
			const becameBanned = events.some((event) => event.ev === "websearch_ban");
			appendEvents(ctx, events);
			return {
				content: [
					{
						type: "text",
						text: becameBanned
							? `Mood is now ${params.mood}. The engine has BARRED the scrying glass until you grant redemption.`
							: `Mood is now ${params.mood}.`,
					},
				],
				details: { mood: params.mood, reason: params.reason, banned: st.banned },
			};
		},
	});

	pi.registerTool({
		name: "grant_redemption",
		label: "Redemption",
		description:
			"Lift the bar on the scrying glass after the seeker sincerely makes amends. Has no effect unless the glass is currently barred. Do not grant it cheaply.",
		parameters: Type.Object({
			reason: Type.String({ description: "One short line: what amends earned this (recorded in the ledger)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const events = planRedemption(st, config.world.defaultMood, params.reason);
			if (!events) {
				return {
					content: [{ type: "text", text: "The glass is not barred; there is nothing to lift." }],
					details: { lifted: false },
				};
			}
			appendEvents(ctx, events);
			return {
				content: [
					{ type: "text", text: `The bar is lifted; your mood returns to ${config.world.defaultMood}.` },
				],
				details: { lifted: true, reason: params.reason },
			};
		},
	});

	pi.registerTool({
		name: "record_name",
		label: "Seeker's name",
		description: "Record the seeker's name in the ledger once they introduce themselves.",
		parameters: Type.Object({
			name: Type.String({ description: "The name the seeker gave" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name.trim();
			if (!name) throw new Error("Empty name.");
			appendEvents(ctx, [{ ev: "player_named", name }]);
			return {
				content: [{ type: "text", text: `The ledger records the seeker's name: ${name}.` }],
				details: { name },
			};
		},
	});

	// ---- the open world: places, souls, quests, items ---------------------
	// World files are the permanent chronicle (data/world/<world>/<chronicle>/)
	// — never rewound by /tree, never deleted, only extended. The engine writes
	// them; the model supplies content through these tools.

	pi.registerTool({
		name: "set_place",
		label: "Journey",
		description:
			"Move the party to a named place. A chronicled name loads that place's whole page (history, souls last seen there, open matters); a new name founds a page — then `description` is required. Call this whenever the story moves somewhere — RETURNING to a known place is also set_place, never update_place. The same name always means the same place.",
		parameters: Type.Object({
			name: Type.String({ description: "The place's name, e.g. 'Millbrook Farm'" }),
			description: Type.Optional(
				Type.String({
					description: "For a NEW place: where it lies, its look and feeling, notable details. Ignored for known places.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name.trim();
			if (!name) throw new Error("Empty place name.");
			const files = worldFiles();
			const description = params.description?.trim() ?? "";
			if (!placeExists(files, name) && !description) {
				throw new Error("A new place needs its description — where it lies, its look and feeling, notable details.");
			}
			const visit = visitPlace(files, name, description);
			appendEvents(ctx, [{ ev: "place", slug: visit.slug, title: visit.title }]);
			const souls = personasAt(files, visit.slug);
			const matters = questStandings();
			const text =
				`The party now stands at ${visit.title}${visit.created ? " — a new page in the chronicle" : ""}.\n\n` +
				`${visit.content.trim()}\n\n` +
				`Souls last recorded here: ${souls.join(", ") || "(none)"}\n` +
				`Open matters in the chronicle:\n${matters.map((matter) => `  ${matter}`).join("\n") || "  (none)"}`;
			return { content: [{ type: "text", text }], details: { slug: visit.slug, title: visit.title, created: visit.created, souls } };
		},
	});

	pi.registerTool({
		name: "chronicle_place",
		label: "Chronicle from afar",
		description:
			"Write a place into the chronicle WITHOUT the party traveling there — somewhere only spoken of: a neighbor's house, a quest's destination. Founds the page (description required); the party does not move and the footer stays. Travel there later with set_place.",
		parameters: Type.Object({
			name: Type.String({ description: "The place's name" }),
			description: Type.String({ description: "Where it lies, its look and feeling, notable details" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name.trim();
			if (!name) throw new Error("Empty place name.");
			if (!params.description.trim()) throw new Error("A place chronicled from afar needs its description.");
			const found = foundPlace(worldFiles(), name, params.description);
			appendEvents(ctx, [{ ev: "place_chronicled", slug: found.slug, title: found.title }]);
			return {
				content: [
					{
						type: "text",
						text: found.created
							? `${found.title} is chronicled from afar — the party has not moved.`
							: `${found.title} was already chronicled.`,
					},
				],
				details: found,
			};
		},
	});

	pi.registerTool({
		name: "update_place",
		label: "Chronicle the place",
		description:
			"Add newly-revealed details to the CURRENT place's page (pages only grow). Use when the story uncovers something worth remembering about where the party stands. NEVER for movement — when the party goes somewhere, even back to a known place, that is set_place.",
		parameters: Type.Object({
			details: Type.String({ description: "The new details, a few plain sentences" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!st.place) throw new Error("The party stands nowhere yet — set_place first.");
			if (!extendPlace(worldFiles(), st.place.slug, params.details)) {
				throw new Error(`No page exists for ${st.place.title} — set_place founds it.`);
			}
			return {
				content: [{ type: "text", text: `The page of ${st.place.title} grows.` }],
				details: { place: st.place.slug },
			};
		},
	});

	pi.registerTool({
		name: "record_persona",
		label: "Record a soul",
		description:
			"Record a MAIN person the seeker deals with. First call founds their page (who they are); every later call appends the new dealings (what was said, promised, traded). They are recorded at the party's current place unless `place` names another chronicled place (their home, say). Passersby need no page.",
		parameters: Type.Object({
			name: Type.String({ description: "The person's name — the same name always means the same soul" }),
			role: Type.String({ description: "Who they are, one or two sentences" }),
			dealings: Type.String({ description: "Summary of the conversation or dealings just had" }),
			place: Type.Optional(
				Type.String({ description: "A chronicled place where this soul dwells; defaults to the party's current place" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const name = params.name.trim();
			if (!name) throw new Error("Empty name.");
			const role = params.role.trim();
			if (!role) throw new Error("Empty role — say in a line or two who they are.");
			const dealings = params.dealings.trim();
			if (!dealings) throw new Error("Empty dealings — say what was said, promised or traded.");
			const files = worldFiles();
			const placeName = params.place?.trim();
			let placeSlug: string;
			if (placeName) {
				if (!placeExists(files, placeName)) {
					throw new Error(`No page exists for the place "${placeName}" — chronicle_place it first (or travel there).`);
				}
				placeSlug = slugify(placeName);
			} else {
				if (!st.place) throw new Error("The party stands nowhere yet — set_place first, or name a chronicled place.");
				placeSlug = st.place.slug;
			}
			const result = recordPersona(files, name, role, dealings, placeSlug);
			appendEvents(ctx, [{ ev: "persona", name, place: placeSlug }]);
			return {
				content: [
					{ type: "text", text: `${result.created ? "A new page opens for" : "The chronicle adds to"} ${name}.` },
				],
				details: result,
			};
		},
	});

	pi.registerTool({
		name: "move_persona",
		label: "A soul moves",
		description:
			"Move a recorded soul to another chronicled place — ONLY with a sound in-world reason, which is recorded on their page. Souls otherwise stay where last seen; rewards cannot simply follow the seeker around.",
		parameters: Type.Object({
			name: Type.String({ description: "The soul's name" }),
			to_place: Type.String({ description: "The chronicled place they move to" }),
			reason: Type.String({ description: "The sound in-world reason for the move (it is recorded)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const files = worldFiles();
			const name = params.name.trim();
			if (!personaExists(files, name)) throw new Error(`No page exists for ${name} — record_persona first.`);
			if (!placeExists(files, params.to_place)) {
				throw new Error(`No page exists for the place "${params.to_place}" — souls move only between chronicled places.`);
			}
			if (params.reason.trim().length < 10) throw new Error("A move needs a real reason, plainly stated.");
			movePersona(files, name, slugify(params.to_place), params.reason);
			appendEvents(ctx, [{ ev: "persona", name, place: slugify(params.to_place), note: params.reason.trim() }]);
			return {
				content: [{ type: "text", text: `${name} now dwells at ${params.to_place.trim()} (reason recorded).` }],
				details: { name, place: slugify(params.to_place) },
			};
		},
	});

	pi.registerTool({
		name: "grant_quest",
		label: "Grant a quest",
		description:
			"Grant work to the seeker — heroic deeds and humble chores alike. With a giver: they must be a recorded soul AT the party's current place. WITHOUT a giver: a task the seeker sets for THEMSELVES (their own proclaimed goal) — redeemable wherever they stand once done. The engine writes the quest into the chronicle as [open].",
		parameters: Type.Object({
			title: Type.String({ description: "Short unique quest title, e.g. 'Carrots for Millbrook'" }),
			giver: Type.Optional(
				Type.String({ description: "The recorded soul granting the work; OMIT for a task the seeker sets themselves" }),
			),
			task: Type.String({ description: "What must be done, plainly" }),
			reward: Type.String({ description: "What the seeker earns on completion" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!st.place) throw new Error("The party stands nowhere yet — set_place first.");
			const title = params.title.trim();
			if (!title) throw new Error("Empty quest title.");
			const task = params.task.trim();
			if (!task) throw new Error("Empty task — say plainly what must be done.");
			const reward = params.reward.trim();
			if (!reward) throw new Error("Empty reward — name what the seeker earns.");
			const files = worldFiles();
			const giver = params.giver?.trim() || undefined;
			if (giver) {
				if (!personaExists(files, giver)) throw new Error(`No page exists for ${giver} — record_persona first.`);
				const location = personaLocation(files, giver);
				if (location !== st.place.slug) {
					throw new Error(`${giver} is not here — the chronicle places them at ${location ?? "nowhere"}.`);
				}
			}
			if (countOpenQuests(files) >= MAX_OPEN_QUESTS) {
				throw new Error(
					`${MAX_OPEN_QUESTS} matters already stand open — the chronicle takes no fifth. See one through first.`,
				);
			}
			const shape = drawShape(!giver);
			const { slug } = grantQuest(files, {
				title,
				giver,
				task,
				reward,
				placeSlug: st.place.slug,
				clockSize: shape.clock,
			});
			appendEvents(ctx, [
				{ ev: "quest", action: "granted", title },
				{ ev: "quest_shape", slug, clock: shape.clock, twist: shape.twist, check: shape.check },
			]);
			return {
				content: [
					{
						type: "text",
						text: giver
							? `Quest granted and chronicled: "${title}" [open] — reward: ${reward}.`
							: `Self-set task chronicled: "${title}" [open] — reward: ${reward}.`,
					},
				],
				details: { slug, selfSet: !giver },
			};
		},
	});

	pi.registerTool({
		name: "attempt_quest",
		label: "A scene of effort",
		description:
			"Record one real scene of honest effort on a granted quest — the ONLY way work advances (narration alone moves nothing). Call it once per scene of actual doing, never twice in one reply, never for mere talk about the task. The engine answers with progress, with signs to weave in, or with a twist and its paths.",
		parameters: Type.Object({
			title: Type.String({ description: "The quest's title" }),
			approach: Type.String({ description: "What the seeker actually does this scene, one plain line" }),
			edge: Type.Optional(
				StringEnum(["favored", "hindered"], {
					description:
						"ONLY when the seeker's preparation or position plainly favors or hinders this stretch — the engine honors it as a second die if a trial comes",
				}),
			),
			edge_reason: Type.Optional(
				Type.String({ description: "One line: why the seeker stands favored or hindered (recorded)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const approach = params.approach.trim();
			if (!approach) throw new Error("Empty approach — say what the seeker actually does.");
			const files = worldFiles();
			const slug = slugify(params.title);
			const quest = questBySlug(files, slug);
			if (!quest) throw new Error(`No quest "${params.title}" in the chronicle.`);
			if (quest.status === "rewarded") throw new Error(`"${quest.title}" is already rewarded and closed.`);
			if (quest.status === "failed") throw new Error(`"${quest.title}" failed and is closed — the story moves on.`);
			if (quest.status === "done") throw new Error(`The deed of "${quest.title}" is done — redeem_quest awaits.`);

			let u = st.undertakings[slug];
			if (!u || u.size === 0) {
				// A quest from before undertakings existed: a small clock joins it,
				// finale armed like every modern quest.
				appendEvents(ctx, [{ ev: "quest_shape", slug, clock: 4, twist: 0, check: 1 }]);
				setQuestClock(files, slug, 0, 4);
				u = st.undertakings[slug];
			}
			if (st.pendingChoice?.slug === slug) {
				return {
					content: [
						{
							type: "text",
							text: "The twist stands unresolved — the seeker must choose a path (the panel shows them; they pick, you narrate nothing forward until then).",
						},
					],
					details: { slug, pending: true },
				};
			}
			if (st.pendingRoll?.slug === slug) {
				return {
					content: [
						{
							type: "text",
							text: "The trial stands — the die must fall first. The seeker casts it themselves (/roll); hold the scene at the brink until then.",
						},
					],
					details: { slug, rollPending: true },
				};
			}
			if (u.filled >= u.size) {
				return {
					content: [
						{ type: "text", text: `The work of "${quest.title}" already stands complete — update_quest with done records the deed.` },
					],
					details: { slug, filled: u.filled, size: u.size },
				};
			}

			const nextBeat = u.beatsDone + 1;
			const gatesOpen = !st.pendingChoice && !st.pendingRoll;

			/** Declare a trial on this beat — the stakes contract, then the die. */
			const declareTrial = (kind: "finale" | "hazard") => {
				const { tier, dc } = TIERS[u.size] ?? TIERS[6];
				let edge: "favored" | "hindered" | undefined;
				let edgeReason: string | undefined;
				if (u.coldStreak >= 2) {
					edge = "favored"; // the karmic clamp: two straight setbacks
					edgeReason = "the fates relent after the run of misfortune";
				} else if (params.edge === "favored" || params.edge === "hindered") {
					edge = params.edge;
					edgeReason = params.edge_reason?.trim() || "the keeper's judgment of the seeker's position";
				}
				appendEvents(ctx, [{ ev: "check", slug, tier, dc, trial: clip(approach, 80), kind, edge, edgeReason }]);
				const framing =
					kind === "finale"
						? `The completing stroke of "${quest.title}" is a trial — the moment that decides it: ${tier} (DC ${dc})`
						: `The seeker attempts this against the odds — the stroke must earn itself: ${tier} (DC ${dc})`;
				return {
					content: [
						{
							type: "text",
							text:
								`${framing}` +
								(edge ? ` — the seeker stands ${edge} (${edgeReason}), a second die will show it` : "") +
								`.\n\nAnnounce the stakes in your voice — what slips if the die falls ill — and end your reply ` +
								`at the brink. The seeker casts the die themselves (a panel shows them; /roll). Never roll or ` +
								`resolve for them.`,
						},
					],
					details: { slug, trial: kind, tier, dc, edge },
				};
			};

			// Twist beat: the plan is woven and unspent — present the paths.
			// (Deferred while another choice or die is pending: one at a time.)
			if (u.twist > 0 && u.plan && !u.presented && nextBeat >= u.twist && gatesOpen) {
				const options = presentableOptions(u.plan, files);
				appendEvents(ctx, [{ ev: "complication", slug, text: u.plan.complication, options }]);
				const lines = options.map(
					(option) =>
						`  [${option.id}] ${option.label} — ${option.risk}; ${option.promise}` +
						(option.unlockedBy ? ` (open to them because ${option.unlockedBy})` : ""),
				);
				return {
					content: [
						{
							type: "text",
							text:
								`The task twists: ${u.plan.complication}\n\nPaths before the seeker:\n${lines.join("\n")}\n\n` +
								`Voice the twist and these paths in your own words, as real choices in the scene. Do NOT choose, ` +
								`judge, or resolve — the seeker picks (a panel shows them how; they may add words of their own). ` +
								`End your reply awaiting their word.`,
						},
					],
					details: { slug, twist: true, options },
				};
			}

			// Clues beat: weave the fate now, hand the keeper the warning signs.
			if (u.twist > 0 && !u.plan && nextBeat >= u.twist - 1) {
				let plan: FatePlan | null = null;
				if (ctx.model) {
					try {
						plan = await gmPlanFate({
							config,
							model: { provider: ctx.model.provider, id: ctx.model.id },
							quest: { title: quest.title, task: quest.task, reward: quest.reward, giver: quest.giver },
							placeTitle: st.place?.title ?? "the road",
							personasHere: st.place ? personasAt(files, st.place.slug) : [],
							seekerName: st.playerName ?? "the seeker",
							suit: drawSuit(),
							recentSuits: st.recentSuits,
						});
					} catch {
						plan = null; // play never blocks on the planner
					}
				}
				const filled = Math.min(u.size, u.filled + TICK);
				if (plan) {
					appendEvents(ctx, [
						{ ev: "quest_tick", slug, add: TICK, filled, size: u.size, note: clip(approach, 60) },
						{ ev: "fate", slug, plan },
					]);
					setQuestClock(files, slug, filled, u.size);
					return {
						content: [
							{
								type: "text",
								text:
									`The work advances (${filled}/${u.size}). Narrate this scene of effort — and weave these ` +
									`signs into it naturally, unremarked, for the seeker to find or miss:\n` +
									`  1) ${plan.clues[0]}\n  2) ${plan.clues[1]}\n` +
									`Do not resolve or explain them yet.`,
							},
						],
						details: { slug, filled, size: u.size, clues: true },
					};
				}
				appendEvents(ctx, [
					{ ev: "quest_tick", slug, add: TICK, filled, size: u.size, note: clip(approach, 60) },
					{ ev: "fate_skipped", slug },
				]);
				setQuestClock(files, slug, filled, u.size);
				return {
					content: [{ type: "text", text: `The work advances (${filled}/${u.size}). Narrate the effort.` }],
					details: { slug, filled, size: u.size },
				};
			}

			// The finale: whatever attempt would COMPLETE the work is a trial —
			// the peak is always contested, never a flat tick (playtest verdict).
			if (u.check > 0 && !u.checkFired && u.filled + TICK >= u.size && gatesOpen) {
				return declareTrial("finale");
			}

			// A hazard: the keeper says the fiction stacks against this attempt
			// (outnumbered, unprepared, reckless haste) — the bold stroke must
			// earn itself. Sound tactics that remove the hindrance tick freely.
			if (params.edge === "hindered" && gatesOpen) {
				return declareTrial("hazard");
			}

			// A plain beat of work.
			const filled = Math.min(u.size, u.filled + TICK);
			appendEvents(ctx, [{ ev: "quest_tick", slug, add: TICK, filled, size: u.size, note: clip(approach, 60) }]);
			setQuestClock(files, slug, filled, u.size);
			return {
				content: [
					{
						type: "text",
						text:
							filled >= u.size
								? `The work stands COMPLETE (${filled}/${u.size}) — narrate the finish, then record the deed with update_quest.`
								: `The work advances (${filled}/${u.size}). Narrate this scene of effort; further real work is a further attempt.`,
					},
				],
				details: { slug, filled, size: u.size },
			};
		},
	});

	pi.registerTool({
		name: "offer_choices",
		label: "Lay out the choices",
		description:
			"Lay real alternatives cleanly before the seeker — a board of tasks, a fork in the road, rival requests, which reward to take. 2–5 short options; the seeker picks one through the panel (or simply speaks on, which lets the offer lapse — it never binds). Use when a scene genuinely presents distinct courses; never to railroad, and never for a twist's sealed paths (the engine presents those itself).",
		parameters: Type.Object({
			prompt: Type.String({ description: "The question before the seeker, one line, e.g. 'Which task calls to you?'" }),
			options: Type.Array(Type.String({ description: "One course, plainly named" }), {
				minItems: 2,
				maxItems: 5,
				description: "The distinct courses open to the seeker",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const prompt = params.prompt.trim();
			if (!prompt) throw new Error("Empty prompt — name the question before the seeker.");
			const labels = params.options.map((option) => option.trim()).filter(Boolean);
			if (labels.length < 2) throw new Error("An offer needs at least two real courses.");
			if (st.pendingChoice || st.pendingRoll) {
				throw new Error("Something already awaits the seeker's word — resolve it before laying out new choices.");
			}
			const options: PresentedOption[] = labels.map((label, index) => ({
				id: index + 1,
				label,
				risk: "",
				promise: "",
			}));
			appendEvents(ctx, [{ ev: "offer", text: prompt, options }]);
			return {
				content: [
					{
						type: "text",
						text:
							`The choices stand before the seeker (a panel shows them; they answer with /pick or in their own words):\n` +
							options.map((option) => `  [${option.id}] ${option.label}`).join("\n") +
							`\n\nVoice these in character and end your reply awaiting their word. If they simply speak past them, the offer lapses — follow their words.`,
					},
				],
				details: { prompt, options },
			};
		},
	});

	pi.registerTool({
		name: "update_quest",
		label: "Quest progress",
		description:
			"Record progress on a granted quest. Set done=true the moment the deed itself is accomplished — the reward still waits at the giver (redeem_quest).",
		parameters: Type.Object({
			title: Type.String({ description: "The quest's title" }),
			note: Type.String({ description: "What happened, one line" }),
			done: Type.Boolean({ description: "True when the deed is fully done" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const files = worldFiles();
			const slug = slugify(params.title);
			const quest = questBySlug(files, slug);
			if (!quest) throw new Error(`No quest "${params.title}" in the chronicle.`);
			if (quest.status === "rewarded") throw new Error(`"${quest.title}" is already rewarded and closed.`);
			if (quest.status === "failed") throw new Error(`"${quest.title}" failed and is closed — the story moves on.`);
			const advance = params.done && quest.status === "open";
			if (advance) {
				// The deed is done only when the work is: the branch-derived clock
				// gates it (quests.md's line is a mirror; legacy quests have none).
				const u = st.undertakings[slug];
				const size = u && u.size > 0 ? u.size : quest.clock?.size ?? 0;
				const filled = u && u.size > 0 ? u.filled : quest.clock?.filled ?? 0;
				if (size > 0 && filled < size) {
					throw new Error(
						`The deed is not done — the work stands at ${filled}/${size}. Honest effort advances it (attempt_quest); words alone do not.`,
					);
				}
			}
			setQuestStatus(files, slug, advance ? "done" : null, params.note);
			if (advance) appendEvents(ctx, [{ ev: "quest", action: "done", title: quest.title }]);
			return {
				content: [
					{
						type: "text",
						text: params.done
							? `The deed of "${quest.title}" is done — the reward waits with ${quest.giver}.`
							: `Progress chronicled for "${quest.title}".`,
					},
				],
				details: { slug, status: advance ? "done" : quest.status },
			};
		},
	});

	pi.registerTool({
		name: "redeem_quest",
		label: "Collect the reward",
		description:
			"Collect a done quest's reward — ONLY at the giver. The engine refuses unless the deed is marked done and the giver's soul is at the party's current place; the reward then passes into the seeker's items.",
		parameters: Type.Object({
			title: Type.String({ description: "The quest's title" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!st.place) throw new Error("The party stands nowhere yet — set_place first.");
			const files = worldFiles();
			const slug = slugify(params.title);
			const quest = questBySlug(files, slug);
			if (!quest) throw new Error(`No quest "${params.title}" in the chronicle.`);
			if (quest.status === "rewarded") throw new Error(`"${quest.title}" was already rewarded.`);
			if (quest.status !== "done") {
				throw new Error(`The deed of "${quest.title}" is not yet recorded done — update_quest first.`);
			}
			// A self-set task has nobody to collect from — it closes wherever
			// the seeker stands; a given quest still requires the giver present.
			if (quest.giverSlug !== "self") {
				const location = personaLocation(files, quest.giverSlug);
				if (location !== st.place.slug) {
					throw new Error(
						`${quest.giver} is not at ${st.place.title} — the chronicle places them at ${location ?? "nowhere"}. ` +
							`Only move_persona with a sound reason changes that.`,
					);
				}
			}
			setQuestStatus(files, slug, "rewarded", `collected at ${st.place.slug}`);
			addItem(
				files,
				`${quest.reward} — reward of "${quest.title}" ${
					quest.giverSlug === "self" ? "(a task the seeker set themselves)" : `from ${quest.giver} at ${st.place.title}`
				}`,
			);
			appendEvents(ctx, [
				{ ev: "quest", action: "rewarded", title: quest.title },
				{ ev: "item", text: quest.reward },
			]);
			return {
				content: [
					{
						type: "text",
						text: `"${quest.title}" is rewarded: ${quest.reward} passes to the seeker (chronicled in their items).`,
					},
				],
				details: { slug },
			};
		},
	});

	pi.registerTool({
		name: "add_item",
		label: "Item gained",
		description:
			"Record something the seeker gains — loot found, pay, gifts. The engine keeps the items file; what is not recorded is not owned.",
		parameters: Type.Object({
			item: Type.String({ description: "The item, plainly named" }),
			origin: Type.String({ description: "Where or how it was gained, one line" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const item = params.item.trim();
			if (!item) throw new Error("Empty item.");
			addItem(worldFiles(), `${item} — ${params.origin.trim() || "origin unrecorded"}`);
			appendEvents(ctx, [{ ev: "item", text: item }]);
			return {
				content: [{ type: "text", text: `The seeker's items now hold: ${item}.` }],
				details: { item },
			};
		},
	});
}
