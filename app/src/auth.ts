/**
 * File-backed credential store for the pi-ai provider layer.
 *
 * The pi-ai CLI (`node ../pi/packages/ai/dist/cli.js login <provider>`) writes
 * OAuth credentials to ./auth.json in the directory it is run from. This store
 * reads the same file — app/auth.json — and persists token refreshes back to
 * it, so an OAuth login done once from the app/ directory keeps working.
 *
 * The shape matches pi-ai's CredentialStore contract: read / list / modify /
 * delete, with modify as the only (serialized) write path.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

interface Credential {
  type: string;
  [key: string]: unknown;
}

export class FileCredentialStore {
  private file: string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  private load(): Record<string, Credential> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Record<string, Credential>;
    } catch {
      return {};
    }
  }

  private save(all: Record<string, Credential>): void {
    writeFileSync(this.file, JSON.stringify(all, null, 2) + "\n", "utf8");
    try {
      chmodSync(this.file, 0o600); // tokens are secrets
    } catch {
      // best effort on exotic filesystems
    }
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.load()[providerId];
  }

  async list(): Promise<{ providerId: string; type: string }[]> {
    return Object.entries(this.load()).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  /** Serialized read-modify-write; pi-ai runs OAuth refreshes through here. */
  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const task = async (): Promise<Credential | undefined> => {
      const all = this.load();
      const next = await fn(all[providerId]);
      if (next !== undefined) {
        all[providerId] = next;
        this.save(all);
      }
      return next ?? all[providerId];
    };
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => {});
    return result;
  }

  async delete(providerId: string): Promise<void> {
    await this.modify(providerId, async () => undefined).then(() => {
      const all = this.load();
      if (providerId in all) {
        delete all[providerId];
        this.save(all);
      }
    });
  }
}
