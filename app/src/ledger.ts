/**
 * The Ledger: one append-only JSONL file. The game only ever adds lines,
 * never edits or deletes them. Every state the program acts on (mood, the
 * websearch ban, the player's name) is derived by replaying the lines.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Actor, DerivedState, LedgerEvent } from "./types.ts";
import { dim, ensureDir, red } from "./util.ts";

export class Ledger {
  private events: LedgerEvent[] = [];
  private warnedUnwritable = false;
  private file: string;
  private defaultMood: string;
  private angryMood: string;

  constructor(file: string, defaultMood: string, angryMood: string) {
    this.file = file;
    this.defaultMood = defaultMood;
    this.angryMood = angryMood;
    ensureDir(dirname(file));
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.events.push(JSON.parse(line) as LedgerEvent);
        } catch {
          // A corrupt line must not kill the session; it stays in the file untouched.
          console.error(dim("[ledger] skipped one unreadable line"));
        }
      }
    }
  }

  /** Appends one line. The in-memory copy is authoritative for this session. */
  append(actor: Actor, type: string, fields: Record<string, unknown> = {}): LedgerEvent {
    const event: LedgerEvent = { t: new Date().toISOString(), actor, type, ...fields };
    this.events.push(event);
    try {
      appendFileSync(this.file, JSON.stringify(event) + "\n");
    } catch (error) {
      if (!this.warnedUnwritable) {
        this.warnedUnwritable = true;
        console.error(red(`[ledger] cannot write ${this.file}: ${(error as Error).message}`));
      }
    }
    return event;
  }

  /** Replays all lines into the current state. Nothing is stored, everything is derived. */
  derive(): DerivedState {
    let playerName: string | null = null;
    let mood = this.defaultMood;
    let banned = false;
    let chats = 0;
    let searches = 0;
    let refusals = 0;
    const sessionStarts: string[] = [];

    for (const e of this.events) {
      switch (e.type) {
        case "player_named":
          playerName = String(e.name ?? "") || playerName;
          break;
        case "mood_set":
          mood = String(e.mood ?? mood);
          break;
        case "websearch_ban":
          banned = true;
          break;
        case "redemption":
          banned = false;
          break;
        case "chat":
          if (e.who === "player") chats++;
          break;
        case "search_performed":
          searches++;
          break;
        case "search_refused":
          refusals++;
          break;
        case "session_start":
          sessionStarts.push(e.t);
          break;
      }
    }
    // The last entry is the session running right now; the one before it is "last time".
    const lastSessionStart = sessionStarts.length > 1 ? sessionStarts[sessionStarts.length - 2] : null;
    return { playerName, mood, banned, chats, searches, refusals, lastSessionStart };
  }

  /** Recent chat lines, oldest first, for the AI's conversational memory. */
  recentChat(limit: number): { who: "player" | "ai"; text: string }[] {
    const chat: { who: "player" | "ai"; text: string }[] = [];
    for (const e of this.events) {
      if (e.type === "chat" && (e.who === "player" || e.who === "ai")) {
        chat.push({ who: e.who, text: String(e.text ?? "") });
      }
    }
    return chat.slice(-limit);
  }

  tail(limit: number): LedgerEvent[] {
    return this.events.slice(-limit);
  }

  get size(): number {
    return this.events.length;
  }

  // ---- the only paths that change anything of consequence --------------

  /** A mood shift. Reaching the angry mood always writes the ban line too. */
  setMood(actor: Actor, mood: string, reason: string): { becameAngry: boolean } {
    const before = this.derive();
    if (before.mood === mood) return { becameAngry: false };
    this.append(actor, "mood_set", { mood, reason });
    if (mood === this.angryMood && !before.banned) {
      this.append("system", "websearch_ban", { reason: `anger: ${reason}` });
      return { becameAngry: true };
    }
    return { becameAngry: false };
  }

  /** Redemption: only this line lifts a websearch ban. Mood returns to default. */
  redeem(reason: string): void {
    const state = this.derive();
    if (!state.banned) return;
    this.append("ai", "redemption", { reason });
    if (state.mood !== this.defaultMood) {
      this.append("ai", "mood_set", { mood: this.defaultMood, reason: "redemption granted" });
    }
  }
}
