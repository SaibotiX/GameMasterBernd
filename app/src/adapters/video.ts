/**
 * Video search: yt-dlp as an arm's-length subprocess (never imported),
 * run from the vendored source tree so YouTube support stays current.
 *
 * Preferred path: cut a ~10 second clip with ffmpeg (system ffmpeg, or a
 * static build under app/tools/ffmpeg/). Without any ffmpeg the adapter
 * degrades to downloading the shortest matching full video.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoResult } from "../types.ts";
import { ensureDir, slug } from "../util.ts";

const run = promisify(execFile);
const CLIP_SECONDS = 10;
const PROBE_TIMEOUT = 90_000;
const DOWNLOAD_TIMEOUT = 240_000;

export interface VideoTooling {
  ytDlpSource: string; // path to the vendored yt-dlp checkout
  ffmpegDir: string | null; // directory containing a bundled ffmpeg, if any
  hasSystemFfmpeg: boolean;
}

export function detectTooling(appRoot: string): VideoTooling {
  const ytDlpSource = join(appRoot, "..", "yt-dlp");
  const bundled = join(appRoot, "tools", "ffmpeg");
  return {
    ytDlpSource,
    ffmpegDir: existsSync(join(bundled, "ffmpeg")) ? bundled : null,
    hasSystemFfmpeg: (process.env.PATH ?? "")
      .split(":")
      .some((dir) => dir && existsSync(join(dir, "ffmpeg"))),
  };
}

function ytDlp(tooling: VideoTooling, args: string[], timeout: number) {
  const fullArgs = ["-m", "yt_dlp", "--no-warnings", "--no-playlist", "--js-runtimes", "node", ...args];
  if (tooling.ffmpegDir) fullArgs.push("--ffmpeg-location", tooling.ffmpegDir);
  return run("python3", fullArgs, {
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: tooling.ytDlpSource },
  });
}

interface Candidate {
  id: string;
  title: string;
  durationSeconds: number;
}

async function probe(tooling: VideoTooling, searchKey: string, count = 6): Promise<Candidate[]> {
  const { stdout } = await ytDlp(
    tooling,
    ["--skip-download", "--flat-playlist", "--print", "%(id)s\t%(duration)s\t%(title)s", `ytsearch${count}:${searchKey}`],
    PROBE_TIMEOUT,
  );
  const candidates: Candidate[] = [];
  for (const line of stdout.split("\n")) {
    const [id, duration, ...title] = line.split("\t");
    if (!id || title.length === 0) continue;
    const seconds = Number(duration);
    if (!Number.isFinite(seconds) || seconds < CLIP_SECONDS) continue; // skips live streams and stubs
    candidates.push({ id, title: title.join("\t").trim(), durationSeconds: Math.round(seconds) });
  }
  return candidates;
}

export async function searchVideo(
  tooling: VideoTooling,
  searchKey: string,
  downloadDir: string,
): Promise<VideoResult | null> {
  const candidates = await probe(tooling, searchKey);
  if (candidates.length === 0) return null;

  const canClip = tooling.hasSystemFfmpeg || tooling.ffmpegDir !== null;
  // With ffmpeg: most relevant hit, capped at 20 minutes. Without: shortest hit ≤ 90s,
  // widening the search toward shorts when the regular results are all long.
  let pick: Candidate | undefined;
  if (canClip) {
    pick = candidates.find((c) => c.durationSeconds <= 1200) ?? candidates[0];
  } else {
    const shortest = (list: Candidate[]) =>
      [...list].sort((a, b) => a.durationSeconds - b.durationSeconds).find((c) => c.durationSeconds <= 90);
    pick = shortest(candidates) ?? shortest(await probe(tooling, `${searchKey} shorts`, 10));
    if (!pick) return null; // nothing short enough to hand over whole
  }

  ensureDir(downloadDir);
  const output = join(downloadDir, `clip-${slug(searchKey)}-${Date.now()}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${pick.id}`;
  const args = [
    url,
    "-f", "mp4/best",
    "-o", output,
    "--print", "after_move:filepath",
    "--no-simulate",
    "--quiet",
  ];
  if (canClip) {
    args.push("--download-sections", `*0-${CLIP_SECONDS}`, "--force-keyframes-at-cuts");
  }

  const { stdout } = await ytDlp(tooling, args, DOWNLOAD_TIMEOUT);
  const path = stdout.trim().split("\n").at(-1);
  if (!path || !existsSync(path)) return null;
  return {
    title: pick.title,
    url,
    durationSeconds: canClip ? CLIP_SECONDS : pick.durationSeconds,
    path,
    clipped: canClip,
  };
}
