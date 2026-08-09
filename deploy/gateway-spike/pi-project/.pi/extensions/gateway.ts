/**
 * The house-lane door, pi-side: when WC_GATEWAY_URL is set, every anthropic
 * request leaves through the gateway instead of api.anthropic.com — same
 * models, same anthropic-messages dialect, the container's ANTHROPIC_API_KEY
 * is the per-friend VIRTUAL key the gateway budgets. Unset, pi is untouched
 * (the maintainer's local play never notices this file).
 *
 * This is the real shape, not just spike scaffolding: item 2 of the round map
 * lands this same override in the game's own .pi/extensions/.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const url = process.env.WC_GATEWAY_URL;
	if (url) pi.registerProvider("anthropic", { baseUrl: url });
}
