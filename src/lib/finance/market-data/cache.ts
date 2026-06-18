/**
 * Finance — read-through cache for PUBLIC market data (PRD §4, §7).
 *
 * Backed by `finance_quotes_cache` (service-role writes only). Only public
 * market data is stored here — never per-user data. A cache miss or any cache
 * error falls back to the live fetch so the feature degrades gracefully.
 */

import { getServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/supabase';

const CACHE_TABLE = 'finance_quotes_cache';

/**
 * Default freshness windows (seconds). Quotes carry an intraday last price +
 * session, so the window is short to feel near-live; the shared cache bounds
 * upstream load to ~1 fetch per symbol per window regardless of viewer count.
 */
export const QUOTE_TTL_SECONDS = 30;
export const CANDLES_TTL_SECONDS = 60 * 60;
/** Fundamentals (valuation/perf/technicals) move slowly — cache for hours. */
export const FUNDAMENTALS_TTL_SECONDS = 6 * 60 * 60;

interface CacheRow<T> {
  payload: T;
  expires_at: string;
}

/**
 * Return cached `payload` for (symbol, cacheKey) when still fresh, otherwise
 * call `fetcher`, persist the result with a TTL, and return it.
 */
export async function readThrough<T>(
  symbol: string,
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const supabase = getServerClient();

  try {
    const { data } = await supabase
      .from(CACHE_TABLE)
      .select('payload, expires_at')
      .eq('symbol', symbol)
      .eq('cache_key', cacheKey)
      .maybeSingle<CacheRow<T>>();

    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      return data.payload;
    }
  } catch (error) {
    console.error('[finance/cache] read failed, fetching live:', error);
  }

  const fresh = await fetcher();

  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase
      .from(CACHE_TABLE)
      .upsert(
        {
          symbol,
          cache_key: cacheKey,
          payload: fresh as unknown as Json,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: 'symbol,cache_key' },
      );
  } catch (error) {
    console.error('[finance/cache] write failed (non-fatal):', error);
  }

  return fresh;
}
