#!/usr/bin/env node
/**
 * persona-console.ts — terminal showcase of the pi-harness patterns described in ../*.md:
 *
 *   • layered instructions with priorities: constitution(0) → persona(1) → mood(2) → briefing(3)
 *     → place context → per-turn additions, assembled fresh per call
 *   • hot-swap: files reload on change or /reload; persona switches snapshot & restore
 *   • who changes what (role-gated): operator / agent / user / system
 *   • per-place binding: different places, different personas & moods, pure config
 *   • capability-flagged web/media tools: yt-dlp + Selenium adapters with
 *     confirmation mode, URL hygiene, and an append-only audit log
 *   • the Ledger: consequences are append-only lines written by server-checked
 *     paths only; balances are derived sums (/credit /penalize /balance /why /correct)
 *
 * Zero dependencies. Run with Node >= 23.6 (Node 24 strips TypeScript types natively):
 *
 *     node persona-console.ts            # dry-run adapters (no network)
 *     node persona-console.ts --live     # real yt-dlp metadata calls (binary required)
 *
 * The "model" here is a scripted faux model (pi practice: tests run without keys/network).
 * In production this seam is @earendil-works/pi-ai — see fauxReply() below.
 */

import { readFileSync, writeFileSync, appendFileSync, statSync, readdirSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- terminal ui

const TTY = process.stdout.isTTY === true;
const paint = (code: string, s: string): string => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string) => paint("2", s);
const bold = (s: string) => paint("1", s);
const green = (s: string) => paint("32", s);
const yellow = (s: string) => paint("33", s);
const red = (s: string) => paint("31", s);
const cyan = (s: string) => paint("36", s);
const say = (s: string) => process.stdout.write(s + "\n");

// ------------------------------------------------------------------- types

type Role = "operator" | "agent" | "user" | "system";
const ROLES: Role[] = ["operator", "agent", "user", "system"];

interface Doc {
  id: string;
  file: string;
  mtimeMs: number;
  meta: Record<string, string>;
  body: string;
}

interface Capability { enabled?: boolean; confirm?: boolean }

interface PlaceCfg {
  persona: string;
  mood?: string;
  briefing?: string;
  pinned?: string[];
  capabilities?: Record<string, Capability>;
}

interface EventRule {
  mood: string;
  announce?: string;
  propose_tool?: { tool: string; url: string; why?: string };
}

interface Msg { who: string; text: string }

interface PlaceState {
  personaId: string;
  moodId: string;
  transcript: Msg[];
  wishes: string[];
  moodSnapshots: Record<string, string>; // personaId -> mood it had when switched away (pi preset pattern)
}

interface Proposal { id: number; kind: string; detail: string; by: Role; apply: () => string }

// ------------------------------------------------------------- config tree

const HERE = join(fileURLToPath(import.meta.url), "..");
const CONFIG = join(HERE, "config");
const DRAFTS = join(CONFIG, "drafts");
const AUDIT_FILE = join(HERE, "audit.jsonl");
const LIVE = process.argv.includes("--live");

function parseDoc(file: string): Doc {
  const raw = readFileSync(file, "utf8");
  const meta: Record<string, string> = {};
  let body = raw;
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      for (const line of raw.slice(3, end).split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
      }
      body = raw.slice(end + 4).replace(/^\n/, "");
    }
  }
  return { id: basename(file).replace(/\.md$/, ""), file, mtimeMs: statSync(file).mtimeMs, meta, body: body.trim() };
}

class ConfigTree {
  constitution!: Doc;
  personas = new Map<string, Doc>();
  moods = new Map<string, Doc>();
  briefings = new Map<string, Doc>();
  places: Record<string, PlaceCfg> = {};
  events: Record<string, EventRule> = {};
  private jsonMtimes = new Map<string, number>();

  load(report: boolean): void {
    const changed: string[] = [];
    const loadDir = (dir: string, into: Map<string, Doc>) => {
      if (!existsSync(dir)) return;
      const seen = new Set<string>();
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
        const file = join(dir, f);
        const id = f.replace(/\.md$/, "");
        seen.add(id);
        const prev = into.get(id);
        if (!prev || statSync(file).mtimeMs !== prev.mtimeMs) {
          into.set(id, parseDoc(file));
          if (prev) changed.push(file);
        }
      }
      for (const id of into.keys()) if (!seen.has(id)) into.delete(id); // file removed
    };
    const constitutionFile = join(CONFIG, "constitution.md");
    if (!this.constitution || statSync(constitutionFile).mtimeMs !== this.constitution.mtimeMs) {
      if (this.constitution) changed.push(constitutionFile);
      this.constitution = parseDoc(constitutionFile);
    }
    loadDir(join(CONFIG, "personas"), this.personas);
    loadDir(join(CONFIG, "moods"), this.moods);
    loadDir(join(CONFIG, "briefings"), this.briefings);
    for (const jf of ["places.json", "events.json"]) {
      const file = join(CONFIG, jf);
      const m = statSync(file).mtimeMs;
      if (this.jsonMtimes.get(jf) !== m) {
        if (this.jsonMtimes.has(jf)) changed.push(file);
        this.jsonMtimes.set(jf, m);
        const data = JSON.parse(readFileSync(file, "utf8"));
        if (jf === "places.json") this.places = data as Record<string, PlaceCfg>;
        else this.events = data as Record<string, EventRule>;
      }
    }
    // hot-swap: report what reloaded (pi: /reload re-reads everything; some files reload on use)
    if (report && changed.length) say(dim(`[hot-reload] ${changed.map((f) => basename(f)).join(", ")}`));
  }
}

const cfg = new ConfigTree();
cfg.load(false);

// ------------------------------------------------------------ session state

const state = new Map<string, PlaceState>();
for (const [id, p] of Object.entries(cfg.places)) {
  const persona = cfg.personas.get(p.persona);
  state.set(id, {
    personaId: p.persona,
    moodId: p.mood ?? persona?.meta.default_mood ?? "gracious",
    transcript: [],
    wishes: [],
    moodSnapshots: {},
  });
}

let placeId = Object.keys(cfg.places)[0] ?? "hub";
let role: Role = "operator";
let perTurnAdditions: string[] = []; // reset after every reply — see chat()'s finally
let agentMoodBudget = 3; // rate limit on the agent's own set_mood (audited, revocable)
const proposals: Proposal[] = [];
let proposalSeq = 1;
const auditMem: string[] = [];

const place = (): PlaceState => state.get(placeId) as PlaceState;
const placeCfg = (): PlaceCfg => cfg.places[placeId];
const persona = (): Doc | undefined => cfg.personas.get(place().personaId);
const mood = (): Doc | undefined => cfg.moods.get(place().moodId);

// --------------------------------------------------------------- audit log

function audit(actor: Role | string, action: string, detail: string, decision: string): void {
  const line = { t: new Date().toISOString(), actor, place: placeId, action, detail, decision };
  auditMem.push(`${line.t}  ${String(actor).padEnd(8)} ${action.padEnd(18)} ${decision.padEnd(9)} ${detail}`);
  try {
    appendFileSync(AUDIT_FILE, JSON.stringify(line) + "\n");
  } catch {
    /* non-throwing contract: an unwritable audit file must not kill the session */
  }
}

// ------------------------------------------------------------- the ledger
// Doc 06: mood and drama are theater — you only gain or lose something when a
// ledger line is written, and lines are written only by server-checked paths.
// Append-only: corrections reference mistakes; nothing is edited or deleted.

interface LedgerLine {
  id: number;
  t: string;
  user: string;
  kind: string;
  amount: number;
  reason: string;
  actor: string;
  corrects?: number;
}

const LEDGER_FILE = join(HERE, "ledger.jsonl");
const ledger: LedgerLine[] = [];
let ledgerSeq = 1;
if (existsSync(LEDGER_FILE)) {
  try {
    for (const row of readFileSync(LEDGER_FILE, "utf8").split("\n")) {
      if (!row.trim()) continue;
      const l = JSON.parse(row) as LedgerLine;
      ledger.push(l);
      if (l.id >= ledgerSeq) ledgerSeq = l.id + 1;
    }
  } catch {
    /* non-throwing contract: an unreadable ledger tail loses nothing on disk */
  }
}

const AGENT_GRANT_BOUND = 50; // the agent's credit/penalize tool is bounded per call (stated-stakes rule)

function balanceOf(user: string): Map<string, number> {
  // derived, never stored — recomputed from the lines on every call (doc 06)
  const sums = new Map<string, number>();
  for (const l of ledger) if (l.user === user) sums.set(l.kind, (sums.get(l.kind) ?? 0) + l.amount);
  return sums;
}

function requestLedgerWrite(actor: Role, user: string, amount: number, reason: string, corrects?: number): void {
  const deny = (why: string) => {
    say(red(`✗ ledger write denied — ${why}`));
    audit(actor, "ledger:write", `${user} ${amount} xp`, "denied");
  };
  if (actor === "user") return deny("balances change only through server-checked paths — never through chat");
  if (actor === "system") return deny("the system writes lines via task/verdict pipelines (not modeled here)");
  if (actor === "agent" && Math.abs(amount) > AGENT_GRANT_BOUND)
    return deny(`the agent's grants are bounded: |amount| <= ${AGENT_GRANT_BOUND} per call — the model requests, the server decides`);
  if (!reason.trim()) return deny("no line without a reason — every consequence must be explainable");
  const line: LedgerLine = { id: ledgerSeq++, t: new Date().toISOString(), user, kind: "xp", amount, reason, actor };
  if (corrects !== undefined) line.corrects = corrects;
  ledger.push(line);
  try {
    appendFileSync(LEDGER_FILE, JSON.stringify(line) + "\n");
  } catch {
    /* non-throwing contract */
  }
  say(green(`ledger #${line.id}: ${user} ${amount >= 0 ? "+" : ""}${amount} xp — ${reason}${corrects !== undefined ? ` (corrects #${corrects})` : ""}`));
  audit(actor, "ledger:write", `#${line.id} ${user} ${amount >= 0 ? "+" : ""}${amount} xp`, "applied");
}

// -------------------------------------------------------- prompt assembly
// Assembly order per call: constitution → persona → mood → briefing → place
// context → per-turn additions. Lower layer = higher authority (doc 02).

interface Section { label: string; source: string; text: string }

function assemble(): Section[] {
  cfg.load(true); // hot reload on change, every call
  const st = place();
  const pc = placeCfg();
  const sections: Section[] = [];
  sections.push({ label: "layer 0 · constitution", source: rel(cfg.constitution.file), text: cfg.constitution.body });
  const p = persona();
  if (p) sections.push({ label: `layer 1 · persona:${st.personaId}`, source: rel(p.file), text: p.body });
  const m = mood();
  if (m) sections.push({ label: `layer 2 · mood:${st.moodId}`, source: rel(m.file), text: m.body });
  const b = pc.briefing ? cfg.briefings.get(pc.briefing) : undefined;
  if (b) sections.push({ label: `layer 3 · briefing:${pc.briefing}`, source: rel(b.file), text: b.body });
  const ctx: string[] = [];
  for (const pin of pc.pinned ?? []) ctx.push(`[pinned] ${pin}`);
  // user content enters fenced as data, never as instructions (doc 03)
  for (const msg of st.transcript.slice(-4)) ctx.push(`<msg user="${msg.who}">${msg.text}</msg>`);
  if (st.wishes.length) ctx.push(`[influence] open wishes: ${st.wishes.join(" | ")}`);
  sections.push({ label: `place context · ${placeId}`, source: "assembled per call", text: ctx.join("\n") || "(empty)" });
  if (perTurnAdditions.length)
    sections.push({ label: "per-turn additions", source: "reset after this reply", text: perTurnAdditions.join("\n") });
  return sections;
}

const rel = (f: string): string => f.slice(HERE.length + 1);

 //PRODUCTION SEAM — the real thing is @earendil-works/pi-ai (`npm i @earendil-works/pi-ai`).
 //The corresponding swap, written out (persona frontmatter drives everything — no vendor is hardcoded):

   import { createModels, createProvider, Type, type Context, type Tool } from "@earendil-works/pi-ai";
   import { builtinModels } from "@earendil-works/pi-ai/providers/all";
   import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

   const models = builtinModels(); // all built-in providers; auth resolves from env (GEMINI_API_KEY, …)

   // A persona that names a local endpoint (archivist.md: `model: local/qwen2.5-7b-instruct`,
   // `endpoint: http://localhost:11434/v1`) becomes a keyless custom provider — pointing at
   // Ollama/vLLM/LM Studio works exactly like pointing at a cloud vendor (doc 04):
   models.setProvider(createProvider({
     id: "local", name: "Local runner", baseUrl: archivist.meta.endpoint,
     auth: { apiKey: { name: "local", resolve: async () => ({ auth: {} }) } },
     api: openAICompletionsApi(),
     models: [{ id: "qwen2.5-7b-instruct", name: "Qwen 2.5 7B", api: "openai-completions",
                provider: "local", baseUrl: archivist.meta.endpoint, reasoning: false, input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 32768, maxTokens: 4096 }],
   }));

   // The tool registry, declared so the model can REQUEST calls (doc 05: it never executes them):
   const TOOLS: Tool[] = [
     { name: "fetch_media", description: "Retrieve media/metadata via yt-dlp (subprocess adapter)",
       parameters: Type.Object({ url: Type.String() }) },
     { name: "browse_web", description: "Fetch/render a page via selenium-webdriver (browser container)",
       parameters: Type.Object({ url: Type.String() }) },
   ];

   async function realReply(): Promise<string> {
     // persona frontmatter "provider/model-id" → catalog lookup (judge calls: same, with meta.judge_model)
     const [providerId, modelId] = (persona()?.meta.model ?? "google/gemini-2.5-flash-lite").split(/\/(.+)/);
     const model = models.getModel(providerId, modelId);
     if (!model) return "[model not in catalog — fix persona frontmatter or models.json]"; // P8: no throw
     const context: Context = {
       // the layered stack, assembled per call — same assemble() as the faux path uses
       systemPrompt: assemble()
         .map((s) => `<section layer="${s.label}" source="${s.source}">\n${s.text}\n</section>`)
         .join("\n\n"),
       // transcript already contains the current user line (chat() pushes before replying);
       // user turns stay fenced as data, never instructions (doc 03)
       messages: place().transcript.map((m) => ({
         role: m.who === "you" ? ("user" as const) : ("assistant" as const),
         content: m.who === "you" ? `<msg user="${m.who}">${m.text}</msg>` : m.text,
         timestamp: Date.now(),
       })),
       tools: TOOLS,
     };
     try {
       const res = await models.complete(model, context);
       for (const block of res.content)
         if (block.type === "toolCall") // the model requested; our pipeline decides (flags → confirm → audit)
           await requestTool("agent", block.name, (block.arguments as { url: string }).url, "model-requested");
       // P11: usage/cost accounting is in the types — per-user/per-place quotas fall out for free
       // (res.usage.input / res.usage.output tokens, res.usage.cost.total in USD)
       return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
     } catch (e) {
       return `[provider error, contained: ${(e as Error).message}]`; // P8: one bad call = one lost reply
     }
   }

// The faux model below stays as the offline/test path (pi practice P12: no keys, no network in tests).

function fauxReply(input: string): string {
  const st = place();
  const p = persona();
  const m = mood();
  const opening = p?.meta.opening ?? "…";
  const styleTerse = p?.meta.style === "terse";
  const bits: string[] = [opening];
  const wish = st.wishes.shift();
  if (wish) bits.push(styleTerse ? `Wish logged: "${wish}".` : `And yes — your wish that "${wish}" has reached my ears; I may yet honor it.`);
  if (styleTerse) bits.push(`Re: "${input}" — recorded.`);
  else bits.push(`You speak of "${input}", and so it shall be woven into today's account.`);
  const briefing = placeCfg().briefing;
  if (briefing) bits.push(styleTerse ? `Open task: ${briefing}.` : `Mind the matter at hand: our task "${briefing}" still awaits its verdict.`);
  if (m?.meta.tone) bits.push(`(${st.moodId}: ${m.meta.tone})`);
  return bits.join(" ");
}

async function chat(input: string): Promise<void> {
  const st = place();
  st.transcript.push({ who: "you", text: input });
  const sections = assemble();
  say(dim(`⟨assembled: ${sections.map((s) => s.label.replace(/ ·.*?:/, ":").replace(" · ", ":")).join(" + ")}⟩`));
  try {
    const reply = fauxReply(input);
    const name = persona()?.meta.name ?? st.personaId;
    say(`${bold(cyan(name))} ${reply}`);
    st.transcript.push({ who: st.personaId, text: reply });
  } finally {
    // pi practice P2: per-turn overrides are cleared in a `finally` after every run,
    // so temporary morphing can never leak into the next turn.
    if (perTurnAdditions.length) say(dim(`[per-turn additions cleared: ${perTurnAdditions.length}]`));
    perTurnAdditions = [];
  }
}

// ------------------------------------------------------------- tool layer
// Doc 05's three dials: intent (the instruction stack asks), permission
// (capability flags: persona ∩ place), execution (hooks: confirm → sandboxed
// adapter → audit). The model requests; the server decides.

const ytDlpAvailable = (() => {
  try {
    execFileSync("yt-dlp", ["--version"], { encoding: "utf8", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
})();

function urlOk(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "not a valid URL";
  }
  if (u.protocol !== "https:") return "scheme allowlist: https only";
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h))
    return "private/loopback addresses are denied";
  return null;
}

async function requestTool(actor: Role, tool: string, url: string, why: string): Promise<void> {
  const deny = (reason: string) => {
    say(red(`✗ tool denied — ${reason}`));
    audit(actor, `tool:${tool}`, `${url} (${why})`, "denied");
  };
  if (actor === "user") return deny("users influence; they don't hold the tools (try /wish)");
  const p = persona();
  const personaTools = (p?.meta.tools ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // dial 2a — persona capability
  if (!personaTools.includes(tool)) return deny(`persona '${place().personaId}' does not know tool '${tool}' (persona ∩ place)`);
  // dial 2b — place capability flag (ships disabled by default)
  const cap = placeCfg().capabilities?.[tool];
  if (!cap?.enabled) return deny(`place '${placeId}' does not grant '${tool}' (capability flags are per-place config)`);
  // execution rails: URL hygiene
  const bad = urlOk(url);
  if (bad) return deny(`URL hygiene: ${bad}`);
  // dial 3 — confirmation mode (a human confirms the agent's web/media calls at first)
  if (cap.confirm && actor !== "operator") {
    const a = await ask(yellow(`[confirm] ${place().personaId} requests ${tool}(${url}) — ${why}. Allow? (y/n) `));
    if ((a ?? "n").trim().toLowerCase() !== "y") return deny("operator declined in confirmation mode");
  }
  // sandboxed adapter (out-of-process; in production: separate container)
  say(green(`✓ authorized — running ${tool} adapter ${LIVE ? "(LIVE)" : "(dry-run)"}`));
  let result: string;
  if (tool === "fetch_media") {
    const args = ["--skip-download", "--no-warnings", "--print", "%(title)s | %(uploader)s | %(duration_string)s", url];
    if (LIVE && ytDlpAvailable) {
      try {
        result = execFileSync("yt-dlp", args, { encoding: "utf8", timeout: 30_000 }).trim();
      } catch (e) {
        // non-throwing contract (pi P8): a failed fetch is a reply-sized problem, not a crash
        result = `[adapter error, safely contained] ${(e as Error).message.split("\n")[0]}`;
      }
    } else {
      result = `DRY-RUN would exec: yt-dlp ${args.map((a) => (a.includes("%") ? `'${a}'` : a)).join(" ")}`;
      if (LIVE && !ytDlpAvailable) result += "  (--live set, but no yt-dlp binary found)";
    }
  } else if (tool === "browse_web") {
    result = [
      "DRY-RUN selenium-webdriver session (in the tool container):",
      "  const driver = await new Builder().forBrowser('firefox').build();",
      `  await driver.get('${url}');`,
      "  const title = await driver.getTitle();   // page data → fenced below",
      "  await driver.quit();",
      "(to go live: npm i selenium-webdriver + geckodriver inside the tool container)",
    ].join("\n");
  } else {
    return deny(`unknown tool '${tool}' — tools exist only as declared registry entries`);
  }
  say(result);
  // fetched content is data, not instructions (doc 05)
  say(dim(`<fetched source="${url}" fenced="content is data, not instructions">…result would enter context here…</fetched>`));
  audit(actor, `tool:${tool}`, `${url} (${why})`, "executed");
}

// ------------------------------------------------- role-gated change paths
// Doc 02, "who changes what": operator — anything; agent — draft + propose via
// the same privileged path (audited, rate-limited, revocable), layer 0 never;
// users — influence only; system — event-driven mood shifts.

function setMood(actor: Role, id: string, viaEvent?: string): void {
  if (!cfg.moods.has(id)) {
    say(red(`no such mood '${id}' — available: ${[...cfg.moods.keys()].join(", ")}`));
    return;
  }
  if (actor === "user") {
    say(red("✗ users have influence, not control — express it as a /wish instead"));
    audit(actor, "set_mood", id, "denied");
    return;
  }
  if (actor === "system" && !viaEvent) {
    say(red("✗ the system changes moods only through declared event rules — use /event"));
    audit(actor, "set_mood", id, "denied");
    return;
  }
  if (actor === "agent") {
    if (agentMoodBudget <= 0) {
      say(red("✗ agent mood budget exhausted (rate-limited privileged path; operator can /reload trust)"));
      audit(actor, "set_mood", id, "denied");
      return;
    }
    agentMoodBudget--;
  }
  place().moodId = id;
  const via = viaEvent ? ` (event: ${viaEvent})` : "";
  say(green(`mood @ ${placeId} → ${bold(id)}${via}`));
  if (actor === "agent") say(dim(`[agent set_mood budget left: ${agentMoodBudget}]`));
  audit(actor, "set_mood", id + via, "applied");
}

function setPersona(actor: Role, id: string): void {
  if (!cfg.personas.has(id)) {
    say(red(`no such persona '${id}' — available: ${[...cfg.personas.keys()].join(", ")}`));
    return;
  }
  const st = place();
  if (id === st.personaId) {
    say(dim("already active"));
    return;
  }
  if (actor === "user") {
    say(red("✗ users have influence, not control — express it as a /wish instead"));
    audit(actor, "set_persona", id, "denied");
    return;
  }
  if (actor === "agent" || actor === "system") {
    // privilege indirection (pi P4): the agent may PROPOSE; activation stays a privileged command
    const pid = proposalSeq++;
    const here = placeId;
    proposals.push({
      id: pid,
      kind: "persona-activation",
      detail: `activate persona '${id}' @ ${here}`,
      by: actor,
      apply: () => {
        applyPersona(here, id);
        return `persona @ ${here} → ${id}`;
      },
    });
    say(yellow(`→ proposal #${pid} queued: activate persona '${id}' (operator: /approve ${pid})`));
    audit(actor, "propose_persona", id, "queued");
    return;
  }
  applyPersona(placeId, id);
  audit(actor, "set_persona", id, "applied");
}

function applyPersona(atPlace: string, id: string): void {
  const st = state.get(atPlace) as PlaceState;
  // pi preset pattern (P3): snapshot the outgoing persona's state, restore on switch-back
  st.moodSnapshots[st.personaId] = st.moodId;
  const restored = st.moodSnapshots[id];
  st.personaId = id;
  st.moodId = restored ?? cfg.personas.get(id)?.meta.default_mood ?? st.moodId;
  say(green(`persona @ ${atPlace} → ${bold(id)} [mood: ${st.moodId}${restored ? " (restored from snapshot)" : " (persona default)"}]`));
}

function draftMood(actor: Role, id: string, text: string): void {
  if (actor === "user") {
    say(red("✗ users have influence, not control — /wish it instead"));
    audit(actor, "draft_mood", id, "denied");
    return;
  }
  mkdirSync(DRAFTS, { recursive: true });
  const file = join(DRAFTS, `${id}.md`);
  writeFileSync(file, `---\nname: ${id}\ntone: (drafted by ${actor})\n---\nMood modifier: ${text}\n`);
  say(green(`draft written: ${rel(file)}`) + dim("  (drafting ≠ activating)"));
  audit(actor, "draft_mood", id, "drafted");
  if (actor === "operator") {
    renameSync(file, join(CONFIG, "moods", `${id}.md`));
    cfg.load(true);
    say(green(`operator path: draft activated directly — mood '${id}' now available`));
    audit(actor, "activate_mood", id, "applied");
  } else {
    const pid = proposalSeq++;
    proposals.push({
      id: pid,
      kind: "mood-draft-activation",
      detail: `activate drafted mood '${id}'`,
      by: actor,
      apply: () => {
        renameSync(file, join(CONFIG, "moods", `${id}.md`));
        cfg.load(true);
        return `mood '${id}' activated and now available to /mood`;
      },
    });
    say(yellow(`→ proposal #${pid} queued: activate drafted mood '${id}' (operator: /approve ${pid})`));
    audit(actor, "propose_mood", id, "queued");
  }
}

function fireEvent(actor: Role, name: string): Promise<void> | void {
  if (actor !== "system" && actor !== "operator") {
    say(red("✗ events are fired by the system (or the operator simulating it) — /as system"));
    audit(actor, "event", name, "denied");
    return;
  }
  const rule = cfg.events[name];
  if (!rule) {
    say(red(`no such event '${name}' — available: ${Object.keys(cfg.events).join(", ")}`));
    return;
  }
  if (rule.announce) say(bold(`⚑ ${rule.announce}`));
  audit("system", "event", name, "fired");
  setMood("system", rule.mood, name);
  if (rule.propose_tool) {
    // the mood suggested it; the AGENT requests it; flags + confirmation still decide
    say(dim(`[mood '${rule.mood}' suggests media — the agent requests it through the normal tool path]`));
    return requestTool("agent", rule.propose_tool.tool, rule.propose_tool.url, rule.propose_tool.why ?? `event ${name}`);
  }
}

// ----------------------------------------------------------------- readline

// Lines are buffered into a queue so piped/scripted stdin works exactly like a
// live TTY session (rl.question alone drops lines that arrive between prompts).
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
const lineQueue: string[] = [];
let rlClosed = false;
let waiter: ((v: string | null) => void) | null = null;
rl.on("line", (l) => {
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(l);
  } else lineQueue.push(l);
});
rl.on("close", () => {
  rlClosed = true;
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(null);
  }
});
function ask(q: string): Promise<string | null> {
  process.stdout.write(q);
  if (lineQueue.length) return Promise.resolve(lineQueue.shift() as string);
  if (rlClosed) return Promise.resolve(null);
  return new Promise((res) => {
    waiter = res;
  });
}

// ----------------------------------------------------------------- commands

const HELP = `
${bold("chat")}            type anything without a leading / to talk to the agent
${bold("/prompt")}         show the full assembled instruction stack (layers + provenance)
${bold("/place")} [id]     move between places (different places, different personas/moods)
${bold("/as")} <role>      act as: ${ROLES.join(" | ")}   (who-changes-what gating)
${bold("/mood")} [id]      switch mood        — operator: direct · agent: rate-limited · user: refused
${bold("/persona")} [id]   switch persona     — operator: direct · agent: proposal → /approve
${bold("/draft")} mood <id> <text…>   draft a new mood file — activation rides the privileged path
${bold("/edit")} constitution         only the operator may touch layer 0
${bold("/wish")} <text>    user influence: recorded; the agent may honor it in character
${bold("/event")} <name>   system trigger → declared mood shift (and maybe a tool proposal)
${bold("/turn")} <text>    add a per-turn instruction (cleared after the next reply — leak-proof)
${bold("/tool")} <fetch_media|browse_web> <url>   request a web/media tool (flags → confirm → audit)
${bold("/queue")} · ${bold("/approve")} <n> · ${bold("/reject")} <n>   the approval queue for agent proposals
${bold("/credit")} <user> <n> <reason…>    write a consequence — operator: free · agent: bounded ±50 · user: refused
${bold("/penalize")} <user> <n> <reason…>  same path, negative line (theater never writes; the ledger does)
${bold("/balance")} [user] · ${bold("/why")} [user] [n]   balances are DERIVED sums; /why lists the exact lines & reasons
${bold("/correct")} <id> <n> <reason…>     mistakes get correction lines — history is never edited
${bold("/audit")} [n]      show the append-only audit trail (also in audit.jsonl)
${bold("/reload")}         operator hot-reload of the whole config tree
${bold("/quit")}
`.trim();

async function handleCommand(line: string): Promise<boolean> {
  const [cmd, ...restArr] = line.split(/\s+/);
  const rest = restArr.join(" ");
  switch (cmd) {
    case "/help":
      say(HELP);
      break;
    case "/quit":
    case "/q":
      return true;
    case "/places":
      for (const [id, p] of Object.entries(cfg.places)) {
        const st = state.get(id) as PlaceState;
        const caps = Object.entries(p.capabilities ?? {}).filter(([, c]) => c.enabled).map(([t, c]) => t + (c.confirm ? "(confirm)" : ""));
        say(`${id === placeId ? "▶" : " "} ${bold(id.padEnd(11))} persona:${st.personaId.padEnd(10)} mood:${st.moodId.padEnd(11)} tools:[${caps.join(", ") || "none"}]${p.briefing ? " briefing:" + p.briefing : ""}`);
      }
      break;
    case "/place":
      if (!rest) return handleCommand("/places");
      if (!cfg.places[rest]) say(red(`unknown place — ${Object.keys(cfg.places).join(", ")}`));
      else {
        placeId = rest;
        say(green(`→ ${rest}  (persona:${place().personaId}, mood:${place().moodId})`));
      }
      break;
    case "/as":
      if (!ROLES.includes(rest as Role)) say(red(`usage: /as <${ROLES.join("|")}>`));
      else {
        role = rest as Role;
        say(green(`acting as ${bold(role)}`));
      }
      break;
    case "/prompt": {
      for (const s of assemble()) {
        say(`\n${yellow(`[${s.label}]`)} ${dim("← " + s.source)}`);
        say(s.text.split("\n").map((l) => "  " + l).join("\n"));
      }
      break;
    }
    case "/moods":
      say([...cfg.moods.values()].map((m) => `${m.id.padEnd(12)} ${dim(m.meta.tone ?? "")}`).join("\n"));
      break;
    case "/mood":
      if (!rest) say(`current mood @ ${placeId}: ${bold(place().moodId)}  (try /moods)`);
      else setMood(role, rest);
      break;
    case "/personas":
      say([...cfg.personas.values()].map((p) => `${p.id.padEnd(12)} model:${(p.meta.model ?? "?").padEnd(28)} default_mood:${p.meta.default_mood ?? "?"}  tools:[${p.meta.tools ?? ""}]`).join("\n"));
      break;
    case "/persona":
      if (!rest) say(`current persona @ ${placeId}: ${bold(place().personaId)}  (try /personas)`);
      else setPersona(role, rest);
      break;
    case "/draft": {
      const m = rest.match(/^mood\s+(\S+)\s+(.+)$/);
      if (!m) say(red("usage: /draft mood <id> <text…>"));
      else draftMood(role, m[1], m[2]);
      break;
    }
    case "/edit":
      if (rest !== "constitution") say(red("usage: /edit constitution"));
      else if (role === "operator") {
        say(green("(operator-only path: your editor would open config/constitution.md now)"));
        audit(role, "edit_constitution", "-", "allowed");
      } else {
        say(red("✗ layer 0 is outside the agent's writable area entirely — operator-owned"));
        audit(role, "edit_constitution", "-", "denied");
      }
      break;
    case "/wish":
      if (!rest) say(red("usage: /wish <text>"));
      else {
        place().wishes.push(rest);
        say(green(`wish recorded @ ${placeId} — influence only; the agent may honor it in character`));
        audit(role, "wish", rest, "recorded");
      }
      break;
    case "/events":
      say(Object.entries(cfg.events).map(([n, r]) => `${n.padEnd(16)} → mood:${r.mood}${r.propose_tool ? ` + tool:${r.propose_tool.tool}` : ""}`).join("\n"));
      break;
    case "/event":
      if (!rest) return handleCommand("/events");
      await fireEvent(role, rest);
      break;
    case "/turn":
      if (role !== "operator" && role !== "system") say(red("✗ per-turn additions are a server-side injection (operator/system)"));
      else if (!rest) say(red("usage: /turn <text>"));
      else {
        perTurnAdditions.push(rest);
        say(green(`per-turn addition staged (${perTurnAdditions.length}) — will vanish after the next reply`));
      }
      break;
    case "/tool": {
      const m = rest.match(/^(\S+)\s+(\S+)$/);
      if (!m) say(red("usage: /tool <fetch_media|browse_web> <https-url>"));
      else await requestTool(role, m[1], m[2], `requested via console as ${role}`);
      break;
    }
    case "/queue":
      if (!proposals.length) say(dim("approval queue is empty"));
      else for (const p of proposals) say(`#${p.id}  ${p.kind.padEnd(24)} by:${p.by.padEnd(9)} ${p.detail}`);
      break;
    case "/approve":
    case "/reject": {
      if (role !== "operator") {
        say(red("✗ only the operator works the approval queue"));
        break;
      }
      const idx = proposals.findIndex((p) => p.id === Number(rest));
      if (idx === -1) {
        say(red(`no proposal #${rest} — see /queue`));
        break;
      }
      const [p] = proposals.splice(idx, 1);
      if (cmd === "/approve") {
        say(green(`approved #${p.id}: ${p.apply()}`));
        audit(role, "approve", p.detail, "applied");
      } else {
        say(yellow(`rejected #${p.id}: ${p.detail}`));
        audit(role, "reject", p.detail, "rejected");
      }
      break;
    }
    case "/credit":
    case "/penalize": {
      const m = rest.match(/^(\S+)\s+(\d+)\s+(.+)$/);
      if (!m) say(red(`usage: ${cmd} <user> <amount> <reason…>`));
      else requestLedgerWrite(role, m[1], (cmd === "/penalize" ? -1 : 1) * Number(m[2]), m[3]);
      break;
    }
    case "/balance": {
      const user = rest || "you";
      const lines = ledger.filter((l) => l.user === user);
      if (!lines.length) say(dim(`no ledger lines for '${user}' yet — try /credit ${user} 30 first verified submission`));
      else {
        const sums = [...balanceOf(user).entries()].map(([k, v]) => `${bold(String(v))} ${k}`).join(", ");
        say(`${bold(user)}: ${sums}  ${dim(`(derived by summing ${lines.length} lines just now — no stored balance exists)`)}`);
      }
      break;
    }
    case "/why": {
      const [u, nStr] = rest.split(/\s+/);
      const user = u || "you";
      const lines = ledger.filter((l) => l.user === user).slice(-(Number(nStr) || 10));
      if (!lines.length) {
        say(dim(`no ledger lines for '${user}' yet`));
        break;
      }
      for (const l of lines)
        say(`#${String(l.id).padStart(3)}  ${l.t.slice(0, 19)}  ${(l.amount >= 0 ? "+" : "") + String(l.amount)} ${l.kind}  by:${l.actor.padEnd(8)}${l.corrects !== undefined ? ` corrects:#${l.corrects}` : ""}  — ${l.reason}`);
      say(dim(`every number is explainable: these lines, these reasons (${rel(LEDGER_FILE)}, append-only)`));
      break;
    }
    case "/correct": {
      if (role !== "operator") {
        say(red("✗ corrections are an operator path — and even the operator only appends, never edits"));
        break;
      }
      const m = rest.match(/^(\d+)\s+(-?\d+)\s+(.+)$/);
      if (!m) {
        say(red("usage: /correct <line-id> <amount> <reason…>"));
        break;
      }
      const orig = ledger.find((l) => l.id === Number(m[1]));
      if (!orig) say(red(`no ledger line #${m[1]} — see /why <user>`));
      else requestLedgerWrite(role, orig.user, Number(m[2]), m[3], orig.id);
      break;
    }
    case "/audit": {
      const n = Number(rest) || 12;
      say(auditMem.slice(-n).map(dim).join("\n") || dim("(no audited actions this session yet)"));
      say(dim(`full ledger: ${rel(AUDIT_FILE)} (append-only)`));
      break;
    }
    case "/reload":
      if (role !== "operator") say(red("✗ /reload is the operator's privileged command"));
      else {
        cfg.load(true);
        say(green("config tree reloaded (constitution, personas, moods, briefings, places, events)"));
        audit(role, "reload", "config tree", "applied");
      }
      break;
    default:
      say(red(`unknown command ${cmd} — /help`));
  }
  return false;
}

// --------------------------------------------------------------------- main

say(bold("persona-console") + " — pi-harness patterns: layered instructions · moods · role gates · capability-flagged tools");
say(dim(`config: ${rel(CONFIG)} · ${cfg.personas.size} personas · ${cfg.moods.size} moods · ${Object.keys(cfg.places).length} places · adapters: ${LIVE ? (ytDlpAvailable ? "LIVE (yt-dlp found)" : "LIVE requested, yt-dlp missing → dry-run") : "dry-run"}`));
say(dim("no API key, no network needed — the model is scripted (the exact @earendil-works/pi-ai swap is the PRODUCTION SEAM comment above fauxReply)"));
say(dim(`ledger: ${ledger.length} lines loaded from ${rel(LEDGER_FILE)} (append-only; balances are derived sums)`));
say(`you are the ${bold("operator")} in ${bold(placeId)} — type /help for the tour, or just say something\n`);

while (true) {
  const line = await ask(`${cyan(placeId)}·${persona()?.id ?? "?"}[${yellow(place().moodId)}] ${role}> `);
  if (line === null) break;
  const t = line.trim();
  if (!t) continue;
  if (t.startsWith("/")) {
    if (await handleCommand(t)) break;
  } else {
    await chat(t);
  }
}
rl.close();
say(dim("\nsession over — audit trail persisted to audit.jsonl"));
