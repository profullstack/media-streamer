/**
 * DHT Browse API
 *
 * GET /api/dht/browse - Browse DHT-indexed torrents with sorting and pagination
 *
 * FREE - No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';

const VALID_SORT_BY = ['seeders', 'leechers', 'size', 'date', 'name'] as const;
type SortBy = typeof VALID_SORT_BY[number];

const VALID_SORT_ORDER = ['asc', 'desc'] as const;
type SortOrder = typeof VALID_SORT_ORDER[number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface DhtTorrent {
  id: string;
  infohash: string;
  name: string;
  magnet_uri: string;
  size: number;
  files_count: number;
  seeders: number;
  leechers: number;
  created_at: string;
  content_type: string | null;
  source: string;
}

/**
 * GET /api/dht/browse
 *
 * Query parameters:
 * - sortBy: seeders (default), leechers, size, date, name
 * - sortOrder: desc (default), asc
 * - category: optional content type filter
 * - limit: 1-100 (default 50)
 * - offset: pagination offset (default 0)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  // Validate sortBy
  const sortByParam = searchParams.get('sortBy') ?? 'seeders';
  if (!VALID_SORT_BY.includes(sortByParam as SortBy)) {
    return NextResponse.json(
      { error: `Invalid sortBy. Must be one of: ${VALID_SORT_BY.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate sortOrder
  const sortOrderParam = searchParams.get('sortOrder') ?? 'desc';
  if (!VALID_SORT_ORDER.includes(sortOrderParam as SortOrder)) {
    return NextResponse.json(
      { error: `Invalid sortOrder. Must be one of: ${VALID_SORT_ORDER.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate limit
  const limitParam = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return NextResponse.json(
        { error: `Limit must be between 1 and ${MAX_LIMIT}` },
        { status: 400 }
      );
    }
    limit = parsed;
  }

  // Validate offset
  const offsetParam = searchParams.get('offset');
  let offset = 0;
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: 'Offset must be a non-negative integer' },
        { status: 400 }
      );
    }
    offset = parsed;
  }

  // Optional category filter
  const category = searchParams.get('category') ?? null;

  try {
    const client = getServerClient();
    // browse_dht_torrents is a custom RPC not in generated Supabase types
    const { data, error } = await (client as unknown as { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc('browse_dht_torrents', {
      result_limit: limit,
      result_offset: offset,
      sort_by: sortByParam,
      sort_order: sortOrderParam,
      filter_category: category,
    });

    if (error) {
      console.error('DHT browse error:', error);
      return NextResponse.json(
        { error: 'Failed to browse DHT torrents' },
        { status: 500 }
      );
    }

    const results = (data ?? []) as unknown as DhtTorrent[];
    const hasMore = results.length === limit;

    return NextResponse.json({
      results,
      pagination: {
        limit,
        offset,
        count: results.length,
        hasMore,
      },
      filters: {
        sortBy: sortByParam,
        sortOrder: sortOrderParam,
        category,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('DHT browse error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
