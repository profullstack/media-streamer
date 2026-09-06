/**
 * Search Stats API
 *
 * GET /api/search/stats - Get torrent statistics including total count
 *
 * FREE - No authentication required.
 */

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

/**
 * How old a cached exact count may be before we stop trusting it.
 *
 * The pg_cron job refreshes every 6 hours, so anything past a day means the job
 * has stopped and the number is frozen. A frozen count is worse than the planner
 * estimate, which at least still tracks growth, so we fall back past this age.
 */
const COUNT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Where the DHT number came from, so a wrong total can be diagnosed from the
 * response instead of from the database.
 */
type DhtCountSource = 'cache' | 'estimate' | 'unavailable';

/**
 * Stats Response
 */
interface StatsResponse {
  totalTorrents: number;
  userTorrents: number;
  dhtTorrents: number;
  dhtCountSource: DhtCountSource;
  dhtCountedAt: string | null;
}

/**
 * Error Response
 */
interface ErrorResponse {
  error: string;
}

/**
 * Read the exact count written by the `refresh-dht-torrent-count` pg_cron job.
 *
 * Returns null when the cache is missing, empty or stale, which puts the caller
 * back on the estimate.
 */
async function readCachedDhtCount(
  client: ReturnType<typeof getServerClient>
): Promise<{ count: number; countedAt: string } | null> {
  const { data, error } = await client
    .from('bt_torrent_count_cache')
    .select('exact_count, counted_at')
    .eq('id', 'dht')
    .maybeSingle();

  if (error) {
    console.error('DHT count cache read error:', error);
    return null;
  }
  if (!data) return null;

  const age = Date.now() - new Date(data.counted_at).getTime();
  if (!Number.isFinite(age) || age > COUNT_CACHE_MAX_AGE_MS) {
    console.warn(
      `DHT count cache is stale (${Math.round(age / 3_600_000)}h old) - the refresh job may have stopped.`
    );
    return null;
  }

  return { count: Number(data.exact_count), countedAt: data.counted_at };
}

/**
 * Planner row estimate for public.torrents.
 *
 * Fallback only. This is `reltuples` scaled by page growth, not a count: it
 * drifts between ANALYZE runs and can move down while the table grows. The
 * migration that added the cache also tightened the ANALYZE cadence on that
 * table so this stays close to the truth when it is used.
 */
async function readEstimatedDhtCount(
  client: ReturnType<typeof getServerClient>
): Promise<number | null> {
  try {
    const { count, error } = await client
      .from('torrents')
      .select('*', { count: 'estimated', head: true });

    if (error) {
      // Log loudly - do not let a genuine failure masquerade as an empty DHT.
      console.error('DHT torrents count error:', error);
      return null;
    }
    return count ?? null;
  } catch (err) {
    // DHT table may not exist - that's OK
    console.log('DHT torrents table not available', err);
    return null;
  }
}

/**
 * GET /api/search/stats
 *
 * Get torrent statistics including counts from user and DHT sources.
 * FREE - No authentication required.
 *
 * Response:
 * - 200: Statistics object with counts
 * - 500: Server error
 */
export async function GET(): Promise<NextResponse<StatsResponse | ErrorResponse>> {
  try {
    const client = getServerClient();

    // Get count from user torrents (bt_torrents). Small table, count it exactly.
    const { count: userCount, error: userError } = await client
      .from('bt_torrents')
      .select('*', { count: 'exact', head: true });

    if (userError) {
      console.error('User torrents count error:', userError);
      throw new Error(userError.message);
    }

    // Prefer the real count; fall back to the planner estimate.
    const cached = await readCachedDhtCount(client);

    let dhtCount = 0;
    let dhtCountSource: DhtCountSource = 'unavailable';
    let dhtCountedAt: string | null = null;

    if (cached) {
      dhtCount = cached.count;
      dhtCountSource = 'cache';
      dhtCountedAt = cached.countedAt;
    } else {
      const estimated = await readEstimatedDhtCount(client);
      if (estimated !== null) {
        dhtCount = estimated;
        dhtCountSource = 'estimate';
      }
    }

    const totalTorrents = (userCount ?? 0) + dhtCount;

    return NextResponse.json({
      totalTorrents,
      userTorrents: userCount ?? 0,
      dhtTorrents: dhtCount,
      dhtCountSource,
      dhtCountedAt,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}
