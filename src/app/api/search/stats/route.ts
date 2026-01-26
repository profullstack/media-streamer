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
 * Stats Response
 */
interface StatsResponse {
  totalTorrents: number;
  userTorrents: number;
  dhtTorrents: number;
}

/**
 * Error Response
 */
interface ErrorResponse {
  error: string;
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

    // Get count from user torrents (bt_torrents)
    const { count: userCount, error: userError } = await client
      .from('bt_torrents')
      .select('*', { count: 'exact', head: true });

    if (userError) {
      console.error('User torrents count error:', userError);
      throw new Error(userError.message);
    }

    // Get count from DHT torrents (torrents table from Bitmagnet)
    // This table may not exist if DHT is not set up, so handle gracefully
    let dhtCount = 0;
    try {
      const { count, error: dhtError } = await client
        .from('torrents')
        .select('*', { count: 'exact', head: true });

      if (!dhtError && count !== null) {
        dhtCount = count;
      }
    } catch {
      // DHT table may not exist - that's OK
      console.log('DHT torrents table not available');
    }

    const totalTorrents = (userCount ?? 0) + dhtCount;

    return NextResponse.json({
      totalTorrents,
      userTorrents: userCount ?? 0,
      dhtTorrents: dhtCount,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}
