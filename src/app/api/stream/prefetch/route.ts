/**
 * Prefetch API Route
 *
 * Initiates downloading of a torrent file without returning a stream.
 * Used to pre-buffer upcoming tracks in a playlist for seamless playback.
 *
 * POST /api/stream/prefetch
 * Body: { infohash: string, fileIndex: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';
import { createLogger, generateRequestId } from '@/lib/logger';
import { getTorrentByInfohash } from '@/lib/supabase';

const logger = createLogger('API:prefetch');

/**
 * Get magnet URI from database or build a basic one as fallback
 */
async function getMagnetUri(infohash: string): Promise<string> {
  const torrent = await getTorrentByInfohash(infohash);
  if (torrent?.magnet_uri) {
    return torrent.magnet_uri;
  }
  return `magnet:?xt=urn:btih:${infohash}`;
}

/**
 * Request body for prefetch
 */
interface PrefetchRequest {
  infohash: string;
  fileIndex: number;
}

/**
 * POST /api/stream/prefetch
 * Start downloading a file to pre-buffer it for upcoming playback.
 * This doesn't return a stream - it just initiates the download.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });

  try {
    const body = await request.json() as PrefetchRequest;
    const { infohash, fileIndex } = body;

    if (!infohash) {
      return NextResponse.json(
        { error: 'Missing required parameter: infohash' },
        { status: 400 }
      );
    }

    if (fileIndex === undefined || fileIndex === null || fileIndex < 0) {
      return NextResponse.json(
        { error: 'fileIndex must be a non-negative integer' },
        { status: 400 }
      );
    }

    reqLogger.info('Prefetch request', { infohash, fileIndex });

    const magnetUri = await getMagnetUri(infohash);
    const service = getStreamingService();

    // Get stream info to start the torrent and prioritize the file
    // This will add the torrent to the client and start downloading
    const info = await service.getStreamInfo({ magnetUri, fileIndex });

    reqLogger.info('Prefetch initiated', {
      infohash,
      fileIndex,
      fileName: info.fileName,
      size: info.size,
    });

    return NextResponse.json({
      success: true,
      fileName: info.fileName,
      size: info.size,
      mimeType: info.mimeType,
    });
  } catch (error) {
    reqLogger.error('Prefetch error', error);
    return NextResponse.json(
      { error: 'Failed to prefetch file' },
      { status: 500 }
    );
  }
}
