/**
 * Search API
 *
 * GET /api/search - Search for files across all indexed torrents
 *
 * All endpoints require authentication and an active paid subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchFiles } from '@/lib/supabase';
import type { MediaCategory } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

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
 * Check if user has an active paid subscription
 */
async function requireActiveSubscription(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const subscriptionRepo = getSubscriptionRepository();
  const subscription = await subscriptionRepo.getSubscription(userId);
  
  if (!subscription) {
    return { allowed: false, error: 'No subscription found. Please subscribe to access this feature.' };
  }
  
  if (subscription.status !== 'active') {
    return { allowed: false, error: 'Your subscription is not active. Please renew to continue.' };
  }
  
  // Check if subscription has expired (check both trial and paid subscription expiry)
  const expiresAt = subscription.subscription_expires_at ?? subscription.trial_expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return { allowed: false, error: 'Your subscription has expired. Please renew to continue.' };
  }
  
  return { allowed: true };
}

/**
 * Search API Response
 */
interface SearchResponse {
  query: string;
  results: Array<{
    file_id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    file_media_category: string;
    file_index: number;
    torrent_id: string;
    torrent_name: string;
    torrent_infohash: string;
    rank: number;
  }>;
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

/**
 * Error Response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/search
 *
 * Search for files across all indexed torrents.
 * Requires authentication and active paid subscription.
 *
 * Query Parameters:
 * - q: Search query (required)
 * - type: Media type filter (audio, video, ebook, document, other)
 * - torrent: Torrent ID to search within
 * - limit: Maximum results to return (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 *
 * Response:
 * - 200: Search results
 * - 400: Invalid request
 * - 401: Authentication required
 * - 403: Subscription required
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse<SearchResponse | ErrorResponse>> {
  // Require authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Require active subscription
  const subscriptionCheck = await requireActiveSubscription(user.id);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json(
      { error: subscriptionCheck.error ?? 'Subscription required' },
      { status: 403 }
    );
  }

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

  // Extract torrent ID filter
  const torrentId = searchParams.get('torrent');

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
    const results = await searchFiles({
      query,
      mediaType: mediaType as MediaCategory | null,
      torrentId,
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
