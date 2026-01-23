/**
 * Search API
 *
 * GET /api/search - Search for torrents across user-submitted and DHT sources
 *
 * FREE - No authentication required to encourage usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';
import { searchFiles } from '@/lib/supabase';
import type { MediaCategory } from '@/lib/supabase';

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
 * Torrent search result from unified search
 */
interface TorrentResult {
  id: string;
  infohash: string;
  name: string;
  magnet_uri: string;
  size: number;
  files_count: number;
  seeders: number;
  leechers: number;
  created_at: string;
  poster_url: string | null;
  cover_url: string | null;
  content_type: string | null;
  source: 'user' | 'dht';
}

/**
 * File search result
 */
interface FileResult {
  file_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_media_category: string;
  file_index: number;
  torrent_id: string;
  torrent_name: string;
  torrent_infohash: string;
  torrent_poster_url: string | null;
  torrent_cover_url: string | null;
  torrent_clean_title: string | null;
  rank: number;
}

/**
 * Search API Response for torrents
 */
interface TorrentSearchResponse {
  query: string;
  mode: 'torrents';
  results: TorrentResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}

/**
 * Search API Response for files
 */
interface FileSearchResponse {
  query: string;
  mode: 'files';
  results: FileResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
  filters: {
    mediaType: string | null;
    torrentId: string | null;
  };
}

type SearchResponse = TorrentSearchResponse | FileSearchResponse;

/**
 * Error Response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/search
 *
 * Search for torrents or files.
 * FREE - No authentication required.
 *
 * Query Parameters:
 * - q: Search query (required)
 * - mode: Search mode - 'torrents' (default) or 'files'
 * - type: Media type filter for file search (audio, video, ebook, document, other)
 * - torrent: Torrent ID to search within (forces file mode)
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

  // Extract search mode (default to torrents)
  const modeParam = searchParams.get('mode') ?? 'torrents';
  const torrentId = searchParams.get('torrent');

  // If torrent filter is specified, force file mode
  const mode = torrentId ? 'files' : modeParam;

  // Extract and validate media type filter (only for file mode)
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

  try {
    // Torrent search mode - searches both bt_torrents and Bitmagnet's DHT torrents
    if (mode === 'torrents') {
      const supabase = getServerClient();

      const { data, error } = await supabase.rpc('search_all_torrents', {
        search_query: query,
        result_limit: limit,
        result_offset: offset,
      });

      if (error) {
        console.error('Torrent search error:', error);
        return NextResponse.json(
          { error: 'Search failed' },
          { status: 500 }
        );
      }

      const results: TorrentResult[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        infohash: row.infohash as string,
        name: row.name as string,
        magnet_uri: row.magnet_uri as string,
        size: Number(row.size),
        files_count: Number(row.files_count),
        seeders: Number(row.seeders ?? 0),
        leechers: Number(row.leechers ?? 0),
        created_at: row.created_at as string,
        poster_url: row.poster_url as string | null,
        cover_url: row.cover_url as string | null,
        content_type: row.content_type as string | null,
        source: row.source as 'user' | 'dht',
      }));

      const hasMore = results.length === limit;

      return NextResponse.json({
        query,
        mode: 'torrents' as const,
        results,
        pagination: {
          limit,
          offset,
          count: results.length,
          hasMore,
        },
      });
    }

    // File search mode - searches bt_torrent_files
    const results = await searchFiles({
      query,
      mediaType: mediaType as MediaCategory | null,
      torrentId,
      limit,
      offset,
    });

    const hasMore = results.length === limit;

    return NextResponse.json({
      query,
      mode: 'files' as const,
      results,
      pagination: {
        limit,
        offset,
        count: results.length,
        hasMore,
      },
      filters: {
        mediaType,
        torrentId,
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
