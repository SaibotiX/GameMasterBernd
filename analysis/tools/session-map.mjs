#!/usr/bin/env node
/**
 * session-map — the mechanical first pass of every session audit.
 *
 *   node analysis/tools/session-map.mjs <session.jsonl> [more.jsonl…]
 *
 * Prints, per session: a compact one-line-per-entry map (uN numbering — the
 * same numbers /ledger, ledger.md and the GM table cite), a tool-error
 * digest, a game-event census, and branch facts (how many entries the
 * current leaf's branch actually contains vs. entries orphaned by /tree).
 * Dependency-free; read-only; never prints more than SNIP chars per line, so
 * the output is safe to paste into an analysis context whole.
 */
import { readFileSync } from "node:fs";

const SNIP = 110;
const clip = (text) => {
	const flat = String(text ?? "").replace(/\s+/g, " ").trim();
	return flat.length > SNIP ? `${flat.slice(0, SNIP)}…` : flat;
};

for (const file of process.argv.slice(2)) {
	let lines;
	try {
		lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
	} catch (error) {
		console.log(`\n== ${file}\n   UNREADABLE: ${error.message}`);
		continue;
	}
	console.log(`\n== ${file} (${lines.length} entries)`);

	// Branch reconstruction: pi sessions are append-only; /tree moves the
	// leaf by writing the next entry with an OLD parentId. The live branch is
	// the chain from the last entry back to the root.
	const byId = new Map();
	lines.forEach((entry, index) => byId.set(entry.id, { entry, u: index + 1 }));
	const onBranch = new Set();
	let walker = lines.at(-1);
	while (walker) {
		onBranch.add(walker.id);
		walker = walker.parentId ? byId.get(walker.parentId)?.entry : undefined;
	}

	const toolErrors = [];
	const eventCounts = new Map();
	const errorResults = [];

	lines.forEach((entry, index) => {
		const u = index + 1;
		const off = onBranch.has(entry.id) || entry.type === "session" ? " " : "×"; // × = orphaned by /tree
		if (entry.type === "custom") {
			const ev = entry.data?.ev;
			if (entry.customType === "world-console.ledger" && ev) {
				eventCounts.set(ev, (eventCounts.get(ev) ?? 0) + 1);
				const detail =
					ev === "quest_shape"
						? `${entry.data.slug} ${entry.data.clock}/${entry.data.twist}/${entry.data.check} mids=${JSON.stringify(entry.data.mids ?? [])}`
						: ev === "quest_tick" || ev === "outcome"
							? `${entry.data.slug ?? ""} ${entry.data.band ?? ""} ${entry.data.add ?? ""} → ${entry.data.filled ?? ""}`
							: ev === "check" || ev === "roll" || ev === "pick" || ev === "complication"
								? clip(JSON.stringify(entry.data))
								: clip(entry.data.text ?? entry.data.reason ?? entry.data.title ?? entry.data.kind ?? "");
				console.log(`${off}u${u} · ${ev} ${clip(detail)}`);
			} else {
				console.log(`${off}u${u} · custom:${entry.customType ?? "?"}`);
			}
			return;
		}
		if (entry.type === "message") {
			const message = entry.message ?? {};
			const role = message.role ?? "?";
			const text =
				typeof message.content === "string"
					? message.content
					: Array.isArray(message.content)
						? message.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join(" ")
						: "";
			const tools = Array.isArray(message.content)
				? message.content.filter((block) => block.type === "toolCall").map((block) => block.name).join(",")
				: "";
			const err = message.errorMessage ? `  !API-ERROR: ${clip(message.errorMessage)}` : "";
			if (err) toolErrors.push(`u${u} assistant ${clip(message.errorMessage)}`);
			// pi stores tool results as messages with role "toolResult" — scan
			// them for the signatures that matter (crashes, refusals, holds).
			if (role === "toolResult") {
				const isCrash = /is not a function|^TypeError|^ReferenceError|undefined is not/i.test(text);
				const isRefusal = /refus|stands nowhere|not done —|No work advances|must fall first|stands unresolved|already stand open|takes no fifth|Empty |No page exists|is not here|is shelved|already await/i.test(text);
				if (isCrash) errorResults.push(`u${u} CRASH: ${clip(text)}`);
				else if (isRefusal) errorResults.push(`u${u} refusal: ${clip(text)}`);
				console.log(`${off}u${u} → ${isCrash ? "⚠⚠ " : isRefusal ? "⚠ " : ""}${clip(text)}`);
				return;
			}
			console.log(`${off}u${u} ${role}${tools ? ` [${tools}]` : ""} ${clip(text)}${err}`);
			return;
		}
		console.log(`${off}u${u} · ${entry.type}`);
	});

	console.log(`\n-- game events: ${[...eventCounts.entries()].map(([ev, n]) => `${ev}×${n}`).join(" · ") || "(none)"}`);
	console.log(`-- branch: ${onBranch.size}/${lines.length} entries live on the leaf's branch (× marks orphaned side-branches)`);
	if (toolErrors.length) console.log(`-- API errors:\n   ${toolErrors.join("\n   ")}`);
	if (errorResults.length) console.log(`-- refusals & tool errors (⚠ above):\n   ${errorResults.join("\n   ")}`);
}
