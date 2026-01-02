/**
 * Trending API Route
 *
 * GET /api/trending - Fetch trending/popular content
 *
 * Query parameters:
 * - type: 'movie' | 'tv' | 'music' | 'all' (default: 'all')
 * - timeWindow: 'day' | 'week' | 'month' (default: 'week')
 * - sort: 'popular' | 'recent' | 'seeded' (default: 'popular')
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchPopularContent,
  fetchRecentlyAdded,
  fetchMostSeeded,
  type TrendingMediaType,
  type TrendingTimeWindow,
} from '@/lib/trending';

/**
 * Valid media types
 */
const VALID_MEDIA_TYPES = ['movie', 'tv', 'music', 'all'] as const;

/**
 * Valid time windows
 */
const VALID_TIME_WINDOWS = ['day', 'week', 'month'] as const;

/**
 * Valid sort options
 */
const VALID_SORT_OPTIONS = ['popular', 'recent', 'seeded'] as const;

/**
 * Type guard for media type
 */
function isValidMediaType(value: string): value is TrendingMediaType {
  return VALID_MEDIA_TYPES.includes(value as TrendingMediaType);
}

/**
 * Type guard for time window
 */
function isValidTimeWindow(value: string): value is TrendingTimeWindow {
  return VALID_TIME_WINDOWS.includes(value as TrendingTimeWindow);
}

/**
 * Type guard for sort option
 */
function isValidSortOption(value: string): value is 'popular' | 'recent' | 'seeded' {
  return VALID_SORT_OPTIONS.includes(value as 'popular' | 'recent' | 'seeded');
}

/**
 * GET /api/trending
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const typeParam = searchParams.get('type') ?? 'all';
    const timeWindowParam = searchParams.get('timeWindow') ?? 'week';
    const sortParam = searchParams.get('sort') ?? 'popular';
    const pageParam = searchParams.get('page') ?? '1';
    const pageSizeParam = searchParams.get('pageSize') ?? '20';
    
    // Validate media type
    if (!isValidMediaType(typeParam)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_MEDIA_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate time window
    if (!isValidTimeWindow(timeWindowParam)) {
      return NextResponse.json(
        { error: `Invalid timeWindow. Must be one of: ${VALID_TIME_WINDOWS.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate sort option
    if (!isValidSortOption(sortParam)) {
      return NextResponse.json(
        { error: `Invalid sort. Must be one of: ${VALID_SORT_OPTIONS.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Parse and validate page
    const page = parseInt(pageParam, 10);
    if (isNaN(page) || page < 1) {
      return NextResponse.json(
        { error: 'Invalid page. Must be a positive integer.' },
        { status: 400 }
      );
    }
    
    // Parse and validate page size
    let pageSize = parseInt(pageSizeParam, 10);
    if (isNaN(pageSize) || pageSize < 1) {
      return NextResponse.json(
        { error: 'Invalid pageSize. Must be a positive integer.' },
        { status: 400 }
      );
    }
    // Cap page size at 50
    pageSize = Math.min(pageSize, 50);
    
    // Fetch content based on sort option
    let result;
    switch (sortParam) {
      case 'recent':
        result = await fetchRecentlyAdded(typeParam, page, pageSize);
        break;
      case 'seeded':
        result = await fetchMostSeeded(typeParam, page, pageSize);
        break;
      case 'popular':
      default:
        result = await fetchPopularContent(typeParam, timeWindowParam, page, pageSize);
        break;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching trending content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trending content' },
      { status: 500 }
    );
  }
}
