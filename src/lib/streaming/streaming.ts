 /**
 * Multi-media Streaming Service
 * 
 * Provides streaming capabilities for audio, video, and ebook files from torrents.
 * Supports HTTP range requests for seeking and prioritizes only needed pieces.
 * This is a SERVER-SIDE ONLY service.
 */

import WebTorrent from 'webtorrent';
import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { validateMagnetUri, extractInfohash } from '../magnet';
import { getMediaCategory, getMimeType } from '../utils';
import type { MediaCategory } from '../utils';
import { createLogger } from '../logger';

const logger = createLogger('StreamingService');

// Well-known DHT bootstrap nodes for reliable peer discovery
const DHT_BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
  'dht.aelitis.com:6881',
];

/**
 * Custom error for streaming failures
 */
export class StreamingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamingError';
  }
}

/**
 * Error when requested file is not found in torrent
 */
export class FileNotFoundError extends StreamingError {
  constructor(fileIndex: number, totalFiles: number) {
    super(`File index ${fileIndex} not found. Torrent has ${totalFiles} files.`);
    this.name = 'FileNotFoundError';
  }
}

/**
 * Error when range request cannot be satisfied
 */
export class RangeNotSatisfiableError extends StreamingError {
  constructor(start: number, end: number, fileSize: number) {
    super(`Range ${start}-${end} not satisfiable for file of size ${fileSize}`);
    this.name = 'RangeNotSatisfiableError';
  }
}

/**
 * Options for creating a stream
 */
export interface StreamOptions {
  /** Magnet URI of the torrent */
  magnetUri: string;
  /** Index of the file to stream */
  fileIndex: number;
  /** Optional byte range for partial content */
  range?: {
    start: number;
    end: number;
  };
}

/**
 * Result of creating a stream
 */
export interface StreamResult {
  /** Unique identifier for this stream */
  streamId: string;
  /** The readable stream */
  stream: Readable;
  /** MIME type of the file */
  mimeType: string;
  /** Total file size in bytes */
  size: number;
  /** Whether this is a partial response (206) */
  isPartial: boolean;
  /** Content-Range header value for partial responses */
  contentRange?: string;
  /** Content-Length for partial responses */
  contentLength?: number;
}

/**
 * Information about a streamable file
 */
export interface StreamInfo {
  /** File name */
  fileName: string;
  /** File path within torrent */
  filePath: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Media category */
  mediaCategory: MediaCategory;
}

/**
 * Options for StreamingService
 */
export interface StreamingServiceOptions {
  /** Maximum concurrent streams (default: 10) */
  maxConcurrentStreams?: number;
  /** Timeout for stream operations in milliseconds (default: 30000) */
  streamTimeout?: number;
}

/**
 * Internal representation of an active stream
 */
interface ActiveStream {
  streamId: string;
  infohash: string;
  fileIndex: number;
  stream: Readable;
  createdAt: Date;
}

/**
 * Service for streaming media files from torrents
 */
export class StreamingService {
  private client: WebTorrent.Instance;
  private maxConcurrentStreams: number;
  private streamTimeout: number;
  private activeStreams: Map<string, ActiveStream>;

  constructor(options: StreamingServiceOptions = {}) {
    logger.info('Initializing StreamingService', {
      maxConcurrentStreams: options.maxConcurrentStreams ?? 10,
      streamTimeout: options.streamTimeout ?? 30000
    });
    
    // Configure WebTorrent with DHT bootstrap nodes for trackerless operation
    this.client = new WebTorrent({
      dht: {
        bootstrap: DHT_BOOTSTRAP_NODES,
      },
      // Enable all peer discovery methods
      tracker: true,
      lsd: true, // Local Service Discovery
      webSeeds: true,
    } as WebTorrent.Options);
    
    this.maxConcurrentStreams = options.maxConcurrentStreams ?? 10;
    this.streamTimeout = options.streamTimeout ?? 30000;
    this.activeStreams = new Map();
    
    // Log client events
    this.client.on('error', (err) => {
      logger.error('WebTorrent client error', err);
    });
    
    logger.debug('WebTorrent client created for streaming with DHT bootstrap nodes', {
      bootstrapNodes: DHT_BOOTSTRAP_NODES.length,
    });
  }

  /**
   * Create a stream for a file in a torrent
   * 
   * @param options - Stream options including magnet URI and file index
   * @returns Promise resolving to stream result
   * @throws StreamingError if magnet URI is invalid
   * @throws FileNotFoundError if file index is out of bounds
   * @throws RangeNotSatisfiableError if range is invalid
   */
  async createStream(options: StreamOptions): Promise<StreamResult> {
    const { magnetUri, fileIndex, range } = options;
    const startTime = Date.now();

    logger.info('Creating stream', {
      magnetUri: magnetUri.substring(0, 60) + '...',
      fileIndex,
      hasRange: !!range,
      range
    });

    // Validate magnet URI
    if (!validateMagnetUri(magnetUri)) {
      logger.error('Invalid magnet URI for streaming', undefined, { magnetUri: magnetUri.substring(0, 60) });
      throw new StreamingError(`Invalid magnet URI: ${magnetUri}`);
    }

    // Check concurrent stream limit
    if (this.activeStreams.size >= this.maxConcurrentStreams) {
      logger.warn('Maximum concurrent streams reached', {
        current: this.activeStreams.size,
        max: this.maxConcurrentStreams
      });
      throw new StreamingError(`Maximum concurrent streams (${this.maxConcurrentStreams}) reached`);
    }

    const infohash = extractInfohash(magnetUri);
    if (!infohash) {
      logger.error('Could not extract infohash', undefined, { magnetUri: magnetUri.substring(0, 60) });
      throw new StreamingError('Could not extract infohash from magnet URI');
    }

    logger.debug('Getting or adding torrent', { infohash });

    // Get or add torrent
    const torrent = await this.getOrAddTorrent(magnetUri, infohash);

    logger.debug('Torrent ready', {
      infohash,
      name: torrent.name,
      fileCount: torrent.files.length,
      elapsed: `${Date.now() - startTime}ms`
    });

    // Validate file index
    if (fileIndex < 0 || fileIndex >= torrent.files.length) {
      logger.warn('File index out of bounds', {
        fileIndex,
        totalFiles: torrent.files.length
      });
      throw new FileNotFoundError(fileIndex, torrent.files.length);
    }

    const file = torrent.files[fileIndex];
    logger.debug('File selected', {
      fileName: file.name,
      fileSize: file.length,
      filePath: file.path
    });

    // Validate range if provided
    if (range) {
      if (range.start < 0 || range.end >= file.length || range.start > range.end) {
        logger.warn('Invalid range request', {
          range,
          fileSize: file.length
        });
        throw new RangeNotSatisfiableError(range.start, range.end, file.length);
      }
    }

    // Select this file for download (prioritize its pieces)
    file.select();
    logger.debug('File selected for download priority');

    // Create the stream
    const streamId = randomUUID();
    let stream: Readable;

    if (range) {
      logger.debug('Creating range stream', { start: range.start, end: range.end });
      stream = file.createReadStream({ start: range.start, end: range.end }) as Readable;
    } else {
      logger.debug('Creating full file stream');
      stream = file.createReadStream() as Readable;
    }

    // Track active stream
    this.activeStreams.set(streamId, {
      streamId,
      infohash,
      fileIndex,
      stream,
      createdAt: new Date(),
    });

    logger.info('Stream created', {
      streamId,
      infohash,
      fileIndex,
      fileName: file.name,
      activeStreams: this.activeStreams.size,
      elapsed: `${Date.now() - startTime}ms`
    });

    // Clean up on stream end or error
    stream.on('end', () => {
      logger.debug('Stream ended', { streamId });
      this.activeStreams.delete(streamId);
    });
    stream.on('error', (err) => {
      logger.error('Stream error', err, { streamId });
      this.activeStreams.delete(streamId);
    });

    const mimeType = getMimeType(file.name);

    if (range) {
      const contentLength = range.end - range.start + 1;
      return {
        streamId,
        stream,
        mimeType,
        size: file.length,
        isPartial: true,
        contentRange: `bytes ${range.start}-${range.end}/${file.length}`,
        contentLength,
      };
    }

    return {
      streamId,
      stream,
      mimeType,
      size: file.length,
      isPartial: false,
    };
  }

  /**
   * Get information about a streamable file without creating a stream
   * 
   * @param options - Stream options (only magnetUri and fileIndex used)
   * @returns Promise resolving to stream info
   */
  async getStreamInfo(options: Pick<StreamOptions, 'magnetUri' | 'fileIndex'>): Promise<StreamInfo> {
    const { magnetUri, fileIndex } = options;
    const startTime = Date.now();

    logger.debug('Getting stream info', {
      magnetUri: magnetUri.substring(0, 60) + '...',
      fileIndex
    });

    if (!validateMagnetUri(magnetUri)) {
      logger.error('Invalid magnet URI for stream info', undefined, { magnetUri: magnetUri.substring(0, 60) });
      throw new StreamingError(`Invalid magnet URI: ${magnetUri}`);
    }

    const infohash = extractInfohash(magnetUri);
    if (!infohash) {
      logger.error('Could not extract infohash for stream info');
      throw new StreamingError('Could not extract infohash from magnet URI');
    }

    const torrent = await this.getOrAddTorrent(magnetUri, infohash);

    if (fileIndex < 0 || fileIndex >= torrent.files.length) {
      logger.warn('File index out of bounds for stream info', {
        fileIndex,
        totalFiles: torrent.files.length
      });
      throw new FileNotFoundError(fileIndex, torrent.files.length);
    }

    const file = torrent.files[fileIndex];

    const info: StreamInfo = {
      fileName: file.name,
      filePath: file.path,
      size: file.length,
      mimeType: getMimeType(file.name),
      mediaCategory: getMediaCategory(file.name),
    };

    logger.debug('Stream info retrieved', {
      ...info,
      elapsed: `${Date.now() - startTime}ms`
    });

    return info;
  }

  /**
   * Close an active stream
   * 
   * @param streamId - The stream ID to close
   */
  async closeStream(streamId: string): Promise<void> {
    logger.debug('Closing stream', { streamId });
    const activeStream = this.activeStreams.get(streamId);
    if (activeStream) {
      activeStream.stream.destroy();
      this.activeStreams.delete(streamId);
      logger.info('Stream closed', { streamId });
    } else {
      logger.debug('Stream not found for closing', { streamId });
    }
  }

  /**
   * Get the count of active streams
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Destroy the service and clean up all resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying StreamingService', {
      activeStreams: this.activeStreams.size
    });

    // Close all active streams
    for (const [streamId, activeStream] of this.activeStreams) {
      activeStream.stream.destroy();
      this.activeStreams.delete(streamId);
    }

    // Destroy WebTorrent client
    return new Promise((resolve) => {
      this.client.destroy(() => {
        logger.debug('WebTorrent client destroyed');
        resolve();
      });
    });
  }

  /**
   * Get an existing torrent or add a new one
   */
  private async getOrAddTorrent(magnetUri: string, infohash: string): Promise<WebTorrent.Torrent> {
    // Check if torrent already exists
    const existing = this.client.get(infohash);
    if (existing && existing.ready) {
      logger.debug('Using existing torrent', { infohash, name: existing.name });
      return existing;
    }

    logger.debug('Adding new torrent', { infohash });
    const startTime = Date.now();

    // Add new torrent and wait for it to be ready
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      timeoutId = setTimeout(() => {
        logger.warn('Torrent metadata fetch timeout', {
          infohash,
          timeout: this.streamTimeout,
          elapsed: `${Date.now() - startTime}ms`
        });
        reject(new StreamingError(`Torrent metadata fetch timed out after ${this.streamTimeout}ms`));
      }, this.streamTimeout);

      const torrent = this.client.add(magnetUri, (t) => {
        logger.debug('Torrent add callback fired', {
          infohash: t.infoHash,
          ready: t.ready,
          numPeers: t.numPeers
        });

        // Wait for ready event
        const onReady = (): void => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          logger.info('Torrent ready', {
            infohash: t.infoHash,
            name: t.name,
            fileCount: t.files.length,
            totalSize: t.length,
            numPeers: t.numPeers,
            elapsed: `${Date.now() - startTime}ms`
          });
          // Deselect all files initially
          t.deselect(0, t.pieces.length - 1, 0);
          resolve(t);
        };

        if (t.ready) {
          onReady();
        } else {
          t.on('ready', onReady);
        }
      });

      // Log peer connections
      torrent.on('wire', (wire) => {
        logger.debug('Peer connected', {
          infohash,
          peerAddress: wire.remoteAddress,
          numPeers: torrent.numPeers
        });
      });

      torrent.on('warning', (warn) => {
        logger.warn('Torrent warning', {
          infohash,
          warning: String(warn)
        });
      });

      // Use type assertion for error event since WebTorrent types are incomplete
      (torrent as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        logger.error('Torrent error', err, { infohash });
        reject(new StreamingError(`Torrent error: ${err.message}`));
      });
    });
  }
}
