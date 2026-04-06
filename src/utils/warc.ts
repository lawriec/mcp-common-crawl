/**
 * WARC record fetching and decompression.
 *
 * Common Crawl stores captures as gzip-compressed WARC records on S3.
 * Given a filename, offset, and length from the CDX index, we do a range
 * request to fetch just that record, decompress it, and extract the HTTP
 * response body.
 */

import { gunzipSync } from "node:zlib";
import { fetchWithRetry } from "./fetch-retry.js";

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

  const res = await fetchWithRetry(`${CC_DATA_BASE}/${filename}`, {
    headers: { Range: `bytes=${start}-${end}` },
    timeoutMs: 60_000,
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
 * Parse a decompressed record into its components.
 * Handles both WARC format (newer crawls) and ARC format (2008-2012 era crawls).
 *
 * WARC structure:
 *   WARC/1.0 header block (ends with \r\n\r\n)
 *   HTTP response header block (ends with \r\n\r\n)
 *   HTTP response body
 *
 * ARC structure:
 *   Single metadata line: url ip timestamp mime length\n
 *   HTTP response header block (ends with \n\n)
 *   HTTP response body
 */
function parseWarcRecord(raw: string): WarcResult {
  const isWarc = raw.startsWith("WARC/");

  let afterArchiveHeader: string;
  if (isWarc) {
    // WARC: header block ends with \r\n\r\n
    const warcHeaderEnd = raw.indexOf("\r\n\r\n");
    if (warcHeaderEnd === -1) {
      throw new Error("Invalid WARC record: no header boundary found");
    }
    afterArchiveHeader = raw.substring(warcHeaderEnd + 4);
  } else {
    // ARC: single metadata line (url ip timestamp mime length) ending with \n
    // The HTTP response follows on the next line
    const firstNewline = raw.indexOf("\n");
    if (firstNewline === -1) {
      throw new Error("Invalid ARC record: no newline found");
    }
    afterArchiveHeader = raw.substring(firstNewline + 1);
  }

  // The HTTP response always uses \r\n line endings regardless of archive format
  const httpHeaderEnd = afterArchiveHeader.indexOf("\r\n\r\n");
  if (httpHeaderEnd === -1) {
    // Fallback: try \n\n
    const altEnd = afterArchiveHeader.indexOf("\n\n");
    if (altEnd === -1) {
      return {
        status: 0,
        headers: {},
        body: afterArchiveHeader.trim(),
        isBinary: false,
        contentType: "",
        bodySize: 0,
      };
    }
    const httpBlock = afterArchiveHeader.substring(0, altEnd);
    const body = afterArchiveHeader.substring(altEnd + 2);
    return parseHttpResponse(httpBlock, body, "\n");
  }

  const httpHeaderBlock = afterArchiveHeader.substring(0, httpHeaderEnd);
  const body = afterArchiveHeader.substring(httpHeaderEnd + 4);

  return parseHttpResponse(httpHeaderBlock, body, "\r\n");
}

function parseHttpResponse(
  httpHeaderBlock: string,
  body: string,
  lineSep: string
): WarcResult {
  // Parse HTTP status line and headers
  const headerLines = httpHeaderBlock.split(lineSep);
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
