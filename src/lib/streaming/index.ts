/**
 * Streaming module exports
 */

export {
  StreamingService,
  StreamingError,
  FileNotFoundError,
  RangeNotSatisfiableError,
  type StreamOptions,
  type StreamResult,
  type StreamInfo,
  type StreamingServiceOptions,
  type TorrentStats,
} from './streaming';

import { StreamingService } from './streaming';

/**
 * Singleton StreamingService instance
 *
 * This ensures all API routes share the same WebTorrent client,
 * allowing the SSE status endpoint to see torrents loaded by the stream endpoint.
 */
let streamingServiceInstance: StreamingService | null = null;

/**
 * Get the singleton StreamingService instance
 *
 * Creates the instance on first call, returns existing instance on subsequent calls.
 * This is necessary because WebTorrent maintains state (loaded torrents, peer connections)
 * that must be shared across all API routes.
 */
export function getStreamingService(): StreamingService {
  if (!streamingServiceInstance) {
    streamingServiceInstance = new StreamingService({
      maxConcurrentStreams: 15, // Reduced from 50 — 15GB server can't handle 50 concurrent torrent streams
      streamTimeout: 90000, // 90 seconds for audio/video to connect to peers
      torrentCleanupDelay: 120000, // 2 minutes grace period — must outlast active transcoding streams
    });
  }
  return streamingServiceInstance;
}
