import { queryCdx } from "../utils/cdx.js";
import { resolveCrawlId } from "../utils/crawl-id.js";

export interface DomainSummaryArgs {
  domain: string;
  from?: string;
  to?: string;
  crawl?: string;
}

export async function handleDomainSummary(args: DomainSummaryArgs) {
  if (!args.domain) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: 'domain' is required",
        },
      ],
      isError: true,
    };
  }

  try {
    const crawlId = await resolveCrawlId(args.crawl);

    // Fetch a larger sample to compute stats
    const records = await queryCdx({
      crawlId,
      domain: args.domain,
      from: args.from,
      to: args.to,
      limit: 1000,
    });

    if (records.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No captures found for domain ${args.domain} in crawl ${crawlId}`,
          },
        ],
      };
    }

    // Compute stats
    const mimeCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    let minTimestamp = records[0].timestamp;
    let maxTimestamp = records[0].timestamp;

    for (const r of records) {
      mimeCount[r.mime] = (mimeCount[r.mime] ?? 0) + 1;
      statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
      if (r.timestamp < minTimestamp) minTimestamp = r.timestamp;
      if (r.timestamp > maxTimestamp) maxTimestamp = r.timestamp;
    }

    // Sort by count descending
    const topMimes = Object.entries(mimeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const topStatuses = Object.entries(statusCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const summary = {
      domain: args.domain,
      crawl: crawlId,
      totalCaptures: records.length,
      note:
        records.length === 1000
          ? "Results capped at 1000 — actual total may be higher"
          : undefined,
      dateRange: {
        earliest: minTimestamp,
        latest: maxTimestamp,
      },
      topMimeTypes: Object.fromEntries(topMimes),
      topStatusCodes: Object.fromEntries(topStatuses),
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting domain summary: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
