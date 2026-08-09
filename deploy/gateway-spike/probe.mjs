#!/usr/bin/env node
// The candidate-agnostic probe — five receipts, one gateway URL, whichever
// candidate stands behind it (own-proxy or LiteLLM). Run by run.sh; each leg
// prints PASS/FAIL with the numbers that back it, and the block at the end is
// the receipt that lands in the research log with the shape decision.
//
//   node probe.mjs <gatewayUrl> <goodKey> <brokeKey>
//
// Legs (map item 1's proof list, deploy/README.md §next round):
//   1  a plain turn flows (non-streaming 200, usage in the body)
//   2  streaming intact (SSE events arrive incrementally, text assembles)
//   3  cache_control passes through — big stable prefix twice, the second
//      receipt shows cache_read_input_tokens > 0 (Haiku needs ≥4096 tokens
//      of prefix, so the probe sends ~5k)
//   4  an exhausted budget refuses CLEANLY (drain the broke key, next call
//      is a 4xx anthropic-shaped error, never a hang or a 5xx)
//   5  (run.sh, not here) pi itself speaks through the gateway unmodified
//
// Total upstream cost per full run: roughly one cent (one ~5k cache write +
// reads + a handful of tiny turns, Haiku prices).

const [gateway, goodKey, brokeKey] = process.argv.slice(2);
if (!gateway || !goodKey || !brokeKey) {
	console.error("usage: node probe.mjs <gatewayUrl> <goodKey> <brokeKey>");
	process.exit(2);
}

const MODEL = "claude-haiku-4-5";
const results = [];
const leg = (name, pass, detail) => {
	results.push({ name, pass, detail });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

// A deterministic ~5k-token prefix: stable bytes, no timestamps, so the two
// calls share it exactly (any byte drift would silently kill the cache hit).
const PREFIX = Array.from(
	{ length: 420 },
	(_, i) => `Chronicle shelf ${i}: the keeper files another uneventful evening among the stacks.`,
).join(" ");

async function turn({ key, stream = false, system = null, prompt }) {
	const res = await fetch(`${gateway}/v1/messages`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"anthropic-version": "2023-06-01",
			"x-api-key": key,
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 64,
			stream,
			...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
			messages: [{ role: "user", content: prompt }],
		}),
	});
	if (!stream) return { status: res.status, body: await res.json().catch(() => null) };

	// Assemble the SSE receipt: count events, collect text, merge usage.
	const usage = {};
	let events = 0;
	let text = "";
	let tail = "";
	const decoder = new TextDecoder();
	for await (const chunk of res.body) {
		tail += decoder.decode(chunk, { stream: true });
		const lines = tail.split("\n");
		tail = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.startsWith("data:")) continue;
			events++;
			try {
				const ev = JSON.parse(line.slice(5));
				if (ev.type === "message_start" && ev.message?.usage) Object.assign(usage, ev.message.usage);
				if (ev.type === "message_delta" && ev.usage) Object.assign(usage, ev.usage);
				if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
			} catch {}
		}
	}
	return { status: res.status, events, text, usage };
}

// Leg 1 — a plain turn flows.
{
	const r = await turn({ key: goodKey, prompt: "Reply with exactly: the door opens" });
	leg(
		"turn flows (non-streaming)",
		r.status === 200 && r.body?.usage?.output_tokens > 0,
		`status ${r.status}, usage ${JSON.stringify(r.body?.usage ?? null)}`,
	);
}

// Leg 2 — streaming intact.
{
	const r = await turn({ key: goodKey, stream: true, prompt: "Count from one to five in words." });
	leg(
		"streaming intact (SSE)",
		r.status === 200 && r.events >= 5 && r.text.length > 0,
		`status ${r.status}, ${r.events} SSE data events, ${r.text.length} chars of text`,
	);
}

// Leg 3 — cache_control passes through, hit on the receipt.
{
	const first = await turn({ key: goodKey, stream: true, system: PREFIX, prompt: "Say: shelved." });
	const second = await turn({ key: goodKey, stream: true, system: PREFIX, prompt: "Say: reshelved." });
	const wrote = first.usage?.cache_creation_input_tokens ?? 0;
	const read = (second.usage?.cache_read_input_tokens ?? 0) || (first.usage?.cache_read_input_tokens ?? 0);
	leg(
		"cache_control passthrough",
		read > 0,
		`first: wrote ${wrote} / read ${first.usage?.cache_read_input_tokens ?? 0} · second: read ${second.usage?.cache_read_input_tokens ?? 0}`,
	);
}

// Leg 4 — a dry grant refuses cleanly: drain the broke key, then knock again.
{
	const drain = await turn({ key: brokeKey, prompt: "Say: last coin" });
	const after = await turn({ key: brokeKey, prompt: "Say: one more?" });
	const clean = after.status >= 400 && after.status < 500 && after.body?.type === "error";
	leg(
		"exhausted budget refuses cleanly",
		drain.status === 200 && clean,
		`drain ${drain.status}, then ${after.status}: ${JSON.stringify(after.body?.error?.message ?? after.body)}`,
	);
}

console.log("\n--- probe receipt ---");
for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}: ${r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
