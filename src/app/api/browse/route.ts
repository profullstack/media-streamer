/**
 * Browse API
 *
 * GET /api/browse - Browse torrents by content type with sorting and filtering
 *
 * FREE - No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, resetServerClient } from '@/lib/supabase/client';
import { createLogger, generateRequestId } from '@/lib/logger';
import { transformTorrents } from '@/lib/transforms';
import type { Torrent as DbTorrent } from '@/lib/supabase/types';

const logger = createLogger('API:browse');

/**
 * Valid content types for browsing
 */
const VALID_CONTENT_TYPES = ['movie', 'tvshow', 'music', 'book', 'xxx'] as const;
type ContentType = typeof VALID_CONTENT_TYPES[number];

/**
 * Valid sort fields
 */
const VALID_SORT_BY = ['date', 'seeders', 'leechers', 'size', 'name'] as const;
type SortBy = typeof VALID_SORT_BY[number];

/**
 * Valid sort orders
 */
const VALID_SORT_ORDER = ['asc', 'desc'] as const;
type SortOrder = typeof VALID_SORT_ORDER[number];

/**
 * Map sortBy parameter to database column
 */
const SORT_COLUMN_MAP: Record<SortBy, string> = {
  date: 'created_at',
  seeders: 'seeders',
  leechers: 'leechers',
  size: 'total_size',
  name: 'name',
};

/**
 * Check if an error is a network/connection error that warrants client reset
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('aborted')
    );
  }
  return false;
}

/**
 * GET /api/browse
 *
 * Browse torrents by content type with sorting and filtering.
 * FREE - No authentication required.
 *
 * Query parameters:
 * - contentType: string (required) - movie, tvshow, music, book
 * - q: string (optional) - Search query to filter by name
 * - year: number (optional) - Filter by release year
 * - sortBy: string (optional) - date, seeders, name, size (default: date)
 * - sortOrder: string (optional) - asc, desc (default: desc)
 * - limit: number (optional, default 50, max 100)
 * - offset: number (optional, default 0)
 *
 * Response:
 * - 200: List of torrents matching the content type
 * - 400: Invalid request parameters
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });

  const { searchParams } = new URL(request.url);

  // Extract and validate contentType
  const contentType = searchParams.get('contentType');
  if (!contentType) {
    return NextResponse.json(
      { error: 'contentType parameter is required' },
      { status: 400 }
    );
  }

  if (!VALID_CONTENT_TYPES.includes(contentType as ContentType)) {
    return NextResponse.json(
      { error: `Invalid contentType. Must be one of: ${VALID_CONTENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Extract and validate sortBy
  const sortBy = (searchParams.get('sortBy') ?? 'date') as SortBy;
  if (!VALID_SORT_BY.includes(sortBy)) {
    return NextResponse.json(
      { error: `Invalid sortBy. Must be one of: ${VALID_SORT_BY.join(', ')}` },
      { status: 400 }
    );
  }

  // Extract and validate sortOrder
  const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as SortOrder;
  if (!VALID_SORT_ORDER.includes(sortOrder)) {
    return NextResponse.json(
      { error: `Invalid sortOrder. Must be one of: ${VALID_SORT_ORDER.join(', ')}` },
      { status: 400 }
    );
  }

  // Extract optional filters
  const searchQuery = searchParams.get('q');
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  // Extract pagination
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  reqLogger.info('GET /api/browse', {
    contentType,
    sortBy,
    sortOrder,
    searchQuery,
    year,
    limit,
    offset,
  });

  try {
    const supabase = getServerClient();

    // Build query - cast contentType to the proper database type
    const dbContentType = contentType as 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other';
    let query = supabase
      .from('bt_torrents')
      .select('*', { count: 'exact' })
      .eq('content_type', dbContentType);

    // Apply search filter if provided
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Apply year filter if provided
    if (year && !isNaN(year)) {
      query = query.eq('year', year);
    }

    // Apply sorting
    const sortColumn = SORT_COLUMN_MAP[sortBy];
    const ascending = sortOrder === 'asc';
    query = query.order(sortColumn, { ascending, nullsFirst: false });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    reqLogger.debug('Executing Supabase query');
    const { data: torrents, error, count } = await query;

    if (error) {
      reqLogger.error('Failed to fetch torrents from database', error);
      if (isConnectionError(error)) {
        reqLogger.warn('Connection error detected, resetting Supabase client');
        resetServerClient();
      }
      return NextResponse.json(
        { error: 'Failed to fetch torrents', details: error.message },
        { status: 500 }
      );
    }

    reqLogger.info('Torrents fetched successfully', {
      count: torrents?.length ?? 0,
      total: count ?? 0,
    });

    // Transform to camelCase for frontend
    const transformedTorrents = transformTorrents((torrents ?? []) as DbTorrent[]);

    return NextResponse.json({
      torrents: transformedTorrents,
      total: count ?? 0,
      limit,
      offset,
      contentType,
      sortBy,
      sortOrder,
      filters: {
        q: searchQuery,
        year,
      },
    });
  } catch (error) {
    reqLogger.error('Browse API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
