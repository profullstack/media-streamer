/**
 * Torrents API
 *
 * GET /api/torrents - List all torrents
 * POST /api/torrents - Index a new torrent from magnet URI
 *
 * All endpoints require authentication and an active paid subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';
import { IndexerService, IndexerError } from '@/lib/indexer';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

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
 * GET /api/torrents
 *
 * List all torrents with pagination.
 * Requires authentication and active paid subscription.
 *
 * Query parameters:
 * - limit: number (optional, default 50, max 100)
 * - offset: number (optional, default 0)
 * - status: string (optional) - Filter by status
 *
 * Response:
 * - 200: List of torrents
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
  
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const status = searchParams.get('status');

  const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    const supabase = getServerClient();

    let query = supabase
      .from('torrents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const validStatuses = ['pending', 'indexing', 'ready', 'error'] as const;
    if (status && validStatuses.includes(status as typeof validStatuses[number])) {
      query = query.eq('status', status as typeof validStatuses[number]);
    }

    const { data: torrents, error, count } = await query;

    if (error) {
      console.error('Failed to fetch torrents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch torrents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      torrents: torrents ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Torrents API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/torrents
 *
 * Index a new torrent from a magnet URI.
 * Requires authentication and active paid subscription.
 *
 * Request body:
 * - magnetUri: string (required) - The magnet URI to index
 *
 * Response:
 * - 201: New torrent indexed
 * - 200: Existing torrent returned
 * - 400: Invalid request
 * - 401: Authentication required
 * - 403: Subscription required
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

  let body: unknown;
  
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate request body
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string' || magnetUri.trim() === '') {
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  const indexer = new IndexerService();

  try {
    const result = await indexer.indexMagnet(magnetUri);

    const status = result.isNew ? 201 : 200;
    return NextResponse.json({
      torrentId: result.torrentId,
      infohash: result.infohash,
      name: result.name,
      fileCount: result.fileCount,
      totalSize: result.totalSize,
      isNew: result.isNew,
    }, { status });
  } catch (error) {
    if (error instanceof IndexerError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Failed to index torrent:', error);
    return NextResponse.json(
      { error: 'Failed to index torrent' },
      { status: 500 }
    );
  } finally {
    indexer.destroy();
  }
}
