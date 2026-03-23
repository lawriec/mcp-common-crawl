/**
 * CDX API client for querying Common Crawl's index.
 */

import { cdxBaseUrl } from "./crawl-id.js";

export interface CdxRecord {
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  "mime-detected": string;
  status: string;
  digest: string;
  length: string;
  offset: string;
  filename: string;
  languages?: string;
  encoding?: string;
  charset?: string;
}

export interface CdxSearchParams {
  crawlId: string;
  url?: string;
  domain?: string;
  from?: string;
  to?: string;
  mimeType?: string;
  statusCode?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

/**
 * Query the CDX index. Returns parsed JSON records.
 */
export async function queryCdx(params: CdxSearchParams): Promise<CdxRecord[]> {
  const base = cdxBaseUrl(params.crawlId);
  const searchParams = new URLSearchParams({ output: "json" });

  // Build the URL query — domain search uses *.domain format
  if (params.domain) {
    searchParams.set("url", `*.${params.domain}`);
  } else if (params.url) {
    searchParams.set("url", params.url);
  } else {
    throw new Error("Either url or domain must be provided");
  }

  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.mimeType) searchParams.set("filter", `mime:${params.mimeType}`);
  if (params.statusCode) searchParams.set("filter", `status:${params.statusCode}`);

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  searchParams.set("limit", String(limit));

  const url = `${base}?${searchParams.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    if (res.status === 404) {
      return []; // No results
    }
    throw new Error(`CDX API error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text.trim()) return [];

  // CDX JSON output: each line is a complete JSON object (JSONL format)
  const lines = text.trim().split("\n");
  const records: CdxRecord[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as CdxRecord);
    } catch {
      // Skip malformed lines
    }
  }

  return records;
}
