import { listCrawls } from "../utils/crawl-id.js";

export async function handleListCrawls() {
  try {
    const crawls = await listCrawls();

    const summary = crawls.map((c) => ({
      id: c.id,
      name: c.name,
      cdxApi: c["cdx-api"],
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: `${crawls.length} crawls available:\n\n${JSON.stringify(summary, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error listing crawls: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
