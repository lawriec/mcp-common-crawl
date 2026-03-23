import { queryCdx } from "../utils/cdx.js";
import { resolveCrawlId } from "../utils/crawl-id.js";
import { fetchWarcRecord } from "../utils/warc.js";

export interface FetchArgs {
  url: string;
  timestamp?: string;
  crawl?: string;
}

export async function handleFetch(args: FetchArgs) {
  try {
    const crawlId = await resolveCrawlId(args.crawl);

    // If timestamp is provided, search for that exact capture
    // Otherwise get the most recent capture of this URL
    const records = await queryCdx({
      crawlId,
      url: args.url,
      limit: args.timestamp ? 1 : 1,
    });

    if (records.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No captures found for ${args.url} in crawl ${crawlId}`,
          },
        ],
      };
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
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error fetching WARC record: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
