/**
 * AI-tester extension: the REAL GameMaster Bernd engine plus a headless parity
 * layer. The game is imported UNTOUCHED from the repo's extension/ — nothing
 * about rules, prompts or tools changes, so findings stay valid for human play.
 *
 * What this adds is ONE command, /ai-state: a text rendering of exactly what
 * the TUI already shows a human on screen — the four-slot board's standing
 * choice, the trial panel, the clocks, the wound meter. Batch 1 proved the
 * need: a peril trial was declared, the keeper never voiced it, and the
 * headless tester had NO way to know a die stood — 19 turns of stall that a
 * TUI human would have seen as a red panel. This is UI parity, not X-ray
 * vision: public state only, nothing veiled (no sealed fates, no twist
 * beats, no fuse timers).
 *
 * The driver (aitester/tools/ai-playtest.mjs) calls /ai-state after every
 * turn (a command — zero LLM cost) and appends the board to what the tester
 * sees.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import base from "../../extension/index.ts";
import { derive } from "../../extension/ledger.ts";

export default function (pi: ExtensionAPI) {
	base(pi);

	pi.registerCommand("ai-state", {
		description: "AI tester: the standing board as text — TUI parity for headless play (public state only)",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getBranch();
			const st = derive(entries as Parameters<typeof derive>[0], "neutral");

			const lines: string[] = ["⌘ the standing board"];
			const whereabouts = st.place ? `at: ${st.place.title}` : "at: (nowhere yet — the tale has not placed you)";
			lines.push(`  ${whereabouts} · wounds ${st.wounds}/3${st.dead ? " · ☠ the tale has ended (/new)" : ""}`);

			const clocks = Object.values(st.undertakings).filter((u) => u.size > 0);
			if (clocks.length > 0) {
				lines.push(`  work: ${clocks.map((u) => `${u.slug} ${u.filled}/${u.size}`).join(" · ")}`);
			} else {
				lines.push("  work: none chronicled yet");
			}

			if (st.pendingRoll) {
				const roll = st.pendingRoll;
				const kind = roll.kind ?? "finale";
				const edge = roll.edge ? ` · ${roll.edge}` : "";
				lines.push(
					`  ⚑ A TRIAL STANDS (${kind}${roll.slug ? ` · ${roll.slug}` : " · the world's own peril"}): ` +
						`"${roll.trial}" — ${roll.tier}, DC ${roll.dc}${edge}. No work advances until the die is cast: /roll`,
				);
			}
			if (st.pendingChoice) {
				const choice = st.pendingChoice;
				const binds = choice.kind === "twist";
				lines.push(
					`  ⚑ A CHOICE STANDS (${binds ? "sealed paths — no work advances until you pick" : "open offer — pick, or simply speak on and it lapses"}): ${choice.text}`,
				);
				for (const option of choice.options) {
					const unlocked = option.unlockedBy ? ` [unlocked by: ${option.unlockedBy}]` : "";
					lines.push(`     ${option.id}. ${option.label} — ${option.risk}: ${option.promise}${unlocked}`);
				}
				lines.push(`     pick with: /pick <n> [your own words]`);
			}
			if (!st.pendingRoll && !st.pendingChoice) {
				lines.push("  no gate stands — work may advance");
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
