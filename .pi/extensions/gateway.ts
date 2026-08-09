/**
 * The house-lane door, pi-side: when WC_GATEWAY_URL is set, every anthropic
 * request leaves through the gateway instead of api.anthropic.com — same
 * models, same anthropic-messages dialect, the container's ANTHROPIC_API_KEY
 * is the per-friend VIRTUAL key the gateway budgets. Unset, pi is untouched
 * (the maintainer's local play never notices this file).
 *
 * Proven by the item-1 spike against the real API (deploy/gateway-spike/);
 * the gateway holding the other end is deploy/host/gateway/gateway.js.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const url = process.env.WC_GATEWAY_URL;
	if (url) pi.registerProvider("anthropic", { baseUrl: url });
}
