/**
 * The command registry. A line whose first word matches a command name runs
 * that command; anything else is chat with the AI. Adding a command means
 * adding one entry to COMMANDS — parsing, help and dispatch come for free.
 */
import type { GameContext } from "./context.ts";
import type { SearchKind } from "./types.ts";
import { runFind } from "./websearch.ts";
import { bold, dim, hostFromInput, red, yellow } from "./util.ts";

export interface Command {
  name: string;
  usage: string;
  summary: string;
  run(ctx: GameContext, args: string[]): Promise<void>;
}

export const COMMANDS: Command[] = [
  {
    name: "find",
    usage: "find -web (-text | -picture | -video) <query>",
    summary: "ask the AI to search the web — a short explanation, a picture, or a ~10s video clip",
    async run(ctx, args) {
      const flags = new Set(args.filter((a) => a.startsWith("-")).map((a) => a.toLowerCase()));
      const query = args.filter((a) => !a.startsWith("-")).join(" ").trim();
      const kinds = (["text", "picture", "video"] as SearchKind[]).filter((k) => flags.has(`-${k}`));
      if (!flags.has("-web") || kinds.length !== 1 || !query) {
        ctx.system(red(`usage: ${this.usage}`));
        return;
      }
      await runFind(ctx, kinds[0], query);
    },
  },
  {
    name: "site",
    usage: "site -list | site -add <url> [-picture]",
    summary: "list the web sources, or add another MediaWiki-style site (wikipedia, fandom, …)",
    async run(ctx, args) {
      if (args.includes("-list") || args.length === 0) {
        ctx.system(`text sources:    ${ctx.config.sites.text.map((s) => s.host).join(", ") || "(none)"}`);
        ctx.system(`picture sources: ${ctx.config.sites.picture.map((s) => s.host).join(", ") || "(none)"}`);
        return;
      }
      const addIndex = args.indexOf("-add");
      const url = args.find((a, i) => i > addIndex && !a.startsWith("-"));
      if (addIndex === -1 || !url) {
        ctx.system(red(`usage: ${this.usage}`));
        return;
      }
      const host = hostFromInput(url);
      if (!host) {
        ctx.system(red(`"${url}" is not a public https site.`));
        return;
      }
      const list = args.includes("-picture") ? "picture" : "text";
      if (ctx.config.sites[list].some((s) => s.host === host)) {
        ctx.system(yellow(`${host} is already a ${list} source.`));
        return;
      }
      ctx.config.sites[list].push({ host });
      ctx.config.saveSites();
      ctx.ledger.append("player", "site_added", { list, host });
      ctx.system(`${host} added to the ${list} sources. It must speak the MediaWiki API to yield results.`);
    },
  },
  {
    name: "ledger",
    usage: "ledger [n]",
    summary: "show the last n ledger lines — every consequence, traceable (default 12)",
    async run(ctx, args) {
      const n = Math.max(1, Math.min(200, Number(args[0]) || 12));
      const events = ctx.ledger.tail(n);
      ctx.system(dim(`${ctx.ledger.size} lines total, showing ${events.length}:`));
      for (const e of events) {
        const { t, actor, type, ...rest } = e;
        const details = Object.entries(rest)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(" ");
        console.log(`  ${dim(t)} ${bold(String(type).padEnd(16))} ${String(actor).padEnd(6)} ${dim(details.length > 110 ? details.slice(0, 110) + "…" : details)}`);
      }
    },
  },
  {
    name: "help",
    usage: "help",
    summary: "this overview",
    async run(ctx) {
      ctx.system("anything you type that is not a command is spoken to the AI game master.");
      for (const command of COMMANDS) {
        console.log(`  ${bold(command.usage.padEnd(46))} ${dim(command.summary)}`);
      }
    },
  },
  {
    name: "exit",
    usage: "exit",
    summary: "leave the world",
    async run(ctx) {
      ctx.wantExit = true;
    },
  },
];

/** True when the line was a command (handled here); false means: chat. */
export async function dispatch(ctx: GameContext, line: string): Promise<boolean> {
  const [head, ...args] = line.trim().split(/\s+/);
  // Tolerate the slash habit: /help, /exit and friends work too.
  const name = head?.toLowerCase().replace(/^\//, "");
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) return false;
  await command.run(ctx, args);
  return true;
}
