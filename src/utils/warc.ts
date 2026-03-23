/**
 * WARC record fetching and decompression.
 *
 * Common Crawl stores captures as gzip-compressed WARC records on S3.
 * Given a filename, offset, and length from the CDX index, we do a range
 * request to fetch just that record, decompress it, and extract the HTTP
 * response body.
 */

import { gunzipSync } from "node:zlib";

const CC_DATA_BASE = "https://data.commoncrawl.org";

export interface WarcResult {
  /** HTTP status code from the archived response */
  status: number;
  /** HTTP headers from the archived response */
  headers: Record<string, string>;
  /** Response body (text content) or description for binary */
  body: string;
  /** Whether the body was truncated or is binary */
  isBinary: boolean;
  /** Content-Type from the archived response */
  contentType: string;
  /** Size of the raw body in bytes */
  bodySize: number;
}

const MAX_BODY_TEXT_LENGTH = 200_000; // ~200KB text limit

/**
 * Fetch and decompress a WARC record from Common Crawl's S3 storage.
 */
export async function fetchWarcRecord(
  filename: string,
  offset: string | number,
  length: string | number
): Promise<WarcResult> {
  const start = Number(offset);
  const end = start + Number(length) - 1;

  const res = await fetch(`${CC_DATA_BASE}/${filename}`, {
    headers: { Range: `bytes=${start}-${end}` },
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`WARC fetch failed: ${res.status} ${res.statusText}`);
  }

  const compressed = Buffer.from(await res.arrayBuffer());
  const decompressed = gunzipSync(compressed);
  const raw = decompressed.toString("utf-8");

  return parseWarcRecord(raw);
}

/**
 * Parse a decompressed WARC record into its components.
 *
 * Structure:
 *   WARC/1.0 header block (ends with \r\n\r\n)
 *   HTTP response header block (ends with \r\n\r\n)
 *   HTTP response body
 */
function parseWarcRecord(raw: string): WarcResult {
  // Split WARC header from the rest
  const warcHeaderEnd = raw.indexOf("\r\n\r\n");
  if (warcHeaderEnd === -1) {
    throw new Error("Invalid WARC record: no header boundary found");
  }

  const afterWarcHeader = raw.substring(warcHeaderEnd + 4);

  // Split HTTP header from body
  const httpHeaderEnd = afterWarcHeader.indexOf("\r\n\r\n");
  if (httpHeaderEnd === -1) {
    // Some records may only have WARC metadata (e.g., revisit records)
    return {
      status: 0,
      headers: {},
      body: afterWarcHeader.trim(),
      isBinary: false,
      contentType: "",
      bodySize: 0,
    };
  }

  const httpHeaderBlock = afterWarcHeader.substring(0, httpHeaderEnd);
  const body = afterWarcHeader.substring(httpHeaderEnd + 4);

  // Parse HTTP status line and headers
  const headerLines = httpHeaderBlock.split("\r\n");
  const statusLine = headerLines[0];
  const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

  const headers: Record<string, string> = {};
  for (let i = 1; i < headerLines.length; i++) {
    const colonIdx = headerLines[i].indexOf(":");
    if (colonIdx > 0) {
      const key = headerLines[i].substring(0, colonIdx).trim().toLowerCase();
      const value = headerLines[i].substring(colonIdx + 1).trim();
      headers[key] = value;
    }
  }

  const contentType = headers["content-type"] ?? "";
  const bodySize = Buffer.byteLength(body, "utf-8");

  // Check if content is binary
  const isTextType =
    contentType.includes("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("css");

  if (!isTextType && contentType !== "") {
    return {
      status,
      headers,
      body: `[Binary content: ${contentType}, ${bodySize} bytes]`,
      isBinary: true,
      contentType,
      bodySize,
    };
  }

  // Truncate very large text responses
  const truncated =
    body.length > MAX_BODY_TEXT_LENGTH
      ? body.substring(0, MAX_BODY_TEXT_LENGTH) +
        `\n\n[Truncated — showing first ${MAX_BODY_TEXT_LENGTH} of ${body.length} characters]`
      : body;

  return {
    status,
    headers,
    body: truncated,
    isBinary: false,
    contentType,
    bodySize,
  };
}
