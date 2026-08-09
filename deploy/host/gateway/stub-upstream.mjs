#!/usr/bin/env node
// A pretend Anthropic for the KEYLESS checks (localcheck runs without any
// real credential by design): answers /v1/messages in both shapes with
// plausible usage, and plays the caching game honestly enough to prove
// passthrough — the first call carrying cache_control on a given system
// prefix "writes" it, every later call with the same prefix "reads" it.
// Nothing here ever sees a real key: the gateway swaps in whatever
// ANTHROPIC_ORG_KEY it was given, and the stub only checks one arrived.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 9990);
const seen = new Set();

const server = http.createServer(async (req, res) => {
	if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
		res.writeHead(404).end();
		return;
	}
	if (!req.headers["x-api-key"]) {
		res.writeHead(401, { "content-type": "application/json" });
		res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "no key reached the upstream" } }));
		return;
	}
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

	const sys = (body.system ?? []).map((b) => b.text ?? "").join("\n");
	const marked = (body.system ?? []).some((b) => b.cache_control);
	const prefixTokens = Math.round(sys.length / 4);
	const hash = crypto.createHash("sha256").update(sys).digest("hex");
	const hit = marked && seen.has(hash);
	if (marked) seen.add(hash);

	const usage = {
		input_tokens: 20,
		cache_creation_input_tokens: marked && !hit ? prefixTokens : 0,
		cache_read_input_tokens: hit ? prefixTokens : 0,
		output_tokens: 1,
	};
	const text = "the stub answers";

	if (!body.stream) {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				id: "msg_stub", type: "message", role: "assistant", model: body.model,
				content: [{ type: "text", text }],
				stop_reason: "end_turn",
				usage: { ...usage, output_tokens: 12 },
			}),
		);
		return;
	}
	res.writeHead(200, { "content-type": "text/event-stream" });
	const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
	ev("message_start", { message: { id: "msg_stub", type: "message", role: "assistant", model: body.model, content: [], usage } });
	ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
	for (const word of text.split(" ")) ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: word + " " } });
	ev("content_block_stop", { index: 0 });
	ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } });
	ev("message_stop", {});
	res.end();
});

server.listen(PORT, "0.0.0.0", () => console.log(`stub-upstream: pretending to be Anthropic on :${PORT}`));
