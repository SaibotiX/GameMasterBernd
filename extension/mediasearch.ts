/**
 * Picture and video search, adapted from app/src/adapters/{picture,video}.ts
 * for the pi runtime: both accept pi's tool AbortSignal so ESC stops the
 * network work instead of being swallowed.
 *
 * Picture: MediaWiki file-namespace search (Wikimedia Commons by default),
 * best match downloaded to data/downloads/. Transient network blips retry
 * once with a short backoff before a site is skipped (2026-08-04).
 *
 * Video: the same MediaWiki file search with `filetype:video` (R24,
 * 2026-08-07 — the yt-dlp/YouTube download pipeline is shed; Commons speaks
 * the API the glass already knows, and its files are free-licensed by
 * policy). `prop=videoinfo` is a superset of `imageinfo`: it adds the
 * file's duration, the browser-ready transcode ladder (`derivatives` —
 * WebM/Ogg only on Commons, MP4 stays patent-excluded) and the
 * machine-readable license/attribution (`extmetadata`), so every catch
 * carries its own credit. A modest transcode is downloaded WHOLE — no
 * clipping, no subprocess, no cookies, no identity ladder; when nothing
 * short enough exists, the glass honestly finds nothing.
 */
import { createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { SiteEntry } from "./config.ts";
import { fetchWithRetry, USER_AGENT } from "./textsearch.ts";

const PICTURE_TIMEOUT_MS = 20_000;
const GOOD_MIME = /^image\/(jpeg|png|webp)$/;
const MAX_BYTES = 30 * 1024 * 1024;
const VIDEO_TIMEOUT_MS = 20_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;
/** A glimpse, not a screening: whole files only (nothing clips them), so
 * anything longer is honestly passed over. */
const VIDEO_MAX_SECONDS = 240;
/** Commons video answers as video/webm, video/ogg or application/ogg. */
const GOOD_VIDEO_MIME = /^(video\/|application\/ogg)/;

function slug(text: string, max = 40): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "item";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("search aborted");
}

/**
 * Fetch a media file to `path`, honoring MAX_BYTES before the stream
 * (content-length) and after it (a header-less body must not smuggle an
 * oversized file). False = not fetched, caller tries the next candidate;
 * half a download never survives.
 */
async function downloadCapped(
	url: string,
	path: string,
	signal: AbortSignal | undefined,
	timeoutMs: number,
): Promise<boolean> {
	try {
		const download = await fetchWithRetry(url, { headers: { "user-agent": USER_AGENT } }, timeoutMs, signal);
		if (!download.ok || !download.body) return false;
		const size = Number(download.headers.get("content-length") ?? 0);
		if (size > MAX_BYTES) return false;
		await pipeline(Readable.fromWeb(download.body as never), createWriteStream(path));
		if (statSync(path).size > MAX_BYTES) {
			rmSync(path, { force: true });
			return false;
		}
		return true;
	} catch {
		rmSync(path, { force: true }); // never leave half a download behind
		throwIfAborted(signal);
		return false;
	}
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
			if (!(await downloadCapped(fileUrl, path, signal, 60_000))) continue;

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
	site: string;
	title: string;
	pageUrl: string;
	path: string;
	durationSeconds: number;
	/** Machine-read license short name (extmetadata), e.g. "CC BY-SA 4.0". */
	license: string | null;
	/** The credited author (extmetadata Artist, HTML stripped). */
	credit: string | null;
}

/** One rung of the transcode ladder the API serves per file. */
export interface VideoDerivative {
	src?: string;
	type?: string;
	width?: number;
	height?: number;
	/** Advertised bits per second — sizes the download before it starts. */
	bandwidth?: number;
}

interface WikiVideo {
	title?: string;
	/** Search rank from the generator — the pages array itself is pageid-ordered. */
	index?: number;
	videoinfo?: {
		url?: string;
		mime?: string;
		duration?: number;
		descriptionurl?: string;
		derivatives?: VideoDerivative[];
		extmetadata?: Record<string, { value?: string }>;
	}[];
}

/**
 * The transcode to fetch: browser-ready WebM preferred over legacy Ogg,
 * the largest frame that stays ≤ 480p (ladders go far bigger), and the
 * advertised bandwidth × duration must fit MAX_BYTES — else the ladder is
 * walked down. Pure — unit-tested.
 */
export function pickVideoDerivative(
	derivatives: VideoDerivative[],
	durationSeconds: number,
): VideoDerivative | null {
	const playable = derivatives.filter((d) => d.src && /^video\//.test(d.type ?? ""));
	const fits = (d: VideoDerivative) => !d.bandwidth || (d.bandwidth / 8) * durationSeconds <= MAX_BYTES;
	const byHeight = [...playable].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
	const webm = byHeight.filter((d) => (d.type ?? "").includes("webm"));
	for (const pool of [webm, byHeight]) {
		const modest = pool.filter((d) => (d.height ?? 0) <= 480);
		const pick = modest.find(fits) ?? [...pool].reverse().find(fits);
		if (pick) return pick;
	}
	return null;
}

/**
 * License + author from Commons's machine-readable extmetadata — the credit
 * that must ride with a BY/BY-SA catch wherever it is shown. Artist values
 * arrive as HTML (links, sometimes lists); tags are stripped to the bare
 * names. Pure — unit-tested.
 */
export function videoCredit(extmetadata: Record<string, { value?: string }> | undefined): {
	license: string | null;
	credit: string | null;
} {
	const clean = (html?: string) => html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
	const credit = clean(extmetadata?.Artist?.value);
	return {
		license: clean(extmetadata?.LicenseShortName?.value),
		credit: credit && credit.length > 120 ? `${credit.slice(0, 120)}…` : credit,
	};
}

export async function searchVideo(
	sites: SiteEntry[],
	searchKey: string,
	downloadDir: string,
	signal?: AbortSignal,
): Promise<VideoResult | null> {
	for (const site of sites) {
		for (const apiPath of ["/w/api.php", "/api.php"]) {
			throwIfAborted(signal);
			const url = new URL(`https://${site.host}${apiPath}`);
			for (const [key, value] of Object.entries({
				action: "query",
				generator: "search",
				gsrsearch: `filetype:video ${searchKey}`,
				gsrnamespace: "6",
				gsrlimit: "10",
				prop: "videoinfo",
				viprop: "url|mime|size|derivatives|extmetadata",
				format: "json",
				formatversion: "2",
			})) {
				url.searchParams.set(key, value);
			}

			let pages: WikiVideo[];
			try {
				const response = await fetchWithRetry(
					url,
					{ headers: { "user-agent": USER_AGENT } },
					VIDEO_TIMEOUT_MS,
					signal,
				);
				if (!response.ok) continue;
				const data = (await response.json()) as { query?: { pages?: WikiVideo[] } };
				pages = data.query?.pages ?? [];
			} catch {
				throwIfAborted(signal);
				continue;
			}
			if (pages.length === 0) continue;

			// The pages array arrives in pageid order; the search rank lives in
			// each page's "index" field — without this sort the pick is arbitrary.
			pages.sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
			// Unlike pictures, walk the candidates: the duration cap and the
			// size ladder can reject the best-ranked hits.
			for (const page of pages) {
				throwIfAborted(signal);
				const info = page.videoinfo?.[0];
				if (!info || !GOOD_VIDEO_MIME.test(info.mime ?? "")) continue;
				const duration = info.duration ?? 0;
				if (!Number.isFinite(duration) || duration <= 0 || duration > VIDEO_MAX_SECONDS) continue;
				const pick = pickVideoDerivative(info.derivatives ?? [], duration);
				const fileUrl = pick?.src ?? info.url;
				if (!fileUrl) continue;
				const extension = /\.([a-z0-9]{2,4})$/i.exec(new URL(fileUrl).pathname)?.[1]?.toLowerCase() ?? "webm";
				mkdirSync(downloadDir, { recursive: true });
				const path = join(downloadDir, `clip-${slug(searchKey)}-${Date.now()}.${extension}`);
				if (!(await downloadCapped(fileUrl, path, signal, VIDEO_DOWNLOAD_TIMEOUT_MS))) continue;

				return {
					site: site.host,
					title: (page.title ?? "").replace(/^File:/, ""),
					pageUrl: info.descriptionurl ?? fileUrl,
					path,
					durationSeconds: Math.round(duration),
					...videoCredit(info.extmetadata),
				};
			}
		}
	}
	return null;
}
