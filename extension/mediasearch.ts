/**
 * Picture and video search, adapted from app/src/adapters/{picture,video}.ts
 * for the pi runtime: both accept pi's tool AbortSignal so ESC stops the
 * network work (and kills the yt-dlp subprocess) instead of being swallowed.
 *
 * Picture: MediaWiki file-namespace search (Wikimedia Commons by default),
 * best match downloaded to data/downloads/. Transient network blips retry
 * once with a short backoff before a site is skipped (2026-08-04).
 * Video: yt-dlp as an arm's-length subprocess from the vendored source tree
 * (the git submodule at tools/yt-dlp); with ffmpeg (bundled under
 * tools/ffmpeg/ or on PATH) a ~10 s clip, otherwise the shortest matching
 * full video ≤ 90 s.
 *
 * YouTube sometimes answers with an IP-level bot check ("Sign in to confirm
 * you're not a bot") that hits every player client. The escalation ladder
 * was REBUILT 2026-08-04 (maintainer: the identity rung fired too often;
 * anonymity first) — ANONYMOUS rungs exhaust before any identity is spent:
 *   1. bare — the vendored version's own cookieless client defaults
 *      (2026.07.04: visionos, android_vr, web — upstream's best picks; the
 *      identity-free bgutil-ytdlp-pot-provider plugin, when installed,
 *      upgrades every rung transparently);
 *   2. the TV clients (tv, tv_downgraded) — the classic wall-dodgers, the
 *      very clients yt-dlp itself prefers once authenticated, still
 *      cookieless here;
 *   3. the web_safari/web_embedded pair — a different device story from
 *      the same IP, still cookieless;
 *   4. only now the player's own Netscape export at
 *      config/youtube-cookies.txt, if present (they control exactly which
 *      cookies it holds — before this rebuild the file rode EVERY first
 *      attempt; now most scryings never touch it);
 *   5. last: cookies borrowed live from an installed browser
 *      (WORLD_CONSOLE_YT_BROWSER names one, else the first detected).
 * The rung that cured a bot check is remembered for the rest of the run
 * (no re-climbing per call); identity use is always reported via
 * cookieSource so the UI can tell the player. WORLD_CONSOLE_YT_PROXY hands
 * every yt-dlp call a --proxy (the player's own anonymity lever — a VPN or
 * SOCKS proxy keeps even the bare rungs unlinkable to their line).
 * yt-dlp reads the whole browser cookie store locally but only sends the
 * youtube/google-scoped cookies with requests.
 *
 * Verified 2026-08-02: cookies alone are not enough — yt-dlp also needs its
 * EJS challenge solver script (--remote-components ejs:github, always passed
 * below) or YouTube's signature challenges fail and only storyboard images
 * survive format extraction.
 */
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { SiteEntry } from "./config.ts";
import { fetchWithRetry, USER_AGENT } from "./textsearch.ts";

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

// ---- pictures -------------------------------------------------------------

export interface PictureResult {
	site: string;
	title: string;
	pageUrl: string;
	path: string;
}

interface WikiImage {
	title?: string;
	/** Search rank from the generator — the pages array itself is pageid-ordered. */
	index?: number;
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
				const response = await fetchWithRetry(
					url,
					{ headers: { "user-agent": USER_AGENT } },
					PICTURE_TIMEOUT_MS,
					signal,
				);
				if (!response.ok) continue;
				const data = (await response.json()) as { query?: { pages?: WikiImage[] } };
				pages = data.query?.pages ?? [];
			} catch {
				throwIfAborted(signal);
				continue;
			}
			if (pages.length === 0) continue;

			// The pages array arrives in pageid order; the search rank lives in
			// each page's "index" field — without this sort the pick is arbitrary.
			pages.sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
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
				const download = await fetchWithRetry(
					fileUrl,
					{ headers: { "user-agent": USER_AGENT } },
					60_000,
					signal,
				);
				if (!download.ok || !download.body) continue;
				const size = Number(download.headers.get("content-length") ?? 0);
				if (size > MAX_BYTES) continue;
				await pipeline(Readable.fromWeb(download.body as never), createWriteStream(path));
				if (statSync(path).size > MAX_BYTES) {
					// no content-length header and the body was oversized after all
					rmSync(path, { force: true });
					continue;
				}
			} catch {
				rmSync(path, { force: true }); // never leave half a download behind
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
	ytDlpSource: string | null; // vendored yt-dlp checkout; null → rely on a system-installed yt_dlp module
	ffmpegDir: string | null; // directory containing a bundled ffmpeg, if any
	hasSystemFfmpeg: boolean;
	/** Netscape cookies file (config/youtube-cookies.txt), if present. */
	cookiesFile: string | null;
	/** Browser named by WORLD_CONSOLE_YT_BROWSER, if set. */
	cookiesFromBrowser: string | null;
	/** Installed browser to borrow cookies from when YouTube bot-checks. */
	browserFallback: string | null;
	/** WORLD_CONSOLE_YT_PROXY — handed to every yt-dlp call as --proxy (the
	 * player's own anonymity lever; empty = direct). */
	proxy: string | null;
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
	const ytDlpSource = join(appRoot, "tools", "yt-dlp");
	const bundled = join(appRoot, "tools", "ffmpeg");
	const cookiesFile = join(appRoot, "config", "youtube-cookies.txt");
	return {
		ytDlpSource: existsSync(join(ytDlpSource, "yt_dlp")) ? ytDlpSource : null,
		ffmpegDir: existsSync(join(bundled, "ffmpeg")) ? bundled : null,
		hasSystemFfmpeg: (process.env.PATH ?? "")
			.split(":")
			.some((dir) => dir && existsSync(join(dir, "ffmpeg"))),
		cookiesFile: existsSync(cookiesFile) ? cookiesFile : null,
		cookiesFromBrowser: process.env.WORLD_CONSOLE_YT_BROWSER || null,
		browserFallback: detectBrowser(),
		proxy: process.env.WORLD_CONSOLE_YT_PROXY || null,
	};
}

/**
 * One rung of the bot-check ladder. `clients` overrides yt-dlp's player
 * clients (anonymous rotation); `cookieFile`/`browser` spend identity.
 */
export interface LadderRung {
	label: string;
	clients?: string;
	cookieFile?: boolean;
	browser?: string;
}

/**
 * The escalation ladder, least identifying first (pure — unit-tested).
 * Anonymous client rotations exhaust before any cookie is touched; the
 * player's export file outranks live browser borrowing.
 */
export function buildLadder(tooling: VideoTooling): LadderRung[] {
	const rungs: LadderRung[] = [
		{ label: "anonymous" }, // the version's own cookieless defaults
		{ label: "anonymous:tv", clients: "tv,tv_downgraded" },
		{ label: "anonymous:web_safari", clients: "web_safari,web_embedded" },
	];
	if (tooling.cookiesFile) rungs.push({ label: "file", cookieFile: true });
	const browser = tooling.cookiesFromBrowser ?? tooling.browserFallback;
	if (browser) rungs.push({ label: browser, browser });
	return rungs;
}

function ytDlp(
	tooling: VideoTooling,
	args: string[],
	timeout: number,
	signal: AbortSignal | undefined,
	rung: LadderRung,
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
	if (tooling.proxy) fullArgs.push("--proxy", tooling.proxy);
	if (rung.clients) fullArgs.push("--extractor-args", `youtube:player_client=${rung.clients}`);
	if (rung.browser) fullArgs.push("--cookies-from-browser", rung.browser);
	else if (rung.cookieFile && tooling.cookiesFile) fullArgs.push("--cookies", tooling.cookiesFile);
	return run("python3", fullArgs, {
		timeout,
		signal,
		maxBuffer: 8 * 1024 * 1024,
		env: tooling.ytDlpSource
			? {
					...process.env,
					PYTHONPATH: process.env.PYTHONPATH
						? `${tooling.ytDlpSource}:${process.env.PYTHONPATH}`
						: tooling.ytDlpSource,
				}
			: process.env,
	});
}

/** YouTube's wall in its 2026 wordings, plus the rate-limit answers that the
 * ladder's later rungs (different client story, then cookies) sometimes cure. */
export const BOT_CHECK = /Sign in to confirm|not a bot|not a robot|HTTP Error 429|Too Many Requests/i;

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
function ytDlpError(error: unknown, ladderExhausted = false): Error {
	const raw = [(error as { stderr?: string })?.stderr, (error as Error)?.message].filter(Boolean).join("\n");
	const firstError = raw
		.split("\n")
		.find((line) => line.trimStart().startsWith("ERROR:"))
		?.trim();
	if (firstError && BOT_CHECK.test(firstError)) {
		return new Error(
			ladderExhausted
				? "YouTube's bot check refused every rung — three anonymous client stories and the cookie rungs alike. " +
					"What helps: open youtube.com once in the cookie browser (signing in helps most); or save a fresh " +
					"signed-in Netscape export to config/youtube-cookies.txt; or route the glass through your own " +
					"proxy/VPN (WORLD_CONSOLE_YT_PROXY=socks5://…); the identity-free bgutil-ytdlp-pot-provider " +
					"plugin also upgrades every anonymous rung when installed."
				: "YouTube refused the request (bot check) and no cookie rung exists to climb to. Anonymous options " +
					"first: route through your own proxy (WORLD_CONSOLE_YT_PROXY=socks5://…) or install the " +
					"identity-free bgutil-ytdlp-pot-provider plugin. Identity options: save a Netscape export to " +
					"config/youtube-cookies.txt, or set WORLD_CONSOLE_YT_BROWSER=<firefox|chrome|…> to allow borrowing.",
		);
	}
	if (firstError) return new Error(firstError);
	const brief = raw.replace(/\s+/g, " ").trim();
	return new Error(brief.length > 300 ? `${brief.slice(0, 300)}…` : brief || "yt-dlp failed");
}

/** The rung that last cured a bot check — the run starts there next time
 * instead of re-climbing (and re-failing) the whole ladder per call. */
let stickyRungLabel: string | null = null;

/** Records what a search ended up spending: a browser name, "file", or null
 * (all anonymous rungs report null — no identity was used). */
interface CookieTrace {
	used: string | null;
}

/**
 * Run yt-dlp up the escalation ladder (buildLadder — anonymous client
 * rotations first, the player's cookie file next, live browser borrowing
 * last). Only a BOT CHECK climbs; every other error is real and thrown as
 * it was. The curing rung is remembered for the rest of the run; browser
 * stores are re-read on every invocation, so no export or rerun is needed.
 */
async function ytDlpRescued(
	tooling: VideoTooling,
	args: string[],
	timeout: number,
	signal: AbortSignal | undefined,
	trace?: CookieTrace,
) {
	const ladder = buildLadder(tooling);
	const startAt = Math.max(0, ladder.findIndex((rung) => rung.label === stickyRungLabel));
	let lastError: unknown;
	for (let i = startAt; i < ladder.length; i++) {
		const rung = ladder[i];
		try {
			const result = await ytDlp(tooling, args, timeout, signal, rung);
			if (i > 0) stickyRungLabel = rung.label;
			if (trace) trace.used = rung.browser ?? (rung.cookieFile ? "file" : null);
			return result;
		} catch (error) {
			throwIfAborted(signal);
			lastError = error;
			if (!isBotCheck(error)) throw ytDlpError(error);
		}
	}
	throw ytDlpError(lastError, ladder.some((rung) => rung.cookieFile || rung.browser));
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
	// With ffmpeg: the most relevant hit, preferring ones ≤ 20 minutes but
	// falling back to the top hit (only ~10 s is downloaded either way).
	// Without: shortest hit ≤ 90s, widening toward shorts when all are long.
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
