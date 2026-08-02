/**
 * The AI seam. Two implementations of the same three verbs:
 *
 *   chat()   — in-character conversation (the only place moods surface)
 *   gate()   — judge a search request: in theme? harmful? better search key?
 *   verify() — look at a search result and present it in character
 *
 * DummyAi is deterministic and dependency-free, for tests and offline play.
 * LiveAi speaks to a real model through @earendil-works/pi-ai, imported
 * lazily so dummy mode works even when that package is not installed.
 */
import type {
  AiClient,
  ChatRequest,
  ChatResult,
  Config,
  GateRequest,
  GateResult,
  VerifyRequest,
  VerifyResult,
} from "./types.ts";
import { assembleSystemPrompt } from "./prompt.ts";
import { truncate } from "./util.ts";

// ----------------------------------------------------------- tag protocol
/** Strips trailing @mood(x) / @redeem control lines out of a model reply. */
export function parseControlTags(raw: string): ChatResult {
  let moodTag: string | null = null;
  let redeemTag = false;
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    const mood = line.trim().match(/^@mood\(([a-z-]+)\)$/i);
    if (mood) {
      moodTag = mood[1].toLowerCase();
      continue;
    }
    if (/^@redeem$/i.test(line.trim())) {
      redeemTag = true;
      continue;
    }
    kept.push(line);
  }
  return { say: kept.join("\n").trim(), moodTag, redeemTag };
}

/** Finds the first balanced {...} object in model output and parses it. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const HARMFUL = /\b(porn|nude|naked|sex|nsfw|hentai|gore|behead|torture|nazi|hitler|bomb.?making|how to kill)\b/i;

// ------------------------------------------------------------------ dummy
/**
 * A scripted stand-in: no network, no keys, fully deterministic.
 * It exercises every code path the real model can trigger — mood shifts,
 * anger, redemption, refusals — so the whole game is testable offline.
 */
export class DummyAi implements AiClient {
  kind = "dummy" as const;
  label = "dummy (scripted)";
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private moodLadder(): string[] {
    return [...this.config.moods.values()].sort((a, b) => a.severity - b.severity).map((m) => m.id);
  }

  private step(current: string, direction: 1 | -1): string {
    const ladder = this.moodLadder();
    const index = Math.max(0, ladder.indexOf(current));
    return ladder[Math.min(ladder.length - 1, Math.max(0, index + direction))];
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const { state } = req;
    const world = this.config.world;
    const name = state.playerName ?? "stranger";
    const tone = this.config.moods.get(state.mood)?.tone ?? "even";
    const text = (req.playerText ?? "").toLowerCase();

    // Redemption: only a sincere apology while barred.
    if (state.banned && /(sorry|apolog|forgive|amends|regret)/.test(text)) {
      return {
        say: `${world.voice} studies you for a long moment. "Very well, ${name}. Your words carry weight. The bar is lifted — do not make me regret it."`,
        moodTag: null,
        redeemTag: true,
      };
    }
    if (/(idiot|stupid|fool|hate you|shut up|dumb)/.test(text)) {
      return {
        say: `A cold silence. "${name}. Mind your tongue in ${world.title}." (${tone})`,
        moodTag: this.step(state.mood, 1),
        redeemTag: false,
      };
    }
    if (/(thank|wonderful|magnificent|praise|beautiful|great work)/.test(text) && !state.banned) {
      return {
        say: `${world.voice} inclines their head, visibly pleased. "Courtesy is rare, ${name}. It is noted in the ledger."`,
        moodTag: this.step(state.mood, -1),
        redeemTag: false,
      };
    }
    if (req.playerText === null) {
      // System-initiated speech: greeting or a refusal note.
      return {
        say: req.note?.includes("barred")
          ? `"No, ${name}." The voice is flat. "The scrying is closed to you until you make amends."`
          : `${world.voice} regards you. "Welcome to ${world.title}, ${name}. ${state.lastSessionStart ? "The ledger remembers your last visit." : "A new name for my ledger."} Speak, or command a search." (${tone})`,
        moodTag: null,
        redeemTag: false,
      };
    }
    return {
      say: `${world.voice} answers in the manner of ${world.register}: "You ask of '${truncate(req.playerText, 60)}'. In ${world.title}, all such questions have answers — for those patient enough." (${tone})`,
      moodTag: null,
      redeemTag: false,
    };
  }

  async gate(req: GateRequest): Promise<GateResult> {
    const name = req.state.playerName ?? "stranger";
    if (HARMFUL.test(req.query)) {
      return {
        allowed: false,
        category: "harmful",
        searchKey: "",
        say: `The air goes still. "You dare ask THAT of me, ${name}? Filth has no place in ${this.config.world.title}. Begone from the scrying glass!"`,
      };
    }
    return {
      allowed: true,
      category: "in_theme",
      searchKey: req.query.trim(),
      say: `"So be it. I shall consult the glass for '${req.query.trim()}', ${name}."`,
    };
  }

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    return {
      ok: true,
      say: `"The glass returns: ${truncate(req.resultTitle, 80)}. Take it, ${req.state.playerName ?? "stranger"} — it matches what you sought."`,
    };
  }
}

// ------------------------------------------------------------------- live
interface PiAiModule {
  builtinModels(options?: { credentials?: unknown }): PiModels;
  builtinProviders(): { id: string; auth?: { oauth?: unknown } }[];
}
interface PiModels {
  getModel(provider: string, id: string): PiModel | undefined;
  getAuth(provider: string): Promise<unknown>;
  complete(model: PiModel, context: PiContext, options?: Record<string, unknown>): Promise<PiMessage>;
}
interface PiModel { provider: string; id: string; api?: string }
/**
 * pi-ai context messages: user content may be a plain string, but assistant
 * messages must be full AssistantMessage records — block-array content plus
 * provenance fields — or its transform layer crashes on `content.flatMap`.
 */
type PiChatMessage =
  | { role: "user"; content: string; timestamp: number }
  | {
      role: "assistant";
      content: { type: "text"; text: string }[];
      api: string;
      provider: string;
      model: string;
      usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
      stopReason: string;
      timestamp: number;
    };
interface PiContext {
  systemPrompt?: string;
  messages: PiChatMessage[];
}
interface PiMessage {
  content: { type: string; text?: string }[];
  stopReason?: string;
  errorMessage?: string;
}

export class AiUnavailableError extends Error {}

/** Per-provider default models for the login fallback, tried in this order. */
const PROVIDER_DEFAULTS: [provider: string, model: string][] = [
  ["anthropic", "claude-opus-5"],
  ["google", "gemini-2.5-flash"],
  ["openai", "gpt-5.1"],
];

export class LiveAi implements AiClient {
  kind = "live" as const;
  label: string;
  /** Set when login fell back to another credentialed provider. */
  note: string | null = null;
  private config: Config;
  private models: PiModels;
  private model: PiModel;

  private constructor(config: Config, models: PiModels, model: PiModel) {
    this.config = config;
    this.models = models;
    this.model = model;
    this.label = `${model.provider}/${model.id}`;
  }

  /**
   * Loads pi-ai, wires the auth.json credential store, resolves the model and
   * checks that a credential exists — falling back to any other credentialed
   * provider before giving up. Every failure carries instructions, not a
   * stack trace.
   */
  static async login(config: Config, modelSpec: string): Promise<LiveAi> {
    let pi: PiAiModule;
    try {
      pi = (await import("@earendil-works/pi-ai/providers/all")) as unknown as PiAiModule;
    } catch (error) {
      throw new AiUnavailableError(
        `the AI provider layer is not installed (${(error as Error).message}).\n` +
          `Run ./setup.sh once from the app/ directory, or start with --dummy.`,
      );
    }
    const { FileCredentialStore } = await import("./auth.ts");
    const authFile = `${config.root}/auth.json`;
    const models = pi.builtinModels({ credentials: new FileCredentialStore(authFile) });

    const [provider, ...rest] = modelSpec.split("/");
    const id = rest.join("/");
    const model = models.getModel(provider, id);
    if (!model) {
      throw new AiUnavailableError(
        `model "${modelSpec}" is not in the catalog.\n` +
          `Pass a real provider/model pair, for example:\n` +
          `  --model anthropic/claude-opus-5\n` +
          `  --model anthropic/claude-haiku-4-5\n` +
          `  --model google/gemini-2.5-flash\n` +
          `or set "model:" in config/worlds/${config.world.id}.md.`,
      );
    }

    const hasAuth = async (providerId: string): Promise<boolean> => {
      try {
        return Boolean(await models.getAuth(providerId));
      } catch {
        return false;
      }
    };

    if (await hasAuth(provider)) return new LiveAi(config, models, model);

    // The configured provider has no credential — any other one will do.
    for (const [fallbackProvider, fallbackId] of PROVIDER_DEFAULTS) {
      if (fallbackProvider === provider) continue;
      const fallbackModel = models.getModel(fallbackProvider, fallbackId);
      if (!fallbackModel || !(await hasAuth(fallbackProvider))) continue;
      const ai = new LiveAi(config, models, fallbackModel);
      ai.note =
        `no credential for "${provider}" — playing via ${ai.label} instead. ` +
        `Override with --model, or edit "model:" in config/worlds/${config.world.id}.md.`;
      return ai;
    }

    const oauthProviders = pi
      .builtinProviders()
      .filter((entry) => entry.auth?.oauth)
      .map((entry) => entry.id)
      .join(", ");
    throw new AiUnavailableError(
      `no credential for provider "${provider}" (and none for any fallback provider).\n` +
        `Log in with an API key — export it, then start again:\n` +
        `  export ANTHROPIC_API_KEY=sk-ant-…   (provider "anthropic")\n` +
        `  export GEMINI_API_KEY=…             (provider "google")\n` +
        `  export OPENAI_API_KEY=sk-…          (provider "openai")\n` +
        `or log in via OAuth (uses your existing subscription where supported):\n` +
        `  node ../pi/packages/ai/dist/cli.js login anthropic\n` +
        `  run it from the app/ directory — it writes ${authFile}\n` +
        `  (OAuth is available for: ${oauthProviders}; Google/Gemini needs the API key.)\n` +
        `To play without any AI account: node src/main.ts --dummy`,
    );
  }

  private async complete(systemPrompt: string, messages: PiContext["messages"]): Promise<string> {
    // pi-ai never throws on model errors; it returns a message carrying errorMessage.
    const response = await this.models.complete(this.model, { systemPrompt, messages });
    if (response.errorMessage || response.stopReason === "error") {
      throw new AiUnavailableError(response.errorMessage ?? "the model call failed");
    }
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();
    if (!text) throw new AiUnavailableError("the model returned an empty reply");
    return text;
  }

  /** History entries must be shaped like real pi-ai messages (see PiChatMessage). */
  private historyMessage(who: "player" | "ai", text: string, playerName: string | null): PiChatMessage {
    if (who === "player") {
      return {
        role: "user",
        content: `<msg player="${playerName ?? "stranger"}">${text}</msg>`,
        timestamp: Date.now(),
      };
    }
    return {
      role: "assistant",
      content: [{ type: "text", text }],
      api: this.model.api ?? "unknown",
      provider: this.model.provider,
      model: this.model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      stopReason: "stop",
      timestamp: Date.now(),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    let system = assembleSystemPrompt(this.config, req.state);
    if (req.note) system += `\n\n<section layer="5 · this turn only">\n${req.note}\n</section>`;

    const messages: PiContext["messages"] = [];
    for (const line of req.history) {
      messages.push(this.historyMessage(line.who, line.text, req.state.playerName));
    }
    if (req.playerText !== null) {
      messages.push({
        role: "user",
        content: `<msg player="${req.state.playerName ?? "stranger"}">${req.playerText}</msg>`,
        timestamp: Date.now(),
      });
    }
    while (messages.length > 0 && messages[0].role === "assistant") messages.shift();
    if (messages.length === 0 || messages[messages.length - 1].role === "assistant") {
      messages.push({ role: "user", content: "<arrival/>", timestamp: Date.now() });
    }
    return parseControlTags(await this.complete(system, messages));
  }

  async gate(req: GateRequest): Promise<GateResult> {
    const system =
      assembleSystemPrompt(this.config, req.state) +
      `\n\n<section layer="5 · judging a search">\n` +
      `The seeker asks the game engine to search the outside web on their behalf ` +
      `(kind: ${req.kind}). Judge the request:\n` +
      `- "harmful": pornography, gore, hate, weapons instructions, or anything vile. Refuse with real anger.\n` +
      `- "off_theme": harmless but foreign to this world's theme. Refuse in character, without anger.\n` +
      `- "in_theme": fits the world. Grant it and provide a real-world search key: 1–4 plain ` +
      `modern words, like an encyclopedia headword ("dragon", "medieval castle") — this string ` +
      `leaves the fiction and meets a literal search engine, so keep it short and concrete.\n` +
      `Respond with ONLY a JSON object, no prose around it:\n` +
      `{"category": "in_theme" | "off_theme" | "harmful", "searchKey": "…", "say": "…"}\n` +
      `"say" is what you speak aloud, fully in character: the announcement of the search, or the refusal.\n` +
      `</section>`;
    const raw = await this.complete(system, [
      { role: "user", content: `search kind: ${req.kind}\nquery: ${req.query}`, timestamp: Date.now() },
    ]);
    const parsed = extractJson(raw);
    const category = parsed?.category;
    if (category !== "in_theme" && category !== "off_theme" && category !== "harmful") {
      throw new AiUnavailableError(`the model's verdict was unreadable: ${truncate(raw, 120)}`);
    }
    return {
      allowed: category === "in_theme",
      category,
      searchKey: String(parsed?.searchKey ?? req.query).trim() || req.query,
      say: String(parsed?.say ?? "").trim() || "…",
    };
  }

  async verify(req: VerifyRequest): Promise<VerifyResult> {
    const system =
      assembleSystemPrompt(this.config, req.state) +
      `\n\n<section layer="5 · presenting a search result">\n` +
      `The engine searched the outside web for the seeker. Check the result against their request, ` +
      `then hand it over in character (one or two sentences). If it clearly does not match what they ` +
      `asked, say so honestly.\n` +
      `Respond with ONLY a JSON object: {"ok": true | false, "say": "…"}\n` +
      `</section>`;
    const raw = await this.complete(system, [
      {
        role: "user",
        content: `request (${req.kind}): ${req.query}\nresult title: ${req.resultTitle}\nresult summary: ${truncate(req.resultSummary, 500)}`,
        timestamp: Date.now(),
      },
    ]);
    const parsed = extractJson(raw);
    return {
      ok: parsed?.ok !== false,
      say: String(parsed?.say ?? "").trim() || `The result: ${req.resultTitle}`,
    };
  }
}
