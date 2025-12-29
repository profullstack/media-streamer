/**
 * Metadata API Route
 *
 * GET /api/metadata - Search for metadata from external APIs
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildMusicBrainzUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  parseMusicBrainzResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
  type MetadataType,
} from '@/lib/metadata';

/**
 * Metadata search response
 */
interface MetadataSearchResponse {
  type: MetadataType;
  query: string;
  results: unknown[];
  source: string;
  error?: string;
}

/**
 * GET /api/metadata
 * Search for metadata from external APIs
 * 
 * Query params:
 * - q: Search query (required)
 * - type: Metadata type (music, book, movie, tvshow) (required)
 * - limit: Maximum results (optional, default 10)
 */
export async function GET(request: NextRequest): Promise<NextResponse<MetadataSearchResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const type = searchParams.get('type') as MetadataType | null;
  const limit = parseInt(searchParams.get('limit') ?? '10', 10);

  // Validate required params
  if (!query) {
    return NextResponse.json(
      { type: 'music', query: '', results: [], source: '', error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  if (!type || !['music', 'book', 'movie', 'tvshow'].includes(type)) {
    return NextResponse.json(
      { type: 'music', query, results: [], source: '', error: 'Valid type parameter (music, book, movie, tvshow) is required' },
      { status: 400 }
    );
  }

  try {
    switch (type) {
      case 'music': {
        const url = buildMusicBrainzUrl('recording', query, limit);
        const response = await fetch(url, {
          headers: {
            'User-Agent': process.env.MUSICBRAINZ_USER_AGENT ?? 'BitTorrented/1.0.0',
          },
        });

        if (!response.ok) {
          throw new Error(`MusicBrainz API error: ${response.status}`);
        }

        const data = await response.json();
        const results = parseMusicBrainzResponse(data, 'recording');

        return NextResponse.json({
          type,
          query,
          results,
          source: 'musicbrainz',
        });
      }

      case 'book': {
        const url = buildOpenLibraryUrl(query, limit);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Open Library API error: ${response.status}`);
        }

        const data = await response.json();
        const results = parseOpenLibraryResponse(data);

        return NextResponse.json({
          type,
          query,
          results: results.slice(0, limit),
          source: 'openlibrary',
        });
      }

      case 'movie': {
        const apiKey = process.env.OMDB_API_KEY;
        if (!apiKey) {
          return NextResponse.json({
            type,
            query,
            results: [],
            source: 'omdb',
            error: 'OMDb API key not configured',
          });
        }

        const url = buildOMDbUrl(query, apiKey);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`OMDb API error: ${response.status}`);
        }

        const data = await response.json();
        const results = parseOMDbResponse(data);

        return NextResponse.json({
          type,
          query,
          results: results.slice(0, limit),
          source: 'omdb',
        });
      }

      case 'tvshow': {
        // Use OMDb for TV shows (type='series')
        const apiKey = process.env.OMDB_API_KEY;
        if (!apiKey) {
          return NextResponse.json({
            type,
            query,
            results: [],
            source: 'omdb',
            error: 'OMDb API key not configured',
          });
        }

        // OMDb supports type='series' for TV shows
        const url = buildOMDbUrl(query, apiKey, undefined, 'series');
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`OMDb API error: ${response.status}`);
        }

        const data = await response.json();
        const results = parseOMDbResponse(data);

        return NextResponse.json({
          type,
          query,
          results: results.slice(0, limit),
          source: 'omdb',
        });
      }

      default:
        return NextResponse.json(
          { type, query, results: [], source: '', error: 'Unknown metadata type' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Metadata search error:', error);
    return NextResponse.json(
      { 
        type, 
        query, 
        results: [], 
        source: type === 'music' ? 'musicbrainz' : type === 'book' ? 'openlibrary' : type === 'movie' ? 'omdb' : 'thetvdb',
        error: 'Failed to fetch metadata' 
      },
      { status: 500 }
    );
  }
}
