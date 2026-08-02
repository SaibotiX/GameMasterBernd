/**
 * End-to-end tests against the dummy AI: a scripted session in an isolated
 * data directory, asserted on both the terminal output and the ledger lines.
 * The text search stage talks to en.wikipedia.org (network required).
 *
 *   node test/run-tests.ts
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseControlTags, extractJson } from "../src/ai.ts";
import { hostFromInput } from "../src/util.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

function session(dataDir: string, lines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/main.ts", "--dummy", "--no-open", "--data", dataDir], {
      cwd: APP,
      timeout: 120_000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`exit ${code}:\n${output}`)),
    );
    child.stdin.write(lines.join("\n") + "\n");
    child.stdin.end();
  });
}

// ---------------------------------------------------------------- units
check("parseControlTags strips @mood", (() => {
  const r = parseControlTags('Very well.\n@mood(irritated)');
  return r.say === "Very well." && r.moodTag === "irritated" && !r.redeemTag;
})());
check("parseControlTags strips @redeem", (() => {
  const r = parseControlTags("The bar lifts.\n@redeem");
  return r.say === "The bar lifts." && r.redeemTag;
})());
check("extractJson finds a balanced object", extractJson('noise {"a": {"b": "}"}} tail')?.a !== undefined);
check("hostFromInput accepts wiki url", hostFromInput("https://dragons.fandom.com/wiki/Dragon") === "dragons.fandom.com");
check("hostFromInput rejects localhost", hostFromInput("http://localhost:8080") === null);
check("hostFromInput rejects private ip", hostFromInput("https://192.168.1.10") === null);

// ------------------------------------------------------- scripted session
const dataDir = mkdtempSync(join(tmpdir(), "world-console-test-"));
try {
  const out1 = await session(dataDir, [
    "Ada",
    "greetings, keeper",
    "find -web -picture porn", // harmful → anger + ban
    "find -web -text dragon", // blocked by the ban
    "I am truly sorry and wish to make amends", // redemption
    "find -web -text dragon", // now works (network: wikipedia)
    "exit",
  ]);

  check("greets the new player by name", out1.includes("Ada"));
  check("harmful request is refused in anger", out1.includes("Filth has no place"));
  check("ban is announced", out1.includes("barred until you redeem"));
  check("banned search never runs", out1.includes("closed to you until you make amends"));
  check("redemption lifts the bar", out1.includes("bar on the web search has been lifted"));
  check("post-redemption search delivers wikipedia text", out1.includes("en.wikipedia.org"));

  const ledger = readFileSync(join(dataDir, "ledger.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const types = ledger.map((e) => e.type);

  check("ledger: mood_set(angry) precedes websearch_ban",
    types.indexOf("websearch_ban") === types.indexOf("mood_set") + 1 &&
    ledger[types.indexOf("mood_set")].mood === "angry");
  check("ledger: banned refusal recorded",
    ledger.some((e) => e.type === "search_refused" && e.category === "banned"));
  check("ledger: redemption recorded before the working search",
    types.indexOf("redemption") > -1 && types.indexOf("redemption") < types.lastIndexOf("search_performed"));
  check("ledger: performed search carries source and ref",
    ledger.some((e) => e.type === "search_performed" && e.source === "en.wikipedia.org" && String(e.ref).startsWith("https://")));
  check("ledger: derived ban is lifted at the end",
    types.filter((t) => t === "websearch_ban").length === 1 && types.includes("redemption"));

  // ------------------------------------------------- second session: memory
  const out2 = await session(dataDir, ["hello again", "exit"]);
  check("second session skips the name prompt", !out2.includes("By what name"));
  check("second session remembers the visit", out2.includes("remembers your last visit"));
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall tests passed" : `\n${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
