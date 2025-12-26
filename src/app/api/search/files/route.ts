/**
 * File Search API
 *
 * GET /api/search/files - Search for files within torrents
 *
 * All endpoints require authentication and an active paid subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchTorrentFiles } from '@/lib/torrent-index';
import type { MediaCategory } from '@/lib/supabase/types';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

// Valid media types
const VALID_MEDIA_TYPES: MediaCategory[] = ['audio', 'video', 'ebook', 'document', 'other'];

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
 * GET /api/search/files
 *
 * Search for files within torrents.
 * Requires authentication and active paid subscription.
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
 * - 401: Authentication required
 * - 403: Subscription required
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
      { error: subscriptionCheck.error },
      { status: 403 }
    );
  }

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
