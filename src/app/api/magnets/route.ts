/**
 * Magnet Ingestion API
 *
 * POST /api/magnets - Ingest a new magnet URI
 * GET /api/magnets?infohash=... - Get torrent by infohash
 *
 * All endpoints require authentication and an active paid subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ingestMagnet,
  validateMagnetUri,
  getTorrentByInfohash,
} from '@/lib/torrent-index';
import {
  createRateLimiter,
  checkRateLimit,
  recordRequest,
  DEFAULT_RATE_LIMITS,
} from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

// Create rate limiter for magnet ingestion
const magnetRateLimiter = createRateLimiter(DEFAULT_RATE_LIMITS.magnet);

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

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
 * POST /api/magnets
 *
 * Ingest a new magnet URI into the system.
 * Requires authentication and active paid subscription.
 *
 * Request body:
 * {
 *   magnetUri: string - The magnet URI to ingest
 * }
 *
 * Response:
 * - 201: Successfully ingested new torrent
 * - 200: Torrent already exists (duplicate)
 * - 400: Invalid request
 * - 401: Authentication required
 * - 403: Subscription required
 * - 429: Rate limited
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

  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(magnetRateLimiter, clientIp);
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  // Parse request body
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
      { error: 'Request body must be an object' },
      { status: 400 }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string') {
    return NextResponse.json(
      { error: 'magnetUri is required and must be a string' },
      { status: 400 }
    );
  }

  // Validate magnet URI format
  if (!validateMagnetUri(magnetUri)) {
    return NextResponse.json(
      { error: 'Invalid magnet URI format' },
      { status: 400 }
    );
  }

  // Record the request for rate limiting
  recordRequest(magnetRateLimiter, clientIp);

  // Ingest the magnet with authenticated user ID
  const result = await ingestMagnet(magnetUri, user.id);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to ingest magnet' },
      { status: 500 }
    );
  }

  // Return appropriate status based on whether it's a duplicate
  const status = result.isDuplicate ? 200 : 201;

  return NextResponse.json(
    {
      success: true,
      torrentId: result.torrentId,
      infohash: result.infohash,
      isDuplicate: result.isDuplicate,
    },
    {
      status,
      headers: {
        'X-RateLimit-Remaining': String(rateLimitResult.remaining - 1),
        'X-RateLimit-Reset': String(rateLimitResult.resetAt),
      },
    }
  );
}

/**
 * GET /api/magnets
 *
 * Get torrent information by infohash.
 * Requires authentication and active paid subscription.
 *
 * Query parameters:
 * - infohash: string - The 40-character hex infohash
 *
 * Response:
 * - 200: Torrent found
 * - 400: Invalid request
 * - 401: Authentication required
 * - 403: Subscription required
 * - 404: Torrent not found
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
  const infohash = searchParams.get('infohash');

  // Validate infohash parameter
  if (!infohash) {
    return NextResponse.json(
      { error: 'infohash query parameter is required' },
      { status: 400 }
    );
  }

  // Validate infohash format (40 hex characters)
  if (!/^[a-fA-F0-9]{40}$/.test(infohash)) {
    return NextResponse.json(
      { error: 'Invalid infohash format. Must be 40 hexadecimal characters.' },
      { status: 400 }
    );
  }

  // Get torrent by infohash
  const torrent = await getTorrentByInfohash(infohash);

  if (!torrent) {
    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(torrent);
}
