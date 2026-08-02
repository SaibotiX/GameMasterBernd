/** Shared types for the world console. */

export type SearchKind = "text" | "picture" | "video";

// ------------------------------------------------------------------ config
export interface World {
  id: string;
  title: string;
  voice: string; // the game master's in-world name
  register: string; // era & speech style, e.g. "medieval high fantasy"
  model: string; // "provider/model-id" for live mode
  defaultMood: string;
  body: string; // the world description (layer 1 of the prompt)
}

export interface Mood {
  id: string;
  tone: string;
  severity: number; // 0 gracious … 3 angry
  body: string;
}

export interface SiteEntry {
  host: string;
}

export interface Sites {
  text: SiteEntry[];
  picture: SiteEntry[];
}

export interface Config {
  root: string; // app/ directory
  constitution: string;
  world: World;
  moods: Map<string, Mood>;
  sites: Sites;
  refresh(): void; // re-reads constitution/world/moods from disk (hot edit support)
  saveSites(): void;
}

// ------------------------------------------------------------------ ledger
export type Actor = "player" | "ai" | "system";

export interface LedgerEvent {
  t: string; // ISO timestamp
  actor: Actor;
  type: string;
  [key: string]: unknown;
}

export interface DerivedState {
  playerName: string | null;
  mood: string; // current mood id
  banned: boolean; // websearch forbidden until redemption
  chats: number;
  searches: number;
  refusals: number;
  lastSessionStart: string | null; // previous session, for "since we last spoke"
}

// ---------------------------------------------------------------------- AI
export interface ChatRequest {
  state: DerivedState;
  history: { who: "player" | "ai"; text: string }[];
  playerText: string | null; // null when the system speaks (greeting, refusals)
  note: string | null; // per-turn system note, cleared after the call
}

export interface ChatResult {
  say: string;
  moodTag: string | null; // parsed @mood(...) directive, validated by the caller
  redeemTag: boolean; // parsed @redeem directive
}

export interface GateRequest {
  state: DerivedState;
  kind: SearchKind;
  query: string;
}

export type GateCategory = "in_theme" | "off_theme" | "harmful";

export interface GateResult {
  allowed: boolean;
  category: GateCategory;
  searchKey: string; // refined key used for the actual web search
  say: string; // in-character announcement or refusal
}

export interface VerifyRequest {
  state: DerivedState;
  kind: SearchKind;
  query: string;
  resultTitle: string;
  resultSummary: string; // extract, filename or video title
}

export interface VerifyResult {
  ok: boolean;
  say: string; // in-character presentation of the result
}

export interface AiClient {
  kind: "dummy" | "live";
  /** Which model answers (display only). */
  label: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  gate(req: GateRequest): Promise<GateResult>;
  verify(req: VerifyRequest): Promise<VerifyResult>;
}

// ------------------------------------------------------------------ search
export interface TextResult {
  site: string;
  title: string;
  url: string;
  extract: string;
}

export interface PictureResult {
  site: string;
  title: string;
  pageUrl: string;
  path: string; // downloaded file
}

export interface VideoResult {
  title: string;
  url: string;
  durationSeconds: number;
  path: string; // downloaded clip
  clipped: boolean; // true when cut to ~10s, false when a short full video
}
