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
 *
 * YouTube sometimes answers with an IP-level bot check ("Sign in to confirm
 * you're not a bot") that hits every player client; per yt-dlp only cookies
 * (or a PO-token provider plugin) cure it. Escalation ladder, least invasive
 * first, per the player's 2026-08-02 choice:
 *   1. the player's own Netscape export at app/config/youtube-cookies.txt,
 *      if present — they control exactly which cookies it holds;
 *   2. otherwise a bare attempt; the identity-free bgutil-ytdlp-pot-provider
 *      plugin, when installed, upgrades every attempt transparently;
 *   3. only when YouTube still bot-checks: cookies borrowed live from an
 *      installed browser (WORLD_CONSOLE_YT_BROWSER names one, else the first
 *      detected), sticky for the rest of the run. Every search that borrowed
 *      them reports it via cookieSource so the UI can tell the player.
 * yt-dlp reads the whole browser cookie store locally but only sends the
 * youtube/google-scoped cookies with requests.
 *
 * Verified 2026-08-02: cookies alone are not enough — yt-dlp also needs its
 * EJS challenge solver script (--remote-components ejs:github, always passed
 * below) or YouTube's signature challenges fail and only storyboard images
 * survive format extraction.
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
	/** Cookies the run ended up using: a browser name, "file", or null. */
	cookieSource: string | null;
}

export interface VideoTooling {
	ytDlpSource: string; // path to the vendored yt-dlp checkout
	ffmpegDir: string | null; // directory containing a bundled ffmpeg, if any
	hasSystemFfmpeg: boolean;
	/** Netscape cookies file (app/config/youtube-cookies.txt), if present. */
	cookiesFile: string | null;
	/** Browser named by WORLD_CONSOLE_YT_BROWSER, if set. */
	cookiesFromBrowser: string | null;
	/** Installed browser to borrow cookies from when YouTube bot-checks. */
	browserFallback: string | null;
}

/** First installed browser yt-dlp knows how to borrow cookies from. */
function detectBrowser(): string | null {
	const home = process.env.HOME ?? "";
	if (!home) return null;
	if (
		existsSync(join(home, ".mozilla", "firefox")) ||
		existsSync(join(home, "snap", "firefox", "common", ".mozilla", "firefox"))
	) {
		return "firefox";
	}
	if (existsSync(join(home, ".config", "chromium"))) return "chromium";
	if (existsSync(join(home, ".config", "google-chrome"))) return "chrome";
	if (existsSync(join(home, ".config", "BraveSoftware"))) return "brave";
	return null;
}

export function detectTooling(appRoot: string): VideoTooling {
	const ytDlpSource = join(appRoot, "..", "yt-dlp");
	const bundled = join(appRoot, "tools", "ffmpeg");
	const cookiesFile = join(appRoot, "config", "youtube-cookies.txt");
	return {
		ytDlpSource,
		ffmpegDir: existsSync(join(bundled, "ffmpeg")) ? bundled : null,
		hasSystemFfmpeg: (process.env.PATH ?? "")
			.split(":")
			.some((dir) => dir && existsSync(join(dir, "ffmpeg"))),
		cookiesFile: existsSync(cookiesFile) ? cookiesFile : null,
		cookiesFromBrowser: process.env.WORLD_CONSOLE_YT_BROWSER || null,
		browserFallback: detectBrowser(),
	};
}

function ytDlp(
	tooling: VideoTooling,
	args: string[],
	timeout: number,
	signal: AbortSignal | undefined,
	browser: string | null,
) {
	// --remote-components ejs:github lets yt-dlp fetch its official challenge
	// solver script (cached after the first download); without it YouTube's
	// signature challenges fail and every real format is dropped.
	const fullArgs = [
		"-m", "yt_dlp", "--no-warnings", "--no-playlist",
		"--js-runtimes", "node", "--remote-components", "ejs:github",
		...args,
	];
	if (tooling.ffmpegDir) fullArgs.push("--ffmpeg-location", tooling.ffmpegDir);
	if (browser) fullArgs.push("--cookies-from-browser", browser);
	else if (tooling.cookiesFile) fullArgs.push("--cookies", tooling.cookiesFile);
	return run("python3", fullArgs, {
		timeout,
		signal,
		maxBuffer: 8 * 1024 * 1024,
		env: { ...process.env, PYTHONPATH: tooling.ytDlpSource },
	});
}

const BOT_CHECK = /Sign in to confirm|not a bot/i;

function isBotCheck(error: unknown): boolean {
	return BOT_CHECK.test(
		[(error as { stderr?: string })?.stderr, (error as Error)?.message].filter(Boolean).join("\n"),
	);
}

/**
 * yt-dlp failures surface as execFile errors whose message embeds the whole
 * command line plus stderr. Reduce that to the yt-dlp ERROR line — and turn
 * YouTube's bot check into the instruction that actually fixes it — so the
 * model and the ledger get a short reason instead of a wall of text.
 */
function ytDlpError(error: unknown, triedBrowser?: string): Error {
	const raw = [(error as { stderr?: string })?.stderr, (error as Error)?.message].filter(Boolean).join("\n");
	const firstError = raw
		.split("\n")
		.find((line) => line.trimStart().startsWith("ERROR:"))
		?.trim();
	if (firstError && BOT_CHECK.test(firstError)) {
		return new Error(
			triedBrowser
				? `YouTube's bot check refused even cookies borrowed from ${triedBrowser}. ` +
					`Open youtube.com in ${triedBrowser} once (signing in helps most), then try again — ` +
					`or save a signed-in Netscape export to app/config/youtube-cookies.txt.`
				: "YouTube refused the request (bot check) and no browser was found to borrow cookies from. " +
					"Set WORLD_CONSOLE_YT_BROWSER=<firefox|chrome|...>, save a Netscape cookie export to " +
					"app/config/youtube-cookies.txt, or install the identity-free bgutil-ytdlp-pot-provider plugin.",
		);
	}
	if (firstError) return new Error(firstError);
	const brief = raw.replace(/\s+/g, " ").trim();
	return new Error(brief.length > 300 ? `${brief.slice(0, 300)}…` : brief || "yt-dlp failed");
}

/** Browser that already rescued a bot-checked call — reused for the rest of the run. */
let cookieRescue: string | null = null;

/** Records which cookies a search ended up using (browser name, "file", or null). */
interface CookieTrace {
	used: string | null;
}

/**
 * Run yt-dlp; when YouTube answers with its bot check, retry once with
 * cookies borrowed live from an installed browser and keep using them for
 * later calls. Browser cookies are the LAST resort: the first attempt runs
 * bare — or with the player's own cookie file — and WORLD_CONSOLE_YT_BROWSER
 * only names which browser the rescue may borrow from. The browser store is
 * re-read on every invocation, so no export file, reload, or rerun is needed.
 */
async function ytDlpRescued(
	tooling: VideoTooling,
	args: string[],
	timeout: number,
	signal: AbortSignal | undefined,
	trace?: CookieTrace,
) {
	const standing = cookieRescue;
	try {
		const result = await ytDlp(tooling, args, timeout, signal, standing);
		if (trace) trace.used = standing ?? (tooling.cookiesFile ? "file" : null);
		return result;
	} catch (error) {
		throwIfAborted(signal);
		const rescue = tooling.cookiesFromBrowser ?? tooling.browserFallback;
		if (!isBotCheck(error) || standing || !rescue) throw ytDlpError(error, standing ?? undefined);
		try {
			const result = await ytDlp(tooling, args, timeout, signal, rescue);
			cookieRescue = rescue;
			if (trace) trace.used = rescue;
			return result;
		} catch (retryError) {
			throwIfAborted(signal);
			throw ytDlpError(retryError, rescue);
		}
	}
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
	trace?: CookieTrace,
): Promise<Candidate[]> {
	const { stdout } = await ytDlpRescued(
		tooling,
		["--skip-download", "--flat-playlist", "--print", "%(id)s\t%(duration)s\t%(title)s", `ytsearch${count}:${searchKey}`],
		PROBE_TIMEOUT,
		signal,
		trace,
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
	const trace: CookieTrace = { used: null };
	const candidates = await probe(tooling, searchKey, signal, 6, trace);
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
		pick = shortest(candidates) ?? shortest(await probe(tooling, `${searchKey} shorts`, signal, 10, trace));
		if (!pick) return null; // nothing short enough to hand over whole
	}

	mkdirSync(downloadDir, { recursive: true });
	const output = join(downloadDir, `clip-${slug(searchKey)}-${Date.now()}.%(ext)s`);
	const url = `https://www.youtube.com/watch?v=${pick.id}`;
	// YouTube increasingly serves only split video+audio streams (no premuxed
	// file): with ffmpeg pick the best mp4 pair and merge; without ffmpeg only
	// a premuxed single file can be handed over.
	const args = [
		url,
		"-f", canClip ? "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" : "b[ext=mp4]/b",
		"-o", output,
		"--print", "after_move:filepath",
		"--no-simulate",
		"--quiet",
	];
	if (canClip) {
		args.push("--merge-output-format", "mp4", "--download-sections", `*0-${CLIP_SECONDS}`, "--force-keyframes-at-cuts");
	}

	const { stdout } = await ytDlpRescued(tooling, args, DOWNLOAD_TIMEOUT, signal, trace);
	const path = stdout.trim().split("\n").at(-1);
	if (!path || !existsSync(path)) return null;
	return {
		title: pick.title,
		url,
		durationSeconds: canClip ? CLIP_SECONDS : pick.durationSeconds,
		path,
		clipped: canClip,
		cookieSource: trace.used,
	};
}
