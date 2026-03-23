# mcp-common-crawl

MCP server for searching and extracting content from [Common Crawl](https://commoncrawl.org/) web archives. Common Crawl archives petabytes of web crawl data going back to 2008, capturing pages the Wayback Machine may have missed.

## Tools

| Tool | Description |
|------|-------------|
| **cc_search** | Search the CDX index for archived captures of a URL or domain. Filter by date range, MIME type, status code. |
| **cc_fetch** | Retrieve the actual page content from a WARC archive. Given a URL (and optional timestamp from cc_search), decompresses and returns the archived page. |
| **cc_list_crawls** | List available Common Crawl datasets and their date ranges. New crawls are released ~monthly. |
| **cc_batch_check** | Check which URLs from a list have been captured. Useful for checking a batch of dead links. Max 100 URLs. |
| **cc_domain_summary** | Get capture statistics for a domain: total pages, date range, content types, status codes. |

## Installation

### Claude Code Plugin

Add to your `.mcp.json`:

```json
{
  "common-crawl": {
    "command": "npx",
    "args": ["-y", "github:lawriec/mcp-common-crawl"]
  }
}
```

### Manual

```bash
git clone https://github.com/lawriec/mcp-common-crawl.git
cd mcp-common-crawl
npm install
npm run build
node build/index.js
```

## Usage Examples

### Search for captures of a specific URL
```
cc_search(url: "example.com/page.html")
```

### Search across a whole domain
```
cc_search(domain: "example.com", from: "20150101", to: "20201231")
```

### Fetch archived page content
```
cc_fetch(url: "example.com/page.html", timestamp: "20200315120000")
```

### Check multiple dead links at once
```
cc_batch_check(urls: ["example.com/a", "example.com/b", "example.com/c"])
```

### Check if a dead domain was crawled
```
cc_domain_summary(domain: "example.com")
```

## How It Works

Common Crawl provides two key APIs:

1. **CDX Index API** — Search for which URLs were captured, when, and where the data is stored
2. **WARC Data on S3** — The actual archived pages, stored as gzip-compressed WARC records

This server queries the CDX index to find captures, then does HTTP range requests to S3 to fetch and decompress individual WARC records — returning just the page content you need without downloading entire crawl datasets.

## Rate Limiting

The server respects Common Crawl's infrastructure:
- 500ms delay between batch check requests
- Default result limit of 50 (max 1000) per search
- Crawl list cached for 1 hour

## No API Key Required

Common Crawl is free and open. No authentication needed.
