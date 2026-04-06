import { queryCdx } from "../utils/cdx.js";
import { resolveCrawlId } from "../utils/crawl-id.js";
import { fetchWarcRecord } from "../utils/warc.js";

export interface FetchArgs {
  url: string;
  timestamp?: string;
  crawl?: string;
}

/**
 * High-level retry count for the full CDX-lookup → WARC-fetch pipeline.
 * Each attempt already uses fetchWithRetry internally (5 low-level retries),
 * but the CDX API is flaky enough that the whole pipeline sometimes needs
 * a fresh attempt.
 */
const PIPELINE_RETRIES = 3;
const PIPELINE_BACKOFF_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleFetch(args: FetchArgs) {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= PIPELINE_RETRIES; attempt++) {
    try {
      const result = await fetchOnce(args);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry "no captures found" — that's a definitive answer
      if (lastError.message.includes("No captures found")) {
        return {
          content: [
            { type: "text" as const, text: lastError.message },
          ],
        };
      }

      if (attempt < PIPELINE_RETRIES) {
        const waitMs = PIPELINE_BACKOFF_MS * 2 ** attempt;
        console.error(
          `[cc_fetch] Pipeline attempt ${attempt + 1}/${PIPELINE_RETRIES + 1} failed: ${lastError.message} — retrying in ${waitMs}ms`
        );
        await sleep(waitMs);
      }
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Error fetching WARC record after ${PIPELINE_RETRIES + 1} attempts: ${lastError!.message}`,
      },
    ],
    isError: true,
  };
}

async function fetchOnce(args: FetchArgs) {
  const crawlId = await resolveCrawlId(args.crawl);

  const records = await queryCdx({
    crawlId,
    url: args.url,
    limit: 1,
  });

  if (records.length === 0) {
    throw new Error(`No captures found for ${args.url} in crawl ${crawlId}`);
  }

  // If a specific timestamp was requested, find the matching record
  let record = records[0];
  if (args.timestamp) {
    const match = records.find((r) => r.timestamp === args.timestamp);
    if (match) record = match;
  }

  const result = await fetchWarcRecord(
    record.filename,
    record.offset,
    record.length
  );

  const header = [
    `URL: ${record.url}`,
    `Timestamp: ${record.timestamp}`,
    `HTTP Status: ${result.status}`,
    `Content-Type: ${result.contentType}`,
    `Body Size: ${result.bodySize} bytes`,
    result.isBinary ? "(Binary content — metadata only)" : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text: `${header}\n\n---\n\n${result.body}`,
      },
    ],
  };
}
