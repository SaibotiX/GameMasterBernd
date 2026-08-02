/**
 * World console — entry point.
 *
 *   node src/main.ts                # live AI (needs a provider credential)
 *   node src/main.ts --dummy       # scripted AI, no network account needed
 *   node src/main.ts --world star-frontier
 *   node src/main.ts --model anthropic/claude-opus-5
 *   node src/main.ts --no-open     # print file paths instead of opening viewers
 *
 * No commands → you chat with the AI game master, in character, moods and all.
 * Commands (find / site / ledger / help / exit) → see `help`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, angriestMood } from "./config.ts";
import { Ledger } from "./ledger.ts";
import { DummyAi, LiveAi, AiUnavailableError } from "./ai.ts";
import { detectTooling } from "./adapters/video.ts";
import type { GameContext } from "./context.ts";
import { dispatch } from "./commands.ts";
import { LineReader, bold, cyan, dim, red } from "./util.ts";
import type { AiClient } from "./types.ts";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const worldId = argValue(argv, "--world") ?? "dragon-realm";
  const dataDir = argValue(argv, "--data") ?? join(APP_ROOT, "data");

  const config = loadConfig(APP_ROOT, worldId);
  const angryMood = angriestMood(config);
  const ledger = new Ledger(join(dataDir, "ledger.jsonl"), config.world.defaultMood, angryMood);

  // ---- login -----------------------------------------------------------
  let ai: AiClient;
  let loginNote: string | null = null;
  if (argv.includes("--dummy")) {
    ai = new DummyAi(config);
  } else {
    try {
      const live = await LiveAi.login(config, argValue(argv, "--model") ?? config.world.model);
      loginNote = live.note;
      ai = live;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        console.error(red("cannot start the live AI: ") + error.message);
        process.exit(1);
      }
      throw error;
    }
  }

  const reader = new LineReader();
  const ctx: GameContext = {
    config,
    ledger,
    ai,
    tooling: detectTooling(APP_ROOT),
    downloadDir: join(dataDir, "downloads"),
    noOpen: argv.includes("--no-open"),
    wantExit: false,
    aiSays(text: string) {
      if (!text) return;
      console.log(cyan(text));
      ledger.append("ai", "chat", { who: "ai", text });
    },
    system(text: string) {
      console.log(dim("· ") + text);
    },
    angryMoodId: () => angryMood,
  };

  console.log(bold(`\n  ${config.world.title}`));
  console.log(dim(`  world: ${config.world.id} · AI: ${ai.label} · ledger: ${ledger.size} lines\n`));
  if (loginNote) ctx.system(loginNote);

  // ---- the player's name lives in the ledger ---------------------------
  ledger.append("system", "session_start", { world: worldId, ai: ai.kind });
  let state = ledger.derive();
  if (!state.playerName) {
    const name = ((await reader.ask("  By what name shall the ledger know you? ")) ?? "").trim();
    if (!name) return; // stdin ended before a name was given
    ledger.append("player", "player_named", { name });
    state = ledger.derive();
  }

  // ---- greeting --------------------------------------------------------
  try {
    const greeting = await ai.chat({
      state,
      history: ledger.recentChat(8),
      playerText: null,
      note: "The seeker has just arrived at the console. Greet them by name, in character; if the ledger shows history, let it show in your words. Two sentences at most.",
    });
    ctx.aiSays(greeting.say);
  } catch (error) {
    ctx.system(red(`the AI stayed silent: ${(error as Error).message}`));
  }

  // ---- the loop --------------------------------------------------------
  while (!ctx.wantExit) {
    state = ledger.derive();
    const prompt = `${bold(state.playerName ?? "?")}${dim("@" + config.world.id + "> ")}`;
    const line = await reader.ask(prompt);
    if (line === null) break; // stdin closed
    const input = line.trim();
    if (!input) continue;

    try {
      if (await dispatch(ctx, input)) continue;

      // Not a command → conversation. Mood shows itself only here.
      ledger.append("player", "chat", { who: "player", text: input });
      const reply = await ai.chat({
        state: ledger.derive(),
        history: ledger.recentChat(16).slice(0, -1),
        playerText: input,
        note: null,
      });
      ctx.aiSays(reply.say);

      // Control tags → ledger lines. Chat itself never changes state directly.
      if (reply.redeemTag && ledger.derive().banned) {
        ledger.redeem("amends accepted in conversation");
        ctx.system("the bar on the web search has been lifted.");
      }
      if (reply.moodTag && config.moods.has(reply.moodTag)) {
        const shift = ledger.setMood("ai", reply.moodTag, "shifted during conversation");
        if (shift.becameAngry) {
          ctx.system(red(`${config.world.voice} is furious. The web search is barred until you redeem yourself.`));
        }
      }
    } catch (error) {
      // One bad call kills one reply, never the session.
      ctx.system(red(`something failed: ${(error as Error).message ?? error}`));
      ledger.append("system", "error", { reason: String((error as Error).message ?? error) });
    }
  }

  ledger.append("system", "session_end", {});
  console.log(dim("\n  The ledger closes.\n"));
  process.exit(0);
}

main().catch((error) => {
  console.error(red(`fatal: ${(error as Error).message}`));
  process.exit(1);
});
