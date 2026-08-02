/**
 * Picture and video search, adapted from app/src/adapters/{picture,video}.ts
 * for the pi runtime: both accept pi's tool AbortSignal so ESC stops the
 * network work (and kills the yt-dlp subprocess) instead of being swallowed.
 *
 * Picture: MediaWiki file-namespace search (Wikimedia Commons by default),
 * best match downloaded to the app's data/downloads/.
 * Video: yt-dlp as an arm's-length subprocess from the vendored source tree;
 * with ffmpeg (bundled under app/tools/ffmpeg/ or on PATH) a ~10 s clip,
 * otherwise the shortest matching full video ≤ 90 s.
 */
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { SiteEntry } from "./config.ts";
import { USER_AGENT } from "./textsearch.ts";

const run = promisify(execFile);
const PICTURE_TIMEOUT_MS = 20_000;
const GOOD_MIME = /^image\/(jpeg|png|webp)$/;
const MAX_BYTES = 30 * 1024 * 1024;
const CLIP_SECONDS = 10;
const PROBE_TIMEOUT = 90_000;
const DOWNLOAD_TIMEOUT = 240_000;

function slug(text: string, max = 40): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "item";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("search aborted");
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// ---- pictures -------------------------------------------------------------

export interface PictureResult {
	site: string;
	title: string;
	pageUrl: string;
	path: string;
}

interface WikiImage {
	title?: string;
	imageinfo?: { url?: string; mime?: string; width?: number; thumburl?: string; descriptionurl?: string }[];
}

export async function searchPicture(
	sites: SiteEntry[],
	searchKey: string,
	downloadDir: string,
	signal?: AbortSignal,
): Promise<PictureResult | null> {
	for (const site of sites) {
		for (const apiPath of ["/w/api.php", "/api.php"]) {
			throwIfAborted(signal);
			const url = new URL(`https://${site.host}${apiPath}`);
			for (const [key, value] of Object.entries({
				action: "query",
				generator: "search",
				gsrsearch: searchKey,
				gsrnamespace: "6",
				gsrlimit: "10",
				prop: "imageinfo",
				iiprop: "url|mime|size",
				iiurlwidth: "1600",
				format: "json",
				formatversion: "2",
			})) {
				url.searchParams.set(key, value);
			}

			let pages: WikiImage[];
			try {
				const response = await fetch(url, {
					headers: { "user-agent": USER_AGENT },
					signal: withTimeout(signal, PICTURE_TIMEOUT_MS),
				});
				if (!response.ok) continue;
				const data = (await response.json()) as { query?: { pages?: WikiImage[] } };
				pages = data.query?.pages ?? [];
			} catch {
				throwIfAborted(signal);
				continue;
			}
			if (pages.length === 0) continue;

			// Results arrive relevance-ordered ("index"), formatversion=2 keeps that order.
			const candidates = pages
				.map((p) => ({ title: p.title ?? "", info: p.imageinfo?.[0] }))
				.filter((c) => c.info && GOOD_MIME.test(c.info.mime ?? "") && (c.info.width ?? 0) >= 400);
			const pick = candidates[0];
			if (!pick?.info) continue;

			const fileUrl = pick.info.thumburl ?? pick.info.url;
			if (!fileUrl) continue;
			const extension = pick.info.mime === "image/png" ? "png" : pick.info.mime === "image/webp" ? "webp" : "jpg";
			mkdirSync(downloadDir, { recursive: true });
			const path = join(downloadDir, `pic-${slug(searchKey)}-${Date.now()}.${extension}`);

			try {
				const download = await fetch(fileUrl, {
					headers: { "user-agent": USER_AGENT },
					signal: withTimeout(signal, 60_000),
				});
				if (!download.ok || !download.body) continue;
				const size = Number(download.headers.get("content-length") ?? 0);
				if (size > MAX_BYTES) continue;
				await pipeline(Readable.fromWeb(download.body as never), createWriteStream(path));
			} catch {
				throwIfAborted(signal);
				continue;
			}

			return {
				site: site.host,
				title: pick.title.replace(/^File:/, ""),
				pageUrl: pick.info.descriptionurl ?? fileUrl,
				path,
			};
		}
	}
	return null;
}

// ---- videos ---------------------------------------------------------------

export interface VideoResult {
	title: string;
	url: string;
	durationSeconds: number;
	path: string;
	clipped: boolean;
}

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

function ytDlp(tooling: VideoTooling, args: string[], timeout: number, signal?: AbortSignal) {
	const fullArgs = ["-m", "yt_dlp", "--no-warnings", "--no-playlist", "--js-runtimes", "node", ...args];
	if (tooling.ffmpegDir) fullArgs.push("--ffmpeg-location", tooling.ffmpegDir);
	return run("python3", fullArgs, {
		timeout,
		signal,
		maxBuffer: 8 * 1024 * 1024,
		env: { ...process.env, PYTHONPATH: tooling.ytDlpSource },
	});
}

interface Candidate {
	id: string;
	title: string;
	durationSeconds: number;
}

async function probe(
	tooling: VideoTooling,
	searchKey: string,
	signal: AbortSignal | undefined,
	count = 6,
): Promise<Candidate[]> {
	const { stdout } = await ytDlp(
		tooling,
		["--skip-download", "--flat-playlist", "--print", "%(id)s\t%(duration)s\t%(title)s", `ytsearch${count}:${searchKey}`],
		PROBE_TIMEOUT,
		signal,
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
	signal?: AbortSignal,
): Promise<VideoResult | null> {
	const candidates = await probe(tooling, searchKey, signal);
	if (candidates.length === 0) return null;
	throwIfAborted(signal);

	const canClip = tooling.hasSystemFfmpeg || tooling.ffmpegDir !== null;
	// With ffmpeg: most relevant hit, capped at 20 minutes. Without: shortest hit ≤ 90s,
	// widening the search toward shorts when the regular results are all long.
	let pick: Candidate | undefined;
	if (canClip) {
		pick = candidates.find((c) => c.durationSeconds <= 1200) ?? candidates[0];
	} else {
		const shortest = (list: Candidate[]) =>
			[...list].sort((a, b) => a.durationSeconds - b.durationSeconds).find((c) => c.durationSeconds <= 90);
		pick = shortest(candidates) ?? shortest(await probe(tooling, `${searchKey} shorts`, signal, 10));
		if (!pick) return null; // nothing short enough to hand over whole
	}

	mkdirSync(downloadDir, { recursive: true });
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

	const { stdout } = await ytDlp(tooling, args, DOWNLOAD_TIMEOUT, signal);
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
