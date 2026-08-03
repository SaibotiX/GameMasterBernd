/**
 * Text search over the configured sites, tried in order.
 * Every site is expected to speak the MediaWiki API (Wikipedia, Wikimedia
 * projects, most Fandom wikis). The api.php path is probed at /w/api.php
 * first, then /api.php.
 *
 * Adapted from app/src/adapters/text.ts with one behavioral fix: an outer
 * AbortSignal (pi's tool-abort, e.g. the user pressing ESC) stops the whole
 * search immediately instead of being swallowed and falling through to the
 * next site/path.
 */
import type { SiteEntry } from "./config.ts";

export const USER_AGENT = "world-console/1.0 (terminal game; local use)";
const TIMEOUT_MS = 12_000;

export interface TextResult {
	site: string;
	title: string;
	url: string;
	extract: string;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("search aborted");
}

async function apiGet(
	host: string,
	params: Record<string, string>,
	signal: AbortSignal | undefined,
): Promise<unknown | null> {
	for (const apiPath of ["/w/api.php", "/api.php"]) {
		throwIfAborted(signal);
		const url = new URL(`https://${host}${apiPath}`);
		for (const [key, value] of Object.entries({ format: "json", formatversion: "2", ...params })) {
			url.searchParams.set(key, value);
		}
		try {
			const timeout = AbortSignal.timeout(TIMEOUT_MS);
			const response = await fetch(url, {
				headers: { "user-agent": USER_AGENT },
				signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
				redirect: "follow",
			});
			if (!response.ok) continue;
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("json")) continue;
			return await response.json();
		} catch {
			throwIfAborted(signal); // user abort ends the search; timeouts and network errors try the next path
			continue;
		}
	}
	return null;
}

export async function searchText(
	sites: SiteEntry[],
	searchKey: string,
	signal?: AbortSignal,
): Promise<TextResult | null> {
	for (const site of sites) {
		// 1. Find the best-matching page title: title match first, then full-text
		//    search (long, natural-language keys rarely match a title prefix).
		const found = (await apiGet(site.host, {
			action: "opensearch",
			search: searchKey,
			limit: "1",
		}, signal)) as [string, string[], string[], string[]] | null;
		let title = found?.[1]?.[0];
		let url = found?.[3]?.[0];
		if (!title) {
			const fullText = (await apiGet(site.host, {
				action: "query",
				list: "search",
				srsearch: searchKey,
				srlimit: "1",
			}, signal)) as { query?: { search?: { title?: string }[] } } | null;
			title = fullText?.query?.search?.[0]?.title;
			url = undefined;
		}
		if (!title) continue;

		// 2. Pull its intro as plain text, plus the canonical page URL (wikis
		//    do not all serve articles under /wiki/, and redirects may land on
		//    a different title than the one searched).
		const page = (await apiGet(site.host, {
			action: "query",
			prop: "extracts|info",
			exintro: "1",
			explaintext: "1",
			redirects: "1",
			inprop: "url",
			titles: title,
		}, signal)) as { query?: { pages?: { title?: string; extract?: string; fullurl?: string }[] } } | null;
		const extract = page?.query?.pages?.[0]?.extract?.trim();
		if (!extract) continue;

		return {
			site: site.host,
			title,
			url:
				page?.query?.pages?.[0]?.fullurl ??
				url ??
				`https://${site.host}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
			extract: extract.length > 1200 ? extract.slice(0, 1200).trimEnd() + "…" : extract,
		};
	}
	return null;
}
