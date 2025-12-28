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
 */

import { NextRequest, NextResponse } from 'next/server';
import { StreamingService } from '@/lib/streaming';
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
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  ready: boolean;
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

  const stream = new ReadableStream({
    start(controller) {
      const streamingService = new StreamingService();

      // Send status update
      const sendStatus = (): void => {
        if (isStreamClosed) {
          return;
        }

        try {
          const stats = streamingService.getTorrentStats(infohash);
          const stage = determineStage(stats);
          const numPeers = stats?.numPeers ?? 0;

          const event: StreamStatusEvent = {
            stage,
            message: getStageMessage(stage, numPeers),
            numPeers,
            progress: stats?.progress ?? 0,
            downloadSpeed: stats?.downloadSpeed ?? 0,
            uploadSpeed: stats?.uploadSpeed ?? 0,
            ready: stats?.ready ?? false,
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
                  controller.close();
                }
              }, 100);
            }
          }
        } catch (error) {
          console.error('Error sending status:', error);
          const errorEvent: StreamStatusEvent = {
            stage: 'error',
            message: 'Connection error',
            numPeers: 0,
            progress: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            ready: false,
            fileIndex,
            timestamp: Date.now(),
          };
          const data = `data: ${JSON.stringify(errorEvent)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      };

      // Send initial status immediately
      sendStatus();

      // Poll every 500ms for updates initially
      intervalId = setInterval(sendStatus, INITIAL_POLL_INTERVAL);
    },

    cancel() {
      isStreamClosed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
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
