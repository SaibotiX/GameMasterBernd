/**
 * Picture search: MediaWiki file-namespace search (Wikimedia Commons by
 * default), best match downloaded to data/downloads/ and opened locally.
 */
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import type { PictureResult, SiteEntry } from "../types.ts";
import { ensureDir, slug } from "./../util.ts";
import { USER_AGENT } from "./text.ts";

const TIMEOUT_MS = 20_000;
const GOOD_MIME = /^image\/(jpeg|png|webp)$/;
const MAX_BYTES = 30 * 1024 * 1024;

interface WikiImage {
  title?: string;
  imageinfo?: { url?: string; mime?: string; width?: number; thumburl?: string; descriptionurl?: string }[];
}

export async function searchPicture(
  sites: SiteEntry[],
  searchKey: string,
  downloadDir: string,
): Promise<PictureResult | null> {
  for (const site of sites) {
    for (const apiPath of ["/w/api.php", "/api.php"]) {
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
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) continue;
        const data = (await response.json()) as { query?: { pages?: WikiImage[] } };
        pages = data.query?.pages ?? [];
      } catch {
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
      ensureDir(downloadDir);
      const path = join(downloadDir, `pic-${slug(searchKey)}-${Date.now()}.${extension}`);

      try {
        const download = await fetch(fileUrl, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(60_000),
        });
        if (!download.ok || !download.body) continue;
        const size = Number(download.headers.get("content-length") ?? 0);
        if (size > MAX_BYTES) continue;
        await pipeline(Readable.fromWeb(download.body as never), createWriteStream(path));
      } catch {
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
