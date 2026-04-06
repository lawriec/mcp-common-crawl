/**
 * Fetch wrapper with automatic retries and exponential backoff.
 *
 * Retries on transient failures: 429, 502, 503, 504, network errors,
 * and timeouts. Non-retryable errors (4xx except 429) throw immediately.
 */

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 60_000, ...fetchInit } = init ?? {};

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...fetchInit,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 206) {
        return res;
      }

      // Don't retry client errors (except 429)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return res; // Let caller handle 404 etc.
      }

      if (RETRYABLE_STATUS_CODES.has(res.status)) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff;

        if (attempt < MAX_RETRIES) {
          console.error(
            `[fetch-retry] ${res.status} ${res.statusText} for ${url} — retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(waitMs);
          continue;
        }
      }

      // Non-retryable or exhausted retries — return the response as-is
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
        console.error(
          `[fetch-retry] ${lastError.message} for ${url} — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoff);
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`);
}
