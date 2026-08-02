/** Everything a command needs to act: config, ledger, AI, tooling, output. */
import type { AiClient, Config } from "./types.ts";
import type { Ledger } from "./ledger.ts";
import type { VideoTooling } from "./adapters/video.ts";

export interface GameContext {
  config: Config;
  ledger: Ledger;
  ai: AiClient;
  tooling: VideoTooling;
  downloadDir: string;
  noOpen: boolean; // print file paths instead of launching viewers (tests, headless)
  /** The AI speaking, in color, also recorded as a chat line in the ledger. */
  aiSays(text: string): void;
  /** Out-of-fiction system information. */
  system(text: string): void;
  /** The mood id with the highest severity (the one that triggers the ban). */
  angryMoodId(): string;
  wantExit: boolean;
}
