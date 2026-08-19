/**
 * One upstream fetch, many listeners.
 *
 * This is what makes restreaming safe. A resale share serves several buyers from a
 * single account, and if each listener opened their own upstream connection the
 * provider would see concurrent use from one subscription — which is precisely
 * what gets an account flagged, and for SiriusXM the sessions are pinned to one IP
 * so it is unmistakable.
 *
 * HLS makes the fix simple: every listener asks for the same manifest and the same
 * numbered segments, a moment apart. So requests are deduplicated two ways:
 *
 *   - In flight: N simultaneous requests for one URL share a single promise, so
 *     ten listeners hitting the same segment cause one upstream fetch.
 *   - Just after: the bytes are held briefly, so a listener a second behind is
 *     served from memory instead of going upstream again.
 *
 * The cache is deliberately small and short-lived. It exists to collapse
 * concurrent demand for the same bytes, not to store a broadcast — a live stream
 * that is served stale is worse than one that is slow.
 */

interface Entry {
  body: ArrayBuffer;
  contentType: string | null;
  status: number;
  expiresAt: number;
  bytes: number;
}

/** A manifest changes every few seconds; a segment is immutable once published. */
const MANIFEST_TTL_MS = 2_000;
const SEGMENT_TTL_MS = 30_000;

/** Enough for a handful of shares' worth of live segments, not a library. */
const MAX_BYTES = 64 * 1024 * 1024;

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry>>();
let heldBytes = 0;

function isManifest(contentType: string | null, url: string): boolean {
  const t = (contentType ?? '').toLowerCase();
  return t.includes('mpegurl') || url.includes('.m3u8');
}

/** Drop what has expired, then the oldest, until we are back under the ceiling. */
function evict(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
      heldBytes -= entry.bytes;
    }
  }
  if (heldBytes <= MAX_BYTES) return;
  for (const [key, entry] of cache) {
    cache.delete(key);
    heldBytes -= entry.bytes;
    if (heldBytes <= MAX_BYTES) break;
  }
}

export interface SharedFetchResult {
  body: ArrayBuffer;
  contentType: string | null;
  status: number;
  /** True when this call did not touch the provider. */
  cached: boolean;
}

/**
 * Fetch a URL at most once for all concurrent callers.
 *
 * @param key   what identifies these bytes — the upstream URL
 * @param fetcher performs the real request; only ever called once per key at a time
 */
export async function sharedFetch(
  key: string,
  fetcher: () => Promise<{ body: ArrayBuffer; contentType: string | null; status: number }>,
): Promise<SharedFetchResult> {
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { body: hit.body, contentType: hit.contentType, status: hit.status, cached: true };
  }

  const pending = inFlight.get(key);
  if (pending) {
    const entry = await pending;
    return { body: entry.body, contentType: entry.contentType, status: entry.status, cached: true };
  }

  const promise = (async (): Promise<Entry> => {
    const res = await fetcher();
    const ttl = isManifest(res.contentType, key) ? MANIFEST_TTL_MS : SEGMENT_TTL_MS;
    const entry: Entry = {
      body: res.body,
      contentType: res.contentType,
      status: res.status,
      expiresAt: Date.now() + ttl,
      bytes: res.body.byteLength,
    };
    // Only cache what is worth re-serving: an error must not be pinned for 30s.
    if (res.status >= 200 && res.status < 300) {
      cache.set(key, entry);
      heldBytes += entry.bytes;
      evict();
    }
    return entry;
  })();

  inFlight.set(key, promise);
  try {
    const entry = await promise;
    return { body: entry.body, contentType: entry.contentType, status: entry.status, cached: false };
  } finally {
    inFlight.delete(key);
  }
}

/** For tests and diagnostics. */
export function cacheStats(): { entries: number; bytes: number; inFlight: number } {
  return { entries: cache.size, bytes: heldBytes, inFlight: inFlight.size };
}

export function resetCache(): void {
  cache.clear();
  inFlight.clear();
  heldBytes = 0;
}
