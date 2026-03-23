#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleSearch,
  handleFetch,
  handleListCrawls,
  handleBatchCheck,
  handleDomainSummary,
} from "./tools/index.js";

const server = new Server(
  { name: "common-crawl", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "cc_search",
      description:
        "Search Common Crawl's CDX index for archived captures of a URL or domain. " +
        "Returns capture metadata (URL, timestamp, MIME type, status code, WARC location). " +
        "Use the WARC location fields (filename, offset, length) with cc_fetch to retrieve content.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "Exact URL or URL prefix to search for (e.g. 'example.com/page.html' or 'example.com/*'). " +
              "Mutually exclusive with 'domain'.",
          },
          domain: {
            type: "string",
            description:
              "Domain to search across all subdomains (e.g. 'example.com' searches *.example.com). " +
              "Mutually exclusive with 'url'.",
          },
          from: {
            type: "string",
            description:
              "Start date filter in YYYYMMDD format (e.g. '20150101')",
          },
          to: {
            type: "string",
            description:
              "End date filter in YYYYMMDD format (e.g. '20201231')",
          },
          mime_type: {
            type: "string",
            description:
              "Filter by MIME type (e.g. 'text/html', 'application/pdf')",
          },
          status_code: {
            type: "string",
            description: "Filter by HTTP status code (e.g. '200', '301')",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of results to return (default 50, max 1000)",
          },
          crawl: {
            type: "string",
            description:
              "Specific crawl ID (e.g. 'CC-MAIN-2024-10') or 'latest' (default). " +
              "Use cc_list_crawls to see available crawls.",
          },
        },
      },
    },
    {
      name: "cc_fetch",
      description:
        "Fetch the actual page content from a Common Crawl WARC archive. " +
        "Retrieves and decompresses the archived HTTP response for a given URL. " +
        "For text content, returns the full body. For binary content, returns metadata only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch from the archive",
          },
          timestamp: {
            type: "string",
            description:
              "Specific capture timestamp from cc_search results (e.g. '20200315120000'). " +
              "If omitted, fetches the first available capture.",
          },
          crawl: {
            type: "string",
            description:
              "Specific crawl ID or 'latest' (default)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "cc_list_crawls",
      description:
        "List all available Common Crawl datasets with their IDs and date ranges. " +
        "New crawls are released approximately monthly. " +
        "Use crawl IDs with other tools to search specific time periods.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "cc_batch_check",
      description:
        "Check which URLs from a list have been captured by Common Crawl. " +
        "Returns a map of URL → capture count. " +
        "Useful for checking a batch of dead links from a forum thread. Max 100 URLs.",
      inputSchema: {
        type: "object" as const,
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Array of URLs to check (max 100)",
          },
          crawl: {
            type: "string",
            description:
              "Specific crawl ID or 'latest' (default)",
          },
        },
        required: ["urls"],
      },
    },
    {
      name: "cc_domain_summary",
      description:
        "Get capture statistics for a domain in Common Crawl: " +
        "total pages archived, date range, top content types, top status codes. " +
        "Helps decide whether it's worth digging deeper into a domain's archived content.",
      inputSchema: {
        type: "object" as const,
        properties: {
          domain: {
            type: "string",
            description: "Domain to summarize (e.g. 'example.com')",
          },
          from: {
            type: "string",
            description: "Start date filter in YYYYMMDD format",
          },
          to: {
            type: "string",
            description: "End date filter in YYYYMMDD format",
          },
          crawl: {
            type: "string",
            description:
              "Specific crawl ID or 'latest' (default)",
          },
        },
        required: ["domain"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "cc_search":
      return handleSearch(
        args as {
          url?: string;
          domain?: string;
          from?: string;
          to?: string;
          mime_type?: string;
          status_code?: string;
          limit?: number;
          crawl?: string;
        }
      );
    case "cc_fetch":
      return handleFetch(
        args as {
          url: string;
          timestamp?: string;
          crawl?: string;
        }
      );
    case "cc_list_crawls":
      return handleListCrawls();
    case "cc_batch_check":
      return handleBatchCheck(
        args as {
          urls: string[];
          crawl?: string;
        }
      );
    case "cc_domain_summary":
      return handleDomainSummary(
        args as {
          domain: string;
          from?: string;
          to?: string;
          crawl?: string;
        }
      );
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("common-crawl MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
