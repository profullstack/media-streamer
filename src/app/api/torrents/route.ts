/**
 * Torrents API
 *
 * GET /api/torrents - List all torrents (FREE - no auth required)
 * POST /api/torrents - Index a new torrent from magnet URI (FREE - no auth required)
 *
 * These endpoints are free to encourage torrent database growth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';
import { IndexerService, IndexerError } from '@/lib/indexer';
import { createLogger, generateRequestId } from '@/lib/logger';

const logger = createLogger('API:torrents');

/**
 * GET /api/torrents
 *
 * List all torrents with pagination.
 * FREE - No authentication required.
 *
 * Query parameters:
 * - limit: number (optional, default 50, max 100)
 * - offset: number (optional, default 0)
 * - status: string (optional) - Filter by status
 *
 * Response:
 * - 200: List of torrents
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  const { searchParams } = new URL(request.url);
  
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const status = searchParams.get('status');

  const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  reqLogger.info('GET /api/torrents', { limit, offset, status });

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

    reqLogger.debug('Executing Supabase query');
    const { data: torrents, error, count } = await query;

    if (error) {
      reqLogger.error('Failed to fetch torrents from database', error);
      return NextResponse.json(
        { error: 'Failed to fetch torrents' },
        { status: 500 }
      );
    }

    reqLogger.info('Torrents fetched successfully', { 
      count: torrents?.length ?? 0, 
      total: count ?? 0 
    });

    return NextResponse.json({
      torrents: torrents ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    reqLogger.error('Torrents API error', error);
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
 * FREE - No authentication required to encourage database growth.
 *
 * Request body:
 * - magnetUri: string (required) - The magnet URI to index
 *
 * Response:
 * - 201: New torrent indexed
 * - 200: Existing torrent returned
 * - 400: Invalid request
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  reqLogger.info('POST /api/torrents - Starting');
  
  let body: unknown;
  
  try {
    body = await request.json();
    reqLogger.debug('Request body parsed', { hasBody: !!body });
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
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string' || magnetUri.trim() === '') {
    reqLogger.warn('magnetUri is missing or invalid');
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  reqLogger.info('Indexing magnet URI', { 
    magnetUri: magnetUri.substring(0, 100) + '...' 
  });

  const indexer = new IndexerService();

  try {
    reqLogger.debug('Calling indexer.indexMagnet');
    const result = await indexer.indexMagnet(magnetUri);

    const status = result.isNew ? 201 : 200;
    reqLogger.info('Magnet indexed successfully', {
      torrentId: result.torrentId,
      infohash: result.infohash,
      name: result.name,
      isNew: result.isNew,
      status
    });

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
      reqLogger.error('IndexerError during magnet indexing', error, {
        cause: error.cause?.message
      });
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    reqLogger.error('Unexpected error during magnet indexing', error);
    return NextResponse.json(
      { error: 'Failed to index torrent' },
      { status: 500 }
    );
  } finally {
    reqLogger.debug('Destroying indexer service');
    indexer.destroy();
  }
}
