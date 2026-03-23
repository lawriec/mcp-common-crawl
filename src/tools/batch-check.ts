import { queryCdx } from "../utils/cdx.js";
import { resolveCrawlId } from "../utils/crawl-id.js";

export interface BatchCheckArgs {
  urls: string[];
  crawl?: string;
}

const DELAY_MS = 500; // Be respectful — half second between requests

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleBatchCheck(args: BatchCheckArgs) {
  if (!args.urls || args.urls.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: 'urls' array must contain at least one URL",
        },
      ],
      isError: true,
    };
  }

  if (args.urls.length > 100) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: maximum 100 URLs per batch check",
        },
      ],
      isError: true,
    };
  }

  try {
    const crawlId = await resolveCrawlId(args.crawl);
    const results: Record<string, number> = {};

    for (let i = 0; i < args.urls.length; i++) {
      if (i > 0) await sleep(DELAY_MS);

      try {
        const records = await queryCdx({
          crawlId,
          url: args.urls[i],
          limit: 1,
        });
        results[args.urls[i]] = records.length;
      } catch {
        results[args.urls[i]] = 0;
      }
    }

    const found = Object.values(results).filter((v) => v > 0).length;

    return {
      content: [
        {
          type: "text" as const,
          text: `Batch check results (crawl ${crawlId}): ${found}/${args.urls.length} URLs have captures\n\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error in batch check: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
