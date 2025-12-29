/**
 * Torrent Search API
 *
 * GET /api/search/torrents - Search for torrents by name
 *
 * FREE - No authentication required to encourage usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchTorrents } from '@/lib/supabase';
import type { MediaCategory, TorrentSearchResult } from '@/lib/supabase';

/**
 * Valid media types for filtering
 */
const VALID_MEDIA_TYPES: MediaCategory[] = ['audio', 'video', 'ebook', 'document', 'other'];

/**
 * Maximum allowed limit for pagination
 */
const MAX_LIMIT = 100;

/**
 * Default limit for pagination
 */
const DEFAULT_LIMIT = 50;

/**
 * Search API Response
 */
interface SearchResponse {
  query: string;
  results: TorrentSearchResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
  filters: {
    mediaType: string | null;
  };
}

/**
 * Error Response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/search/torrents
 *
 * Search for torrents by name and file contents.
 * FREE - No authentication required.
 *
 * Query Parameters:
 * - q: Search query (required)
 * - type: Media type filter (audio, video, ebook, document, other)
 * - limit: Maximum results to return (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 *
 * Response:
 * - 200: Search results
 * - 400: Invalid request
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse<SearchResponse | ErrorResponse>> {
  const searchParams = request.nextUrl.searchParams;

  // Extract and validate query parameter
  const query = searchParams.get('q')?.trim();
  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  // Extract and validate media type filter
  const mediaType = searchParams.get('type');
  if (mediaType && !VALID_MEDIA_TYPES.includes(mediaType as MediaCategory)) {
    return NextResponse.json(
      { error: `Invalid media type. Must be one of: ${VALID_MEDIA_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Extract and validate limit
  const limitParam = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit)) {
      return NextResponse.json(
        { error: 'Invalid limit. Must be a number.' },
        { status: 400 }
      );
    }
    if (parsedLimit > MAX_LIMIT) {
      return NextResponse.json(
        { error: `Limit cannot exceed ${MAX_LIMIT}` },
        { status: 400 }
      );
    }
    if (parsedLimit < 1) {
      return NextResponse.json(
        { error: 'Limit must be at least 1' },
        { status: 400 }
      );
    }
    limit = parsedLimit;
  }

  // Extract and validate offset
  const offsetParam = searchParams.get('offset');
  let offset = 0;
  if (offsetParam) {
    const parsedOffset = parseInt(offsetParam, 10);
    if (isNaN(parsedOffset)) {
      return NextResponse.json(
        { error: 'Invalid offset. Must be a number.' },
        { status: 400 }
      );
    }
    if (parsedOffset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      );
    }
    offset = parsedOffset;
  }

  // Perform search
  try {
    const results = await searchTorrents({
      query,
      mediaType: mediaType as MediaCategory | null,
      limit,
      offset,
    });

    // Determine if there are more results
    const hasMore = results.length === limit;

    return NextResponse.json({
      query,
      results,
      pagination: {
        limit,
        offset,
        count: results.length,
        hasMore,
      },
      filters: {
        mediaType,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
