/**
 * Resolve crawl IDs and cache the crawl list from Common Crawl.
 */

import { fetchWithRetry } from "./fetch-retry.js";

interface CrawlInfo {
  id: string;
  name: string;
  timegate: string;
  "cdx-api": string;
}

let crawlCache: CrawlInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function listCrawls(): Promise<CrawlInfo[]> {
  const now = Date.now();
  if (crawlCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return crawlCache;
  }

  const res = await fetchWithRetry("https://index.commoncrawl.org/collinfo.json", {
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch crawl list: ${res.status} ${res.statusText}`);
  }

  crawlCache = (await res.json()) as CrawlInfo[];
  cacheTimestamp = now;
  return crawlCache;
}

/**
 * Resolve a crawl parameter to a crawl ID.
 * - If "latest" or undefined, returns the most recent crawl ID.
 * - Otherwise returns the input as-is.
 */
export async function resolveCrawlId(crawl?: string): Promise<string> {
  if (!crawl || crawl === "latest") {
    const crawls = await listCrawls();
    if (crawls.length === 0) {
      throw new Error("No crawls available from Common Crawl");
    }
    return crawls[0].id;
  }
  return crawl;
}

/**
 * Build the CDX API base URL for a given crawl ID.
 */
export function cdxBaseUrl(crawlId: string): string {
  return `https://index.commoncrawl.org/${crawlId}-index`;
}
