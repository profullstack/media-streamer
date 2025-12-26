/**
 * File Search API
 * 
 * GET /api/search/files - Search for files within torrents
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchTorrentFiles } from '@/lib/torrent-index';
import type { MediaCategory } from '@/lib/supabase/types';

// Valid media types
const VALID_MEDIA_TYPES: MediaCategory[] = ['audio', 'video', 'ebook', 'document', 'other'];

/**
 * GET /api/search/files
 * 
 * Search for files within torrents.
 * 
 * Query parameters:
 * - q: string (required) - Search query
 * - mediaType: string (optional) - Filter by media type (audio, video, ebook, document, other)
 * - torrentId: string (optional) - Filter by specific torrent
 * - limit: number (optional, default 50, max 100) - Number of results
 * - offset: number (optional, default 0) - Pagination offset
 * 
 * Response:
 * - 200: Search results
 * - 400: Invalid request
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  
  // Get query parameter
  const query = searchParams.get('q');
  
  if (!query || query.trim() === '') {
    return NextResponse.json(
      { error: 'Search query (q) is required' },
      { status: 400 }
    );
  }

  // Get optional parameters
  const mediaType = searchParams.get('mediaType');
  const torrentId = searchParams.get('torrentId');
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  // Validate media type if provided
  if (mediaType && !VALID_MEDIA_TYPES.includes(mediaType as MediaCategory)) {
    return NextResponse.json(
      { error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Parse pagination parameters
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  // Validate pagination
  if (isNaN(limit) || limit < 0) {
    return NextResponse.json(
      { error: 'Invalid limit parameter' },
      { status: 400 }
    );
  }

  if (isNaN(offset) || offset < 0) {
    return NextResponse.json(
      { error: 'Invalid offset parameter' },
      { status: 400 }
    );
  }

  try {
    const result = await searchTorrentFiles({
      query,
      mediaType: mediaType as MediaCategory | undefined,
      torrentId: torrentId ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
