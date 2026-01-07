/**
 * Torrent Indexing API with Server-Sent Events (SSE)
 *
 * POST /api/torrents/index - Index a torrent with real-time progress updates
 *
 * This endpoint streams progress events during torrent metadata fetch.
 * After successful indexing:
 * - Triggers metadata enrichment (posters, covers, descriptions)
 * - Triggers codec detection for video/audio files
 */

import { NextRequest } from 'next/server';
import { TorrentService, type MetadataProgressEvent } from '@/lib/torrent';
import { scrapeMultipleTrackers, SCRAPE_TRACKERS } from '@/lib/tracker-scrape';
import { createLogger, generateRequestId } from '@/lib/logger';
import {
  getTorrentByInfohash,
  createTorrent,
  createTorrentFiles,
  type TorrentFileInsert,
} from '@/lib/supabase';
import { parseMagnetUri, validateMagnetUri } from '@/lib/magnet';
import {
  triggerPostIngestionEnrichment,
  triggerCodecDetection,
} from '@/lib/torrent-index';

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
    seeders?: number | null;
    leechers?: number | null;
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
 * Safely enqueue data to the stream controller
 * Handles cases where the connection may have been closed
 */
function safeEnqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: SSEEvent,
  reqLogger: ReturnType<typeof logger.child>
): void {
  try {
    controller.enqueue(encoder.encode(formatSSE(event)));
  } catch (enqueueError) {
    // Connection was likely closed by the client
    reqLogger.warn('Failed to enqueue SSE event (connection may be closed)', {
      eventType: event.type,
      error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
    });
  }
}

/**
 * Safely close the stream controller
 * Handles cases where the controller may already be closed
 */
function safeClose(
  controller: ReadableStreamDefaultController<Uint8Array>,
  reqLogger: ReturnType<typeof logger.child>
): void {
  try {
    controller.close();
  } catch (closeError) {
    // Controller may already be closed
    reqLogger.warn('Failed to close stream controller (may already be closed)', {
      error: closeError instanceof Error ? closeError.message : String(closeError),
    });
  }
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

          safeEnqueue(controller, encoder, {
            type: 'existing',
            data: {
              torrentId: existingTorrent.id,
              infohash: existingTorrent.infohash,
              name: existingTorrent.name,
              fileCount: existingTorrent.file_count,
              totalSize: existingTorrent.total_size,
              isNew: false,
            },
          }, reqLogger);
          safeClose(controller, reqLogger);
          return;
        }

        // Fetch metadata with progress callback
        const metadata = await torrentService.fetchMetadata(magnetUri, (event) => {
          reqLogger.debug('Progress event', event);
          safeEnqueue(controller, encoder, {
            type: 'progress',
            data: event,
          }, reqLogger);
        });

        // Scrape trackers for seeders/leechers (non-blocking, best effort)
        // Combine trackers from magnet URI with our default scrape trackers
        const allTrackers = [...new Set([...parsed.trackers, ...SCRAPE_TRACKERS])];
        let seeders: number | null = null;
        let leechers: number | null = null;
        let swarmUpdatedAt: string | null = null;

        try {
          reqLogger.debug('Scraping trackers for swarm stats', {
            infohash: metadata.infohash,
            trackerCount: allTrackers.length,
          });
          
          const swarmStats = await scrapeMultipleTrackers(allTrackers, metadata.infohash, {
            timeout: 5000,
            maxConcurrent: 5,
          });
          
          seeders = swarmStats.seeders;
          leechers = swarmStats.leechers;
          swarmUpdatedAt = swarmStats.fetchedAt.toISOString();
          
          reqLogger.info('Swarm stats fetched', {
            infohash: metadata.infohash,
            seeders,
            leechers,
            trackersResponded: swarmStats.trackersResponded,
          });
        } catch (scrapeError) {
          // Log but don't fail - swarm stats are optional
          reqLogger.warn('Failed to scrape swarm stats', {
            infohash: metadata.infohash,
            error: String(scrapeError),
          });
        }

        // Create torrent record with swarm stats
        // Set status to 'ready' since we have successfully fetched all metadata
        const torrent = await createTorrent({
          infohash: metadata.infohash,
          magnet_uri: metadata.magnetUri,
          name: metadata.name,
          total_size: metadata.totalSize,
          file_count: metadata.files.length,
          piece_length: metadata.pieceLength,
          seeders,
          leechers,
          swarm_updated_at: swarmUpdatedAt,
          status: 'ready',
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

        // Trigger post-indexing hooks asynchronously (fire and forget)
        // These don't block the SSE response
        
        reqLogger.info('=== TRIGGERING POST-INDEXING HOOKS ===', {
          torrentId: torrent.id,
          torrentName: metadata.name,
          infohash: metadata.infohash,
        });
        
        // 1. Metadata enrichment (posters, covers, descriptions from external APIs)
        reqLogger.info('Calling triggerPostIngestionEnrichment NOW', { torrentId: torrent.id });
        void triggerPostIngestionEnrichment(torrent.id, {
          torrentName: metadata.name,
          infohash: metadata.infohash,
          isDuplicate: false,
        }).then((enrichmentResult) => {
          reqLogger.info('=== ENRICHMENT PROMISE RESOLVED ===', {
            torrentId: torrent.id,
            success: enrichmentResult.success,
            contentType: enrichmentResult.contentType,
            enrichmentTriggered: enrichmentResult.enrichmentTriggered,
            skippedReason: enrichmentResult.skippedReason,
            error: enrichmentResult.error,
            hasPoster: !!enrichmentResult.enrichment?.posterUrl,
            hasCover: !!enrichmentResult.enrichment?.coverUrl,
          });
        }).catch((error) => {
          reqLogger.error('=== ENRICHMENT PROMISE REJECTED ===', error instanceof Error ? error : undefined, {
            torrentId: torrent.id,
          });
        });

        // 2. Codec detection for video/audio files
        reqLogger.info('Calling triggerCodecDetection NOW', { torrentId: torrent.id, infohash: metadata.infohash });
        void triggerCodecDetection(torrent.id, metadata.infohash).then((codecResult) => {
          reqLogger.info('=== CODEC DETECTION PROMISE RESOLVED ===', {
            torrentId: torrent.id,
            success: codecResult.success,
            filesProcessed: codecResult.filesProcessed,
            skippedReason: codecResult.skippedReason,
            error: codecResult.error,
          });
        }).catch((error) => {
          reqLogger.error('=== CODEC DETECTION PROMISE REJECTED ===', error instanceof Error ? error : undefined, {
            torrentId: torrent.id,
          });
        });

        // Send complete event with swarm stats
        safeEnqueue(controller, encoder, {
          type: 'complete',
          data: {
            torrentId: torrent.id,
            infohash: metadata.infohash,
            name: metadata.name,
            fileCount: metadata.files.length,
            totalSize: metadata.totalSize,
            seeders,
            leechers,
            isNew: true,
          },
        }, reqLogger);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reqLogger.error('Indexing error', error);

        safeEnqueue(controller, encoder, {
          type: 'error',
          data: { error: errorMessage },
        }, reqLogger);
      } finally {
        try {
          await torrentService.destroy();
        } catch (destroyError) {
          reqLogger.warn('Failed to destroy torrent service', {
            error: destroyError instanceof Error ? destroyError.message : String(destroyError),
          });
        }
        safeClose(controller, reqLogger);
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
