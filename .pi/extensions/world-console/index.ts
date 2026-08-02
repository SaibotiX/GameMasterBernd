/**
 * World Console as a pi extension — full game port.
 *
 *  - pi's coding system prompt is replaced every turn with the layered
 *    game-master prompt (constitution → world → mood → standing → protocol)
 *  - the built-in coding tools are stripped; the model gets six game tools:
 *      find_text         — the "scrying glass": MediaWiki text search
 *      find_picture      — MediaWiki file search; best match downloaded locally
 *      find_video        — yt-dlp YouTube search; ~10 s clip downloaded locally
 *      set_mood          — mood shifts; the angriest mood bars the glass (code-owned)
 *      grant_redemption  — lifts the bar after sincere amends (no-op unless barred)
 *      record_name       — stores the seeker's name for the standing layer
 *  - the game ledger lives INSIDE the pi session as custom entries and all
 *    state is derived from the current branch, so /new = fresh ledger,
 *    /fork copies it, /tree rewinds it, and branches never interfere
 *  - one world per session: the first ledger event stamps the world, and a
 *    resumed session keeps its stamped world even if --world says otherwise
 *  - while barred, every find_* tool is blocked in code (tool_call handler),
 *    not by trusting the prompt
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FooterComponent, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { chunkText, extractKeywords, formatArchiveLine, searchArchive, type ArchiveLine } from "./archive.ts";
import { loadConfig, moodIdsBySeverity, type WorldConfig } from "./config.ts";
import { gmAsk, gmJudgeAmendment, gmJudgeTruth, type GmTurn } from "./gmchat.ts";
import {
	asGameEvent,
	derive,
	describeEvent,
	LEDGER_TYPE,
	planRedemption,
	planSetMood,
	type DerivedState,
	type GameEvent,
} from "./ledger.ts";
import { detectTooling, searchPicture, searchVideo } from "./mediasearch.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import { searchText } from "./textsearch.ts";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app");
const DOWNLOAD_DIR = join(APP_DIR, "data", "downloads");
const DEFAULT_WORLD = "dragon-realm";
const GAME_TOOLS = ["find_text", "find_picture", "find_video", "set_mood", "grant_redemption", "record_name"];
const SEARCH_KINDS = ["text", "picture", "video"] as const;
const KIND_BY_TOOL: Record<string, string> = {
	find_text: "text",
	find_picture: "picture",
	find_video: "video",
};

export default function (pi: ExtensionAPI) {
	// Fail loudly at load time if the config tree is broken — pi then reports
	// the extension error and stays a plain coding agent, which is clearer
	// than a half-loaded game.
	let worldId = process.env.WORLD_CONSOLE_WORLD || DEFAULT_WORLD;
	let config: WorldConfig = loadConfig(APP_DIR, worldId);
	let st: DerivedState = derive([], config.world.defaultMood);
	let resumedFrom: string | undefined;
	const tooling = detectTooling(APP_DIR); // vendored yt-dlp + bundled/system ffmpeg

	pi.registerFlag("world", {
		description: `World Console: world id from app/config/worlds (default: ${DEFAULT_WORLD})`,
		type: "string",
	});

	function angriestMood(): string {
		const ids = moodIdsBySeverity(config);
		return ids[ids.length - 1];
	}

	/** Reload config for `id`; on failure keep the last good config. */
	function reloadFor(id: string): boolean {
		try {
			config = loadConfig(APP_DIR, id);
			return true;
		} catch {
			return false;
		}
	}

	function replay(ctx: ExtensionContext): void {
		uiCtx = ctx; // keep the footer's data source pointing at the live context
		st = derive(ctx.sessionManager.getBranch(), config.world.defaultMood);
	}

	// ---- footer -----------------------------------------------------------
	// Custom footer: pi's stock stats line (cost, "(sub)", context %, model •
	// thinking — rendered by the real FooterComponent, so formatting stays
	// byte-identical to stock pi) with the game line below it, and no cwd line.
	let uiCtx: ExtensionContext | undefined;
	let requestFooterRender: (() => void) | undefined;

	function gameFooterLine(): string {
		const barred = st.banned ? " · glass BARRED" : "";
		return `${config.world.voice} · mood: ${st.mood}${barred} · ${config.world.title}`;
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

	/** Append ledger events, then re-derive state from the branch (single source of truth). */
	function appendEvents(ctx: ExtensionContext, events: GameEvent[]): void {
		for (const event of events) pi.appendEntry(LEDGER_TYPE, event);
		replay(ctx);
		updateFooter(ctx);
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

	/** The full record a proposed truth is checked against (code-collected). */
	function truthEvidence(ctx: ExtensionContext) {
		return {
			truths: st.truths,
			ledgerLines: branchLedgerLines(ctx, 80),
			playLines: branchPlayLines(ctx, 80),
		};
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
		if (!st.world) appendEvents(ctx, [{ ev: "world", world: worldId }]);

		pi.setActiveTools(GAME_TOOLS);
		updateFooter(ctx);
		if (!pi.getSessionName()) pi.setSessionName(`World Console — ${config.world.title}`);
		if (ctx.hasUI && (event.reason === "startup" || event.reason === "new")) {
			ctx.ui.notify(`World Console: ${config.world.title} (world: ${worldId}, mood: ${st.mood})`, "info");
		}
	});

	// /tree moves the leaf to another branch: derive everything again from it.
	pi.on("session_tree", async (_event, ctx) => {
		replay(ctx);
		updateFooter(ctx);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		reloadFor(worldId); // hot reload: config edits apply on the next turn
		replay(ctx);
		return {
			systemPrompt: assembleSystemPrompt(config, {
				state: st,
				resumedFrom,
				justArrived: !branchHasAssistantReply(ctx),
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
						`[engine] The seeker invokes the scrying glass directly: kind="${kind}", query="${query}". ` +
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
				`world: ${st.world ?? worldId} · seeker: ${st.playerName ?? "unnamed"} · mood: ${st.mood}${barred}\n` +
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
			const refMatch = rawText.match(/\*u(\d+)\*/i);
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
				? st.truths.find((truth) => truth.toLowerCase() === verdict.supersedes!.toLowerCase())
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
				verdict = await gmJudgeTruth({ config, model, evidence: truthEvidence(ctx) }, text);
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
					gamePrompt: assembleSystemPrompt(config, {
						state: st,
						resumedFrom,
						justArrived: !branchHasAssistantReply(ctx),
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
					verdict = await gmJudgeTruth({ config, model, evidence: truthEvidence(ctx) }, text);
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
}
