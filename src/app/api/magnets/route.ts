/**
 * Magnet Ingestion API
 *
 * POST /api/magnets - Ingest a new magnet URI (FREE - no auth required)
 * GET /api/magnets?infohash=... - Get torrent by infohash (FREE - no auth required)
 *
 * These endpoints are free to encourage torrent database growth.
 * Rate limiting is applied to prevent abuse.
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
import { createLogger, generateRequestId } from '@/lib/logger';

const logger = createLogger('API:magnets');

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
 * POST /api/magnets
 *
 * Ingest a new magnet URI into the system.
 * FREE - No authentication required to encourage database growth.
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
 * - 429: Rate limited
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  const clientIp = getClientIp(request);
  
  reqLogger.info('POST /api/magnets - Starting', { clientIp });

  // Rate limiting
  const rateLimitResult = checkRateLimit(magnetRateLimiter, clientIp);
  
  if (!rateLimitResult.allowed) {
    reqLogger.warn('Rate limit exceeded', { 
      clientIp, 
      retryAfter: rateLimitResult.retryAfter 
    });
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
    reqLogger.debug('Request body parsed');
  } catch (parseError) {
    reqLogger.warn('Invalid JSON body', { error: String(parseError) });
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate request body
  if (!body || typeof body !== 'object') {
    reqLogger.warn('Request body is not an object');
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400 }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string') {
    reqLogger.warn('magnetUri is missing or invalid');
    return NextResponse.json(
      { error: 'magnetUri is required and must be a string' },
      { status: 400 }
    );
  }

  // Validate magnet URI format
  if (!validateMagnetUri(magnetUri)) {
    reqLogger.warn('Invalid magnet URI format', { 
      magnetUri: magnetUri.substring(0, 100) 
    });
    return NextResponse.json(
      { error: 'Invalid magnet URI format' },
      { status: 400 }
    );
  }

  // Record the request for rate limiting
  recordRequest(magnetRateLimiter, clientIp);

  reqLogger.info('Ingesting magnet URI', { 
    magnetUri: magnetUri.substring(0, 100) + '...' 
  });

  // Ingest the magnet (no user ID for anonymous submissions)
  const result = await ingestMagnet(magnetUri, null);

  if (!result.success) {
    reqLogger.error('Failed to ingest magnet', undefined, { 
      error: result.error,
      magnetUri: magnetUri.substring(0, 100)
    });
    return NextResponse.json(
      { error: result.error ?? 'Failed to ingest magnet' },
      { status: 500 }
    );
  }

  // Return appropriate status based on whether it's a duplicate
  const status = result.isDuplicate ? 200 : 201;

  reqLogger.info('Magnet ingested successfully', {
    torrentId: result.torrentId,
    infohash: result.infohash,
    isDuplicate: result.isDuplicate,
    status
  });

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
 * FREE - No authentication required.
 *
 * Query parameters:
 * - infohash: string - The 40-character hex infohash
 *
 * Response:
 * - 200: Torrent found
 * - 400: Invalid request
 * - 404: Torrent not found
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');

  reqLogger.info('GET /api/magnets', { infohash });

  // Validate infohash parameter
  if (!infohash) {
    reqLogger.warn('Missing infohash parameter');
    return NextResponse.json(
      { error: 'infohash query parameter is required' },
      { status: 400 }
    );
  }

  // Validate infohash format (40 hex characters)
  if (!/^[a-fA-F0-9]{40}$/.test(infohash)) {
    reqLogger.warn('Invalid infohash format', { infohash });
    return NextResponse.json(
      { error: 'Invalid infohash format. Must be 40 hexadecimal characters.' },
      { status: 400 }
    );
  }

  reqLogger.debug('Fetching torrent by infohash', { infohash });

  // Get torrent by infohash
  const torrent = await getTorrentByInfohash(infohash);

  if (!torrent) {
    reqLogger.info('Torrent not found', { infohash });
    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  }

  reqLogger.info('Torrent found', { 
    infohash, 
    torrentId: torrent.id,
    name: torrent.name 
  });

  return NextResponse.json(torrent);
}
