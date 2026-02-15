/**
 * Stream Status API - SSE Endpoint
 *
 * GET /api/stream/status?infohash=<infohash>&fileIndex=<optional>&persistent=<optional>
 *
 * Provides real-time connection status updates via Server-Sent Events (SSE).
 * Used by the media player modal to show download progress during connection.
 *
 * When persistent=true, the stream continues after the torrent is ready,
 * allowing the client to monitor ongoing health stats (peers, speeds, progress).
 * In persistent mode, the poll interval slows down to 2 seconds after ready.
 *
 * DMCA Protection:
 * This endpoint registers a "watcher" when the SSE connection opens and
 * unregisters it when the connection closes. When the last watcher disconnects,
 * the torrent is automatically removed from the WebTorrent client after a
 * 30-second grace period. This prevents the server from staying connected
 * to the BitTorrent swarm indefinitely after users stop watching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';
import { getTorrentByInfohash } from '@/lib/supabase';

/**
 * Connection status stages
 */
export type ConnectionStage =
  | 'initializing'
  | 'connecting'
  | 'searching_peers'
  | 'downloading_metadata'
  | 'buffering'
  | 'ready'
  | 'error';

/**
 * Status event data sent via SSE
 */
export interface StreamStatusEvent {
  stage: ConnectionStage;
  message: string;
  numPeers: number;
  /** Overall torrent progress (0-1) */
  progress: number;
  /** File-specific progress (0-1) - more accurate for streaming */
  fileProgress?: number;
  downloadSpeed: number;
  uploadSpeed: number;
  /** Total bytes downloaded */
  downloaded: number;
  /** Total bytes uploaded */
  uploaded: number;
  /** Whether the torrent metadata is ready */
  ready: boolean;
  /** Whether the file has enough data buffered for streaming (2MB or complete) */
  fileReady?: boolean;
  fileIndex?: number;
  timestamp: number;
}

/**
 * Validate infohash format (40 hex characters)
 */
function isValidInfohash(infohash: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(infohash);
}

/**
 * Determine connection stage based on torrent stats
 */
function determineStage(stats: {
  numPeers: number;
  progress: number;
  ready: boolean;
} | null): ConnectionStage {
  if (!stats) {
    return 'initializing';
  }

  if (stats.ready) {
    return 'ready';
  }

  if (stats.progress > 0) {
    return 'buffering';
  }

  if (stats.numPeers > 0) {
    return 'downloading_metadata';
  }

  return 'searching_peers';
}

/**
 * Get human-readable message for stage
 */
function getStageMessage(stage: ConnectionStage, numPeers: number): string {
  switch (stage) {
    case 'initializing':
      return 'Initializing torrent...';
    case 'connecting':
      return 'Connecting to trackers...';
    case 'searching_peers':
      return 'Searching for peers...';
    case 'downloading_metadata':
      return `Downloading metadata (${numPeers} peer${numPeers !== 1 ? 's' : ''})...`;
    case 'buffering':
      return `Buffering (${numPeers} peer${numPeers !== 1 ? 's' : ''})...`;
    case 'ready':
      return `Ready (${numPeers} peer${numPeers !== 1 ? 's' : ''})`;
    case 'error':
      return 'Connection error';
    default:
      return 'Loading...';
  }
}

/**
 * Format bytes per second to human readable
 * @internal Reserved for future use in status messages
 */
function _formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Poll interval in milliseconds during initial connection (500ms)
 */
const INITIAL_POLL_INTERVAL = 500;

/**
 * Poll interval in milliseconds after ready state in persistent mode (2000ms)
 */
const PERSISTENT_POLL_INTERVAL = 2000;

/**
 * GET /api/stream/status
 *
 * Returns an SSE stream with real-time connection status updates.
 *
 * Query parameters:
 * - infohash: (required) The torrent infohash
 * - fileIndex: (optional) The file index to track
 * - persistent: (optional) If "true", keep streaming after ready state
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  const fileIndexParam = searchParams.get('fileIndex');
  const persistentParam = searchParams.get('persistent');

  // Validate infohash
  if (!infohash) {
    return NextResponse.json(
      { error: 'Missing required parameter: infohash' },
      { status: 400 }
    );
  }

  if (!isValidInfohash(infohash)) {
    return NextResponse.json({ error: 'Invalid infohash format' }, { status: 400 });
  }

  // Validate fileIndex if provided
  let fileIndex: number | undefined;
  if (fileIndexParam !== null) {
    const parsed = parseInt(fileIndexParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: 'fileIndex must be a non-negative integer' },
        { status: 400 }
      );
    }
    fileIndex = parsed;
  }

  // Parse persistent flag (defaults to false)
  const persistent = persistentParam === 'true';

  // Check if torrent exists in database
  const torrent = await getTorrentByInfohash(infohash);
  if (!torrent) {
    return NextResponse.json({ error: 'Torrent not found' }, { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isStreamClosed = false;
  let hasReachedReady = false;
  let torrentAddInitiated = false;
  let watcherId: string | null = null;

  // Helper function to cleanup interval and unregister watcher
  const cleanup = (): void => {
    if (isStreamClosed) return;
    isStreamClosed = true;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    // Unregister watcher for DMCA protection
    // This triggers cleanup timer if this was the last watcher
    if (watcherId) {
      const streamingService = getStreamingService();
      streamingService.unregisterWatcher(infohash, watcherId);
      console.log(`[SSE] Watcher unregistered for ${infohash}: ${watcherId}`);
      watcherId = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      // Use singleton to share WebTorrent client with stream endpoint
      const streamingService = getStreamingService();

      // Register this SSE connection as a watcher for DMCA protection
      // When the last watcher disconnects, the torrent will be removed after a grace period
      watcherId = streamingService.registerWatcher(infohash);
      console.log(`[SSE] Watcher registered for ${infohash}: ${watcherId}`);

      // Add torrent to WebTorrent client if not already added
      // This ensures the torrent starts downloading when the status endpoint is called
      const ensureTorrentAdded = async (): Promise<void> => {
        if (torrentAddInitiated) return;
        torrentAddInitiated = true;

        try {
          // torrent.magnet_uri contains the magnet link from the database
          if (torrent.magnet_uri) {
            await streamingService.addTorrentIfNeeded(torrent.magnet_uri);
          }
        } catch (err) {
          console.error('Failed to add torrent for status tracking:', err);
        }
      };

      // Start adding torrent immediately (don't await - let polling continue)
      void ensureTorrentAdded();

      // Send status update
      const sendStatus = (): void => {
        if (isStreamClosed) {
          return;
        }

        try {
          // Pass fileIndex to get file-specific progress (more accurate for streaming)
          // Also select the file for download priority so it starts downloading immediately
          const stats = streamingService.getTorrentStats(infohash, fileIndex, true);
          const stage = determineStage(stats);
          const numPeers = stats?.numPeers ?? 0;

          const event: StreamStatusEvent = {
            stage,
            message: getStageMessage(stage, numPeers),
            numPeers,
            progress: stats?.progress ?? 0,
            fileProgress: stats?.fileProgress,
            downloadSpeed: stats?.downloadSpeed ?? 0,
            uploadSpeed: stats?.uploadSpeed ?? 0,
            downloaded: stats?.downloaded ?? 0,
            uploaded: stats?.uploaded ?? 0,
            ready: stats?.ready ?? false,
            fileReady: stats?.fileReady,
            fileIndex,
            timestamp: Date.now(),
          };

          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Handle ready state
          if (stage === 'ready' && intervalId) {
            if (persistent) {
              // In persistent mode, switch to slower polling after ready
              if (!hasReachedReady) {
                hasReachedReady = true;
                clearInterval(intervalId);
                intervalId = setInterval(sendStatus, PERSISTENT_POLL_INTERVAL);
              }
            } else {
              // Default behavior: close stream after ready
              clearInterval(intervalId);
              intervalId = null;
              setTimeout(() => {
                if (!isStreamClosed) {
                  cleanup();
                  try {
                    controller.close();
                  } catch {
                    // Controller may already be closed
                  }
                }
              }, 100);
            }
          }
        } catch (error) {
          // If we get an error sending status (e.g., client disconnected), cleanup
          console.error('Error sending status:', error);

          // Check if this is a controller closed error (client disconnected)
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Controller is already closed') ||
              errorMessage.includes('Invalid state')) {
            console.log(`[SSE] Client disconnected for ${infohash}, cleaning up`);
            cleanup();
            return;
          }

          // Try to send error event, but if that fails too, cleanup
          try {
            const errorEvent: StreamStatusEvent = {
              stage: 'error',
              message: 'Connection error',
              numPeers: 0,
              progress: 0,
              downloadSpeed: 0,
              uploadSpeed: 0,
              downloaded: 0,
              uploaded: 0,
              ready: false,
              fileIndex,
              timestamp: Date.now(),
            };
            const data = `data: ${JSON.stringify(errorEvent)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            // Client is definitely disconnected, cleanup
            cleanup();
          }
        }
      };

      // Send initial status immediately
      sendStatus();

      // Poll every 500ms for updates initially
      intervalId = setInterval(sendStatus, INITIAL_POLL_INTERVAL);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
