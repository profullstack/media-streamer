/**
 * Torrent Indexing API with Server-Sent Events (SSE)
 *
 * POST /api/torrents/index - Index a torrent with real-time progress updates
 *
 * This endpoint streams progress events during torrent metadata fetch.
 */

import { NextRequest } from 'next/server';
import { IndexerService, IndexerError } from '@/lib/indexer';
import { TorrentService, type MetadataProgressEvent } from '@/lib/torrent';
import { createLogger, generateRequestId } from '@/lib/logger';
import {
  getTorrentByInfohash,
  createTorrent,
  createTorrentFiles,
  type TorrentFileInsert,
} from '@/lib/supabase';
import { parseMagnetUri, validateMagnetUri } from '@/lib/magnet';
import { getMediaCategory, getMimeType } from '@/lib/utils';

const logger = createLogger('API:torrents/index');

/**
 * SSE event types
 */
type SSEEventType = 'progress' | 'complete' | 'error' | 'existing';

/**
 * SSE event data
 */
interface SSEEvent {
  type: SSEEventType;
  data: MetadataProgressEvent | {
    torrentId?: string;
    infohash?: string;
    name?: string;
    fileCount?: number;
    totalSize?: number;
    isNew?: boolean;
    error?: string;
  };
}

/**
 * Format SSE message
 */
function formatSSE(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * POST /api/torrents/index
 *
 * Index a torrent with real-time progress updates via SSE.
 *
 * Request body:
 * - magnetUri: string (required) - The magnet URI to index
 *
 * Response: Server-Sent Events stream with progress updates
 *
 * Events:
 * - progress: { stage, progress, numPeers, elapsedMs, message, infohash }
 * - complete: { torrentId, infohash, name, fileCount, totalSize, isNew }
 * - existing: { torrentId, infohash, name, fileCount, totalSize, isNew: false }
 * - error: { error: string }
 */
export async function POST(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });

  reqLogger.info('POST /api/torrents/index - Starting SSE stream');

  let body: unknown;

  try {
    body = await request.json();
    reqLogger.debug('Request body parsed', { hasBody: !!body });
  } catch (parseError) {
    reqLogger.warn('Invalid JSON body', { error: String(parseError) });
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate request body
  if (!body || typeof body !== 'object') {
    reqLogger.warn('Request body is not an object');
    return new Response(
      JSON.stringify({ error: 'magnetUri is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string' || magnetUri.trim() === '') {
    reqLogger.warn('magnetUri is missing or invalid');
    return new Response(
      JSON.stringify({ error: 'magnetUri is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate magnet URI format
  if (!validateMagnetUri(magnetUri)) {
    reqLogger.warn('Invalid magnet URI format');
    return new Response(
      JSON.stringify({ error: 'Invalid magnet URI format' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = parseMagnetUri(magnetUri);
  reqLogger.info('Starting torrent indexing with SSE', {
    infohash: parsed.infohash,
    displayName: parsed.displayName,
  });

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const torrentService = new TorrentService();

      try {
        // Check if torrent already exists
        const existingTorrent = await getTorrentByInfohash(parsed.infohash);
        if (existingTorrent) {
          reqLogger.info('Torrent already exists', {
            torrentId: existingTorrent.id,
            infohash: existingTorrent.infohash,
          });

          controller.enqueue(encoder.encode(formatSSE({
            type: 'existing',
            data: {
              torrentId: existingTorrent.id,
              infohash: existingTorrent.infohash,
              name: existingTorrent.name,
              fileCount: existingTorrent.file_count,
              totalSize: existingTorrent.total_size,
              isNew: false,
            },
          })));
          controller.close();
          return;
        }

        // Fetch metadata with progress callback
        const metadata = await torrentService.fetchMetadata(magnetUri, (event) => {
          reqLogger.debug('Progress event', event);
          controller.enqueue(encoder.encode(formatSSE({
            type: 'progress',
            data: event,
          })));
        });

        // Create torrent record
        const torrent = await createTorrent({
          infohash: metadata.infohash,
          magnet_uri: metadata.magnetUri,
          name: metadata.name,
          total_size: metadata.totalSize,
          file_count: metadata.files.length,
          piece_length: metadata.pieceLength,
        });

        // Create file records
        if (metadata.files.length > 0) {
          const fileInserts: TorrentFileInsert[] = metadata.files.map((file) => ({
            torrent_id: torrent.id,
            file_index: file.index,
            path: file.path,
            name: file.name,
            extension: file.extension,
            size: file.size,
            piece_start: file.pieceStart,
            piece_end: file.pieceEnd,
            media_category: file.mediaCategory,
            mime_type: file.mimeType,
          }));
          await createTorrentFiles(fileInserts);
        }

        reqLogger.info('Torrent indexed successfully', {
          torrentId: torrent.id,
          infohash: metadata.infohash,
          name: metadata.name,
        });

        // Send complete event
        controller.enqueue(encoder.encode(formatSSE({
          type: 'complete',
          data: {
            torrentId: torrent.id,
            infohash: metadata.infohash,
            name: metadata.name,
            fileCount: metadata.files.length,
            totalSize: metadata.totalSize,
            isNew: true,
          },
        })));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reqLogger.error('Indexing error', error);

        controller.enqueue(encoder.encode(formatSSE({
          type: 'error',
          data: { error: errorMessage },
        })));
      } finally {
        await torrentService.destroy();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
