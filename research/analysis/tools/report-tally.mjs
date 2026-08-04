#!/usr/bin/env node
// report-tally — the recurrence view across ALL shipped audit reports.
//
// Reads every report in research/analysis/reports/ and aitester/reports/,
// parses each summary table, and aggregates per failure class:
//   in how many reports it appeared, total incidents, sessions affected,
//   worst severity, latest status, first/last seen.
// Output is the priority list the audit workflow's fix loop starts from:
// sorted worst severity first, then reports-seen (chronic beats one-off),
// then total incidents. Reports stay immutable — this tool only reads.
//
// Usage: node research/analysis/tools/report-tally.mjs [--json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REPORT_DIRS = ["research/analysis/reports", "aitester/reports"];

const reports = [];
for (const dir of REPORT_DIRS) {
	const abs = path.join(root, dir);
	if (!fs.existsSync(abs)) continue;
	for (const f of fs.readdirSync(abs).sort()) {
		if (!f.endsWith(".md")) continue;
		reports.push({ file: path.join(dir, f), date: f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "????-??-??" });
	}
}

const SEV_RANK = { S1: 1, S2: 2, S3: 3, S4: 4 };
const classes = new Map(); // id -> aggregate

for (const rep of reports) {
	const text = fs.readFileSync(path.join(root, rep.file), "utf8");
	// Summary rows: | WC-15 | Named but unpaged | S2 | 2/2 | 9 | REGRESSION (…) | … |
	for (const line of text.split("\n")) {
		const cells = line.split("|").map((c) => c.trim());
		if (cells.length < 7) continue;
		const id = cells[1];
		if (!/^(WC-\d+|NEW-\d+)$/.test(id)) continue;
		const sev = cells[3].match(/S[1-4]/)?.[0];
		if (!sev) continue; // header/legend lines
		const sessions = cells[4].match(/(\d+)\s*\/\s*(\d+)/);
		const incidents = Number.parseInt(cells[5].match(/\d+/)?.[0] ?? "", 10);
		// Only true summary rows carry counts — this skips the report's
		// "New classes discovered" table, which repeats the NEW-n ids.
		if (!sessions && !Number.isFinite(incidents)) continue;
		const status = cells[6].split(/[ (]/)[0] || "?";
		// NEW-n ids are report-local (they get promoted to WC ids); never
		// merge them across reports.
		const key = id.startsWith("NEW-") ? `${id} (${rep.date})` : id;
		const agg = classes.get(key) ?? {
			id: key, name: cells[2], reportsSeen: 0, incidents: 0,
			sessionsAffected: 0, sessionsTotal: 0, worstSev: sev,
			firstSeen: rep.date, lastSeen: rep.date, lastStatus: status, trail: [],
		};
		agg.name = cells[2]; // latest report's wording wins
		agg.reportsSeen += 1;
		agg.incidents += Number.isFinite(incidents) ? incidents : 0;
		if (sessions) { agg.sessionsAffected += +sessions[1]; agg.sessionsTotal += +sessions[2]; }
		if (SEV_RANK[sev] < SEV_RANK[agg.worstSev]) agg.worstSev = sev;
		agg.lastSeen = rep.date;
		agg.lastStatus = status;
		agg.trail.push(`${rep.date}:${status}${Number.isFinite(incidents) ? "×" + incidents : ""}`);
		classes.set(key, agg);
	}
}

const rows = [...classes.values()].sort(
	(a, b) => SEV_RANK[a.worstSev] - SEV_RANK[b.worstSev] || b.reportsSeen - a.reportsSeen || b.incidents - a.incidents,
);

if (process.argv.includes("--json")) {
	console.log(JSON.stringify({ reports: reports.length, classes: rows }, null, 2));
	process.exit(0);
}

console.log(`== report tally — ${reports.length} report(s): ${reports.map((r) => r.date).join(", ") || "none"}\n`);
if (!rows.length) { console.log("(no findings parsed — no reports yet, or summary tables unparseable)"); process.exit(0); }
const pad = (s, n) => String(s).padEnd(n);
const idw = Math.max(7, ...rows.map((r) => r.id.length)) + 2;
console.log(pad("class", idw) + pad("sev", 5) + pad("reports", 9) + pad("incidents", 11) + pad("sessions", 10) + pad("last", 12) + "name · trail");
for (const r of rows) {
	console.log(
		pad(r.id, idw) + pad(r.worstSev, 5) + pad(r.reportsSeen, 9) + pad(r.incidents, 11) +
		pad(`${r.sessionsAffected}/${r.sessionsTotal}`, 10) + pad(`${r.lastSeen}`, 12) +
		`${r.name} · ${r.trail.join(" → ")} [${r.lastStatus}]`,
	);
}
console.log("\nChronic classes (seen in 2+ reports) outrank same-severity one-offs; S1 always tops. " +
	"A class marked fixed that reappears reopens harder (audit-workflow §5).");
