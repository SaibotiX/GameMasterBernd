/** Small shared helpers: ANSI colors, frontmatter parsing, stdin line queue, URL hygiene. */
import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";

// ---------------------------------------------------------------- ANSI colors
const on = process.stdout.isTTY ?? false;
const wrap = (code: number, s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
export const dim = (s: string) => wrap(2, s);
export const bold = (s: string) => wrap(1, s);
export const cyan = (s: string) => wrap(36, s);
export const yellow = (s: string) => wrap(33, s);
export const red = (s: string) => wrap(31, s);
export const green = (s: string) => wrap(32, s);
export const magenta = (s: string) => wrap(35, s);

// ------------------------------------------------------------- frontmatter
/** Parses `---\nkey: value\n---\nbody` documents (the config file format). */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!raw.startsWith("---")) return { meta, body: raw.trim() };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta, body: raw.trim() };
  for (const line of raw.slice(3, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    if (key) meta[key] = value;
  }
  return { meta, body: raw.slice(end + 4).trim() };
}

// ------------------------------------------------------------- line reader
/**
 * Queued readline wrapper so piped stdin behaves like an interactive session:
 * every `ask()` resolves with exactly one line, or null once stdin ends.
 * On a real terminal, readline owns the prompt so typed characters echo and
 * line editing / history work; piped input is echoed manually for readable
 * transcripts.
 */
export class LineReader {
  private lines: string[] = [];
  private waiter: ((line: string | null) => void) | null = null;
  private closed = false;
  private tty = process.stdin.isTTY ?? false;
  private rl: ReturnType<typeof createInterface>;

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: this.tty,
    });
    this.rl.on("line", (line) => {
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(line);
      } else {
        this.lines.push(line);
      }
    });
    this.rl.on("close", () => {
      this.closed = true;
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(null);
      }
    });
  }

  ask(prompt: string): Promise<string | null> {
    if (this.lines.length > 0) {
      const line = this.lines.shift() as string;
      process.stdout.write(prompt + (this.tty ? "\n" : line + "\n")); // typed-ahead / piped echo
      return Promise.resolve(line);
    }
    if (this.closed) {
      process.stdout.write(prompt);
      return Promise.resolve(null);
    }
    if (this.tty) {
      this.rl.setPrompt(prompt);
      this.rl.prompt();
    } else {
      process.stdout.write(prompt);
    }
    return new Promise((resolve) => {
      this.waiter = (line) => {
        if (line !== null && !this.tty) process.stdout.write(line + "\n");
        resolve(line);
      };
    });
  }
}

// ------------------------------------------------------------- URL hygiene
/** Only public https hosts are acceptable web sources. */
export function safeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".local")) return false;
  if (/^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // bare IPs: not a named public site
  return h.includes(".");
}

/** Normalizes user input ("https://en.wikipedia.org/wiki/x", "en.wikipedia.org") to a host, or null. */
export function hostFromInput(input: string): string | null {
  let candidate = input.trim();
  if (!/^[a-z]+:\/\//i.test(candidate)) candidate = "https://" + candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    return safeHost(url.hostname) ? url.hostname : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- misc
export function slug(text: string, max = 40): string {
  return (
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "item"
  );
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}
