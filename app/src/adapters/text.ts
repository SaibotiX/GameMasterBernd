/**
 * Text search over the configured sites, tried in order.
 * Every default and user-added site is expected to speak the MediaWiki API
 * (Wikipedia, Wikimedia projects, most Fandom wikis). The api.php path is
 * probed at /w/api.php first, then /api.php.
 */
import type { SiteEntry, TextResult } from "../types.ts";

export const USER_AGENT = "world-console/1.0 (terminal game; local use)";
const TIMEOUT_MS = 12_000;

async function apiGet(host: string, params: Record<string, string>): Promise<unknown | null> {
  for (const apiPath of ["/w/api.php", "/api.php"]) {
    const url = new URL(`https://${host}${apiPath}`);
    for (const [key, value] of Object.entries({ format: "json", formatversion: "2", ...params })) {
      url.searchParams.set(key, value);
    }
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) continue;
      return await response.json();
    } catch {
      continue;
    }
  }
  return null;
}

export async function searchText(sites: SiteEntry[], searchKey: string): Promise<TextResult | null> {
  for (const site of sites) {
    // 1. Find the best-matching page title: title match first, then full-text
    //    search (long, natural-language keys rarely match a title prefix).
    const found = (await apiGet(site.host, {
      action: "opensearch",
      search: searchKey,
      limit: "1",
    })) as [string, string[], string[], string[]] | null;
    let title = found?.[1]?.[0];
    let url = found?.[3]?.[0];
    if (!title) {
      const fullText = (await apiGet(site.host, {
        action: "query",
        list: "search",
        srsearch: searchKey,
        srlimit: "1",
      })) as { query?: { search?: { title?: string }[] } } | null;
      title = fullText?.query?.search?.[0]?.title;
      url = undefined;
    }
    if (!title) continue;

    // 2. Pull its intro as plain text.
    const page = (await apiGet(site.host, {
      action: "query",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      redirects: "1",
      titles: title,
    })) as { query?: { pages?: { title?: string; extract?: string }[] } } | null;
    const extract = page?.query?.pages?.[0]?.extract?.trim();
    if (!extract) continue;

    return {
      site: site.host,
      title,
      url: url ?? `https://${site.host}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      extract: extract.length > 1200 ? extract.slice(0, 1200).trimEnd() + "…" : extract,
    };
  }
  return null;
}
