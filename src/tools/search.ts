import { queryCdx } from "../utils/cdx.js";
import { resolveCrawlId } from "../utils/crawl-id.js";

export interface SearchArgs {
  url?: string;
  domain?: string;
  from?: string;
  to?: string;
  mime_type?: string;
  status_code?: string;
  limit?: number;
  crawl?: string;
}

export async function handleSearch(args: SearchArgs) {
  if (!args.url && !args.domain) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: either 'url' or 'domain' must be provided",
        },
      ],
      isError: true,
    };
  }

  try {
    const crawlId = await resolveCrawlId(args.crawl);
    const records = await queryCdx({
      crawlId,
      url: args.url,
      domain: args.domain,
      from: args.from,
      to: args.to,
      mimeType: args.mime_type,
      statusCode: args.status_code,
      limit: args.limit,
    });

    if (records.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No captures found in crawl ${crawlId}`,
          },
        ],
      };
    }

    const summary = records.map((r) => ({
      url: r.url,
      timestamp: r.timestamp,
      mime: r.mime,
      status: r.status,
      filename: r.filename,
      offset: r.offset,
      length: r.length,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${records.length} capture(s) in crawl ${crawlId}:\n\n${JSON.stringify(summary, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error searching CDX index: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
