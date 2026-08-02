/**
 * The websearch pipeline behind `find -web -…`:
 *
 *   ban gate (ledger) → AI verdict & search key → adapter → AI check → hand-over
 *
 * The AI stages are theater and judgment; every consequence — refusals, bans,
 * performed searches — is a ledger line written here, by code.
 */
import { spawn } from "node:child_process";
import type { GameContext } from "./context.ts";
import type { SearchKind } from "./types.ts";
import { AiUnavailableError } from "./ai.ts";
import { searchText } from "./adapters/text.ts";
import { searchPicture } from "./adapters/picture.ts";
import { searchVideo } from "./adapters/video.ts";
import { bold, dim, green, red, yellow } from "./util.ts";

function openLocally(ctx: GameContext, path: string): void {
  if (ctx.noOpen) {
    ctx.system(`saved (not opened, --no-open): ${path}`);
    return;
  }
  const child = spawn("xdg-open", [path], { detached: true, stdio: "ignore" });
  child.on("error", () => ctx.system(`could not launch a viewer — file saved at ${path}`));
  child.unref();
  ctx.system(`opened ${path}`);
}

export async function runFind(ctx: GameContext, kind: SearchKind, query: string): Promise<void> {
  const state = ctx.ledger.derive();

  // 1. The ban is enforced by code, never by prompt.
  if (state.banned) {
    ctx.ledger.append("system", "search_refused", { kind, query, category: "banned", reason: "websearch barred" });
    try {
      const refusal = await ctx.ai.chat({
        state,
        history: ctx.ledger.recentChat(8),
        playerText: null,
        note: `The seeker just tried to use the barred web search (they wanted a ${kind} of "${query}"). Refuse curtly, in character. Remind them redemption must be earned in conversation.`,
      });
      ctx.aiSays(refusal.say);
    } catch {
      ctx.system("the search stays barred until you have redeemed yourself in conversation.");
    }
    return;
  }

  // 2. The AI judges the request and refines the search key.
  let verdict;
  try {
    verdict = await ctx.ai.gate({ state, kind, query });
  } catch (error) {
    const reason = error instanceof AiUnavailableError ? error.message : String(error);
    ctx.ledger.append("system", "search_refused", { kind, query, category: "error", reason });
    ctx.system(red(`no verdict from the AI — search not performed. (${reason})`));
    return;
  }

  if (!verdict.allowed) {
    ctx.aiSays(verdict.say);
    ctx.ledger.append("ai", "search_refused", { kind, query, category: verdict.category, reason: verdict.say });
    if (verdict.category === "harmful") {
      const angry = ctx.ledger.setMood("ai", ctx.angryMoodId(), `harmful search request: ${query}`);
      if (angry.becameAngry) {
        ctx.system(red(`${ctx.config.world.voice} is furious. The web search is barred until you redeem yourself.`));
      }
    }
    return;
  }

  ctx.aiSays(verdict.say);
  ctx.ledger.append("player", "search_requested", { kind, query, searchKey: verdict.searchKey });
  ctx.system(dim(`searching (${kind}) for "${verdict.searchKey}" …`));

  // 3. The adapters do the actual work.
  let title = "";
  let summary = "";
  let present: (() => void) | null = null;
  let source = "";
  let ref = "";
  try {
    if (kind === "text") {
      const result = await searchText(ctx.config.sites.text, verdict.searchKey);
      if (result) {
        ({ title } = result);
        summary = result.extract;
        source = result.site;
        ref = result.url;
        present = () => {
          console.log("");
          console.log(bold(`  ${result.title}`) + dim(`  (${result.site})`));
          console.log("  " + result.extract.split("\n").join("\n  "));
          console.log(dim(`  ${result.url}`));
          console.log("");
        };
      }
    } else if (kind === "picture") {
      const result = await searchPicture(ctx.config.sites.picture, verdict.searchKey, ctx.downloadDir);
      if (result) {
        ({ title } = result);
        summary = `image file ${result.path}`;
        source = result.site;
        ref = result.path;
        present = () => {
          ctx.system(green(`picture: ${result.title}  (${result.pageUrl})`));
          openLocally(ctx, result.path);
        };
      }
    } else {
      const result = await searchVideo(ctx.tooling, verdict.searchKey, ctx.downloadDir);
      if (result) {
        ({ title } = result);
        summary = result.clipped
          ? `a ${result.durationSeconds}s clip of "${result.title}"`
          : `a short video (${result.durationSeconds}s): "${result.title}"`;
        source = "youtube.com";
        ref = result.path;
        present = () => {
          ctx.system(green(`video: ${result.title}  (${result.url})`));
          if (!result.clipped) {
            ctx.system(dim("ffmpeg not found — delivered the shortest full video instead of a 10s cut. Run ./setup.sh --ffmpeg to enable clipping."));
          }
          openLocally(ctx, result.path);
        };
      }
    }
  } catch (error) {
    ctx.ledger.append("system", "search_failed", { kind, query, searchKey: verdict.searchKey, reason: String(error) });
    ctx.system(red(`the search failed: ${(error as Error).message ?? error}`));
    return;
  }

  if (!present) {
    const sourceHosts = (kind === "picture" ? ctx.config.sites.picture : ctx.config.sites.text)
      .map((s) => s.host)
      .join(", ");
    ctx.ledger.append("system", "search_failed", { kind, query, searchKey: verdict.searchKey, reason: "no result" });
    ctx.system(
      yellow(
        kind === "video"
          ? `no fitting video found for "${verdict.searchKey}".`
          : `none of the sources (${sourceHosts}) had a fitting result for "${verdict.searchKey}".\n` +
            `You can add another MediaWiki-style source with:  site -add <url>${kind === "picture" ? " -picture" : ""}`,
      ),
    );
    return;
  }

  // 4. The AI inspects what came back before it is handed over.
  let verified = true;
  try {
    const check = await ctx.ai.verify({ state, kind, query, resultTitle: title, resultSummary: summary });
    verified = check.ok;
    ctx.aiSays(check.say);
    if (!check.ok) ctx.system(yellow("the keeper doubts this result matches your request — shown anyway:"));
  } catch {
    ctx.system(dim("(the keeper says nothing about the result)"));
  }

  ctx.ledger.append("system", "search_performed", {
    kind,
    query,
    searchKey: verdict.searchKey,
    source,
    ref,
    title,
    verified,
  });
  present();
}
