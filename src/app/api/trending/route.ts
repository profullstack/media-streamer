/**
 * Trending API Route
 *
 * GET /api/trending - Fetch trending/popular content from multiple sources
 *
 * Returns separate sections for:
 * - movies: Trending movies from TheTVDB
 * - tv: Trending TV shows from TheTVDB
 * - torrents: Popular torrents from our database
 *
 * Query parameters:
 * - section: 'movies' | 'tv' | 'torrents' | 'all' (default: 'all')
 * - page: number (default: 1)
 * - details: 'true' | 'false' (default: 'false') - Include full details (cast, crew, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTrendingMovies,
  fetchTrendingTVShows,
  fetchTrendingWithDetails,
  fetchPopularContent,
  type TheTVDBTrendingResult,
  type TrendingResult,
} from '@/lib/trending';

/**
 * Valid section options
 */
const VALID_SECTIONS = ['movies', 'tv', 'torrents', 'all'] as const;
type Section = (typeof VALID_SECTIONS)[number];

/**
 * Type guard for section
 */
function isValidSection(value: string): value is Section {
  return VALID_SECTIONS.includes(value as Section);
}

/**
 * Section result with optional error
 */
interface SectionResult<T> {
  items: T extends TheTVDBTrendingResult ? TheTVDBTrendingResult['items'] : TrendingResult['items'];
  page: number;
  totalPages: number;
  totalResults: number;
  error?: string;
}

/**
 * Full trending response
 */
interface TrendingResponse {
  movies?: SectionResult<TheTVDBTrendingResult>;
  tv?: SectionResult<TheTVDBTrendingResult>;
  torrents?: SectionResult<TrendingResult>;
}

/**
 * Create empty section result with error
 */
function createEmptyResult(error: string): SectionResult<TheTVDBTrendingResult> {
  return {
    items: [],
    page: 1,
    totalPages: 0,
    totalResults: 0,
    error,
  };
}

/**
 * GET /api/trending
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const sectionParam = searchParams.get('section') ?? 'all';
  const pageParam = searchParams.get('page') ?? '1';
  const detailsParam = searchParams.get('details') ?? 'false';

  // Validate section
  if (!isValidSection(sectionParam)) {
    return NextResponse.json(
      { error: `Invalid section. Must be one of: ${VALID_SECTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  // Parse and validate page
  const page = parseInt(pageParam, 10);
  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page. Must be a positive integer.' }, { status: 400 });
  }

  const includeDetails = detailsParam === 'true';
  const response: TrendingResponse = {};

  // Get TheTVDB API key from environment
  const thetvdbApiKey = process.env.THETVDB_API_KEY;

  // Fetch movies section
  if (sectionParam === 'all' || sectionParam === 'movies') {
    if (!thetvdbApiKey) {
      response.movies = createEmptyResult('THETVDB_API_KEY is not configured');
    } else {
      try {
        if (includeDetails) {
          response.movies = await fetchTrendingWithDetails(thetvdbApiKey, 'movie', page);
        } else {
          response.movies = await fetchTrendingMovies(thetvdbApiKey, page);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        response.movies = createEmptyResult(errorMessage);
      }
    }
  }

  // Fetch TV section
  if (sectionParam === 'all' || sectionParam === 'tv') {
    if (!thetvdbApiKey) {
      response.tv = createEmptyResult('THETVDB_API_KEY is not configured');
    } else {
      try {
        if (includeDetails) {
          response.tv = await fetchTrendingWithDetails(thetvdbApiKey, 'tv', page);
        } else {
          response.tv = await fetchTrendingTVShows(thetvdbApiKey, page);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        response.tv = createEmptyResult(errorMessage);
      }
    }
  }

  // Fetch torrents section
  if (sectionParam === 'all' || sectionParam === 'torrents') {
    try {
      // For torrents, we use 'week' as default since 'day' might have too few results
      response.torrents = await fetchPopularContent('all', 'week', page, 20);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      response.torrents = {
        items: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
        error: errorMessage,
      };
    }
  }

  return NextResponse.json(response);
}
