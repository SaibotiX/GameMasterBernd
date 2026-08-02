/**
 * /limits — show which Anthropic usage bucket your requests actually draw from.
 *
 * Anthropic answers every request with rate-limit headers, and their FAMILY is
 * the authoritative billing signal:
 *   anthropic-ratelimit-unified-5h-* / -7d-*  → Claude subscription PLAN LIMITS
 *   anthropic-ratelimit-requests-* / -input-tokens-* → metered API-style billing
 * pi does not read these anywhere, but it forwards every provider response's
 * headers to extensions (after_provider_response) — so this extension records
 * the latest ones and /limits prints the verdict. Extra-usage balance is only
 * visible at https://claude.ai/settings/usage.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let headers: Record<string, string> = {};
	let seenAt: string | undefined;

	pi.on("after_provider_response", async (event) => {
		const hits = Object.entries(event.headers).filter(([name]) =>
			name.toLowerCase().startsWith("anthropic-ratelimit"),
		);
		if (hits.length > 0) {
			headers = Object.fromEntries(hits.map(([name, value]) => [name.toLowerCase(), value]));
			seenAt = new Date().toLocaleTimeString();
		}
	});

	pi.registerCommand("limits", {
		description: "Show which Anthropic usage bucket the last request drew from",
		handler: async (_args, ctx) => {
			if (!seenAt) {
				ctx.ui.notify("No anthropic-ratelimit headers seen yet — send one message first.", "info");
				return;
			}
			const names = Object.keys(headers);
			const unified = names.filter((name) => name.includes("-unified-"));
			const metered = names.filter((name) => /-(requests|input-tokens|output-tokens|tokens)-/.test(name));

			const lines: string[] = [];
			if (unified.length > 0) {
				lines.push("Verdict: requests draw from your Claude PLAN LIMITS (subscription buckets).");
				for (const window of ["5h", "7d", "7d_sonnet"]) {
					const status = headers[`anthropic-ratelimit-unified-${window}-status`];
					const utilization = headers[`anthropic-ratelimit-unified-${window}-utilization`];
					const reset = headers[`anthropic-ratelimit-unified-${window}-reset`];
					if (!status && !utilization && !reset) continue;
					const pct = utilization ? `${(Number(utilization) * 100).toFixed(1)}%` : "?";
					const resetStr = reset ? new Date(Number(reset) * 1000).toLocaleString() : "?";
					lines.push(`  ${window}: ${pct} used · ${status ?? "?"} · resets ${resetStr}`);
				}
				const overage = headers["anthropic-ratelimit-unified-overage-status"];
				if (overage) {
					lines.push(`  overage lane (extra usage / usage credits): ${overage}`);
				}
			} else if (metered.length > 0) {
				lines.push("Verdict: requests hit METERED (API-style) limits — extra usage / API billing.");
			} else {
				lines.push("Rate-limit headers present but of unknown shape:");
			}
			lines.push(`(headers from the last response at ${seenAt}; details below)`);
			for (const name of names.sort()) lines.push(`  ${name}: ${headers[name]}`);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
