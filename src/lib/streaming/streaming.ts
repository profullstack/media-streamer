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

// Comprehensive tracker list prioritizing HTTP trackers for cloud environments
// HTTP trackers work on DigitalOcean and other cloud platforms that block UDP
// Order: Port 80/443 first (most likely to work), then other HTTP, then WebSocket, then UDP
// Note: Many cloud platforms block non-standard ports
const OPEN_TRACKERS = [
  // Port 80 (HTTP) - most likely to work on cloud platforms
  'http://tracker.openbittorrent.com:80/announce',
  'http://tracker.gbitt.info:80/announce',
  'http://open.acgnxtracker.com:80/announce',
  'http://tracker1.bt.moack.co.kr:80/announce',
  'http://tracker.ipv6tracker.ru:80/announce',
  'http://tracker.electro-torrent.pl:80/announce',
  'http://bt.endpot.com:80/announce',
  // Port 443 (HTTPS) - most likely to work on cloud platforms
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.loligirl.cn:443/announce',
  'https://tracker.lilithraws.org:443/announce',
  'https://tracker.kuroy.me:443/announce',
  'https://tracker.imgoingto.icu:443/announce',
  // Non-standard ports (may be blocked on some cloud platforms)
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.bt4g.com:2095/announce',
  'http://tracker.files.fm:6969/announce',
  'http://open.tracker.ink:6969/announce',
  'http://tracker.skyts.net:6969/announce',
  'http://tracker.srv00.com:6969/announce',
  'http://tracker.birkenwald.de:6969/announce',
  // WebSocket trackers - work in cloud environments
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
  // UDP trackers - fallback for non-cloud environments
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.coppersurfer.tk:6969',
  'udp://tracker.internetwarriors.net:1337',
  'udp://p4p.arenabg.com:1337',
  'udp://glotorrents.pw:6969/announce',
  'udp://tracker.leechers-paradise.org:6969',
  'udp://9.rarbg.to:2710/announce',
  'udp://9.rarbg.me:2710/announce',
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
 * Live torrent statistics from DHT/peers
 */
export interface TorrentStats {
  /** Torrent infohash */
  infohash: string;
  /** Number of peers currently connected (from DHT) */
  numPeers: number;
  /** Download progress (0-1) */
  progress: number;
  /** Download speed in bytes/second */
  downloadSpeed: number;
  /** Upload speed in bytes/second */
  uploadSpeed: number;
  /** Whether the torrent is ready */
  ready: boolean;
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
   * @param skipWaitForData - If true, skip waiting for data (used for transcoding)
   * @returns Promise resolving to stream result
   * @throws StreamingError if magnet URI is invalid
   * @throws FileNotFoundError if file index is out of bounds
   * @throws RangeNotSatisfiableError if range is invalid
   */
  async createStream(options: StreamOptions, skipWaitForData = false): Promise<StreamResult> {
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

    // Wait for at least some data to be available before streaming
    // This prevents MEDIA_ELEMENT_ERROR when the browser receives empty data
    // Skip this for transcoding - FFmpeg handles buffering and can wait for data
    if (!skipWaitForData) {
      await this.waitForData(torrent, file, range?.start ?? 0);
    } else {
      logger.info('Skipping waitForData (transcoding mode)', {
        fileName: file.name,
        fileSize: file.length,
      });
    }

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
   * Get live statistics for a torrent from DHT/connected peers
   * This provides real-time peer counts that are more accurate than tracker scraping
   *
   * @param infohash - The torrent infohash
   * @returns TorrentStats or null if torrent is not loaded
   */
  getTorrentStats(infohash: string): TorrentStats | null {
    const torrent = this.client.torrents.find(t => t.infoHash === infohash);
    if (!torrent) {
      return null;
    }

    return {
      infohash: torrent.infoHash,
      numPeers: torrent.numPeers,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      ready: torrent.ready,
    };
  }

  /**
   * Get live statistics for all active torrents
   * @returns Array of TorrentStats for all loaded torrents
   */
  getAllTorrentStats(): TorrentStats[] {
    return this.client.torrents.map(torrent => ({
      infohash: torrent.infoHash,
      numPeers: torrent.numPeers,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      ready: torrent.ready,
    }));
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
   * Check if an object is a valid WebTorrent torrent
   */
  private isValidTorrent(obj: unknown): obj is WebTorrent.Torrent {
    return (
      obj !== null &&
      obj !== undefined &&
      typeof obj === 'object' &&
      'infoHash' in obj &&
      'on' in obj &&
      typeof (obj as { on: unknown }).on === 'function'
    );
  }

  /**
   * Safely remove a torrent from the client
   * Returns true if removal was successful or torrent didn't exist
   */
  private async safeRemoveTorrent(infohash: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Check if torrent exists in the client's torrent list
        const torrentInList = this.client.torrents.find(t => t.infoHash === infohash);
        if (!torrentInList) {
          logger.debug('Torrent not in client list, nothing to remove', { infohash });
          resolve(true);
          return;
        }

        logger.debug('Removing torrent from client', { infohash });
        // Use type assertion since WebTorrent types don't match runtime behavior
        // At runtime, remove() accepts (torrentId, callback) but types say (torrentId, opts)
        (this.client.remove as (torrentId: string, callback: (err: Error | null) => void) => void)(
          infohash,
          (err: Error | null) => {
            if (err) {
              logger.warn('Error removing torrent', { infohash, error: String(err) });
              resolve(false);
            } else {
              logger.debug('Torrent removed successfully', { infohash });
              resolve(true);
            }
          }
        );
      } catch (err) {
        logger.warn('Exception while removing torrent', { infohash, error: String(err) });
        resolve(false);
      }
    });
  }

  /**
   * Enhance a magnet URI with additional trackers for better peer discovery
   * This is especially important in cloud environments where UDP is blocked
   * HTTP trackers are prioritized as they work on cloud platforms
   */
  private enhanceMagnetUri(magnetUri: string): string {
    // Add trackers that aren't already in the magnet URI
    let enhanced = magnetUri;
    let addedCount = 0;
    
    for (const tracker of OPEN_TRACKERS) {
      const encodedTracker = encodeURIComponent(tracker);
      if (!magnetUri.includes(encodedTracker) && !magnetUri.includes(tracker)) {
        enhanced += `&tr=${encodedTracker}`;
        addedCount++;
      }
    }
    
    logger.debug('Enhanced magnet URI with additional trackers', {
      originalLength: magnetUri.length,
      enhancedLength: enhanced.length,
      totalTrackers: OPEN_TRACKERS.length,
      addedTrackers: addedCount,
    });
    
    return enhanced;
  }

  /**
   * Get an existing torrent or add a new one
   */
  private async getOrAddTorrent(magnetUri: string, infohash: string): Promise<WebTorrent.Torrent> {
    logger.debug('Getting or adding torrent', { infohash });
    const startTime = Date.now();

    // Check if torrent already exists in the client's torrent list
    const existingInList = this.client.torrents.find(t => t.infoHash === infohash);
    if (existingInList) {
      // Validate that the torrent object is valid (has expected methods)
      if (this.isValidTorrent(existingInList)) {
        if (existingInList.ready) {
          logger.debug('Using existing ready torrent', { infohash, name: existingInList.name });
          return existingInList;
        }
        
        // Torrent exists but not ready - wait for it to become ready
        logger.debug('Waiting for existing non-ready torrent', { infohash });
        return this.waitForTorrentReady(existingInList, infohash, startTime);
      } else {
        // Invalid torrent object - remove it first before adding fresh
        logger.warn('Found invalid torrent object in list, removing before re-adding', {
          infohash,
          existingType: typeof existingInList,
          hasOn: typeof (existingInList as { on?: unknown }).on
        });
        await this.safeRemoveTorrent(infohash);
      }
    }

    logger.debug('Adding new torrent', { infohash });

    // Enhance magnet URI with additional trackers for better peer discovery
    const enhancedMagnetUri = this.enhanceMagnetUri(magnetUri);

    // Add new torrent and wait for it to be ready
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let torrent: WebTorrent.Torrent | null = null;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const removeTorrentAndReject = (error: StreamingError): void => {
        cleanup();
        if (torrent) {
          logger.debug('Removing torrent after failure', { infohash });
          // Use type assertion since WebTorrent types don't match runtime behavior
          // The remove method accepts a callback as second argument at runtime
          (this.client.remove as (torrent: WebTorrent.Torrent, callback?: () => void) => void)(torrent, () => {
            logger.debug('Torrent removed after failure', { infohash });
          });
        }
        reject(error);
      };

      timeoutId = setTimeout(() => {
        logger.warn('Torrent metadata fetch timeout', {
          infohash,
          timeout: this.streamTimeout,
          elapsed: `${Date.now() - startTime}ms`
        });
        removeTorrentAndReject(new StreamingError(`Torrent metadata fetch timed out after ${this.streamTimeout}ms`));
      }, this.streamTimeout);

      torrent = this.client.add(enhancedMagnetUri, (t) => {
        logger.debug('Torrent add callback fired', {
          infohash: t.infoHash,
          ready: t.ready,
          numPeers: t.numPeers
        });

        // Wait for ready event
        const onReady = (): void => {
          cleanup();
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
          numPeers: torrent?.numPeers
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
        logger.error('Torrent error', err, { infohash });
        removeTorrentAndReject(new StreamingError(`Torrent error: ${err.message}`));
      });
    });
  }

  /**
   * Wait for an existing torrent to become ready
   */
  private waitForTorrentReady(torrent: WebTorrent.Torrent, infohash: string, startTime: number): Promise<WebTorrent.Torrent> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const removeTorrentAndReject = (error: StreamingError): void => {
        cleanup();
        logger.debug('Removing torrent after failure', { infohash });
        // Use type assertion since WebTorrent types don't match runtime behavior
        // The remove method accepts a callback as second argument at runtime
        (this.client.remove as (torrent: WebTorrent.Torrent, callback?: () => void) => void)(torrent, () => {
          logger.debug('Torrent removed after failure', { infohash });
        });
        reject(error);
      };

      timeoutId = setTimeout(() => {
        logger.warn('Torrent metadata fetch timeout (waiting for existing)', {
          infohash,
          timeout: this.streamTimeout,
          elapsed: `${Date.now() - startTime}ms`
        });
        removeTorrentAndReject(new StreamingError(`Torrent metadata fetch timed out after ${this.streamTimeout}ms`));
      }, this.streamTimeout);

      const onReady = (): void => {
        cleanup();
        logger.info('Existing torrent ready', {
          infohash: torrent.infoHash,
          name: torrent.name,
          fileCount: torrent.files.length,
          totalSize: torrent.length,
          numPeers: torrent.numPeers,
          elapsed: `${Date.now() - startTime}ms`
        });
        // Deselect all files initially
        torrent.deselect(0, torrent.pieces.length - 1, 0);
        resolve(torrent);
      };

      // Check if already ready (race condition protection)
      if (torrent.ready) {
        onReady();
        return;
      }

      torrent.on('ready', onReady);

      // Use type assertion for error event since WebTorrent types are incomplete
      (torrent as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
        logger.error('Torrent error (waiting for existing)', err, { infohash });
        removeTorrentAndReject(new StreamingError(`Torrent error: ${err.message}`));
      });
    });
  }

  /**
   * Wait for data to be available at a specific position in the file
   * This prevents MEDIA_ELEMENT_ERROR when the browser receives empty data
   *
   * @param torrent - The torrent object
   * @param file - The file to wait for
   * @param startByte - The byte position to wait for (default: 0)
   */
  private async waitForData(
    torrent: WebTorrent.Torrent,
    file: WebTorrent.TorrentFile,
    startByte: number
  ): Promise<void> {
    const startTime = Date.now();
    const pieceLength = torrent.pieceLength;
    
    // Calculate which piece contains the start byte
    // File offset within torrent + start byte position
    const fileOffset = (file as unknown as { offset: number }).offset ?? 0;
    const absolutePosition = fileOffset + startByte;
    const startPiece = Math.floor(absolutePosition / pieceLength);
    
    logger.debug('Waiting for data', {
      fileName: file.name,
      startByte,
      fileOffset,
      absolutePosition,
      startPiece,
      pieceLength,
      totalPieces: torrent.pieces.length,
    });

    // Type assertion for bitfield which exists at runtime but not in types
    const bitfield = (torrent as unknown as { bitfield?: { get: (index: number) => boolean } }).bitfield;

    // Check if the piece is already downloaded
    if (bitfield?.get(startPiece)) {
      logger.debug('Start piece already downloaded', { startPiece });
      return;
    }

    // Wait for the piece to be downloaded
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let downloadHandler: ((piece: number) => void) | null = null;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (downloadHandler && typeof torrent.removeListener === 'function') {
          torrent.removeListener('download', downloadHandler);
          downloadHandler = null;
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        const elapsed = Date.now() - startTime;
        logger.warn('Timeout waiting for data', {
          fileName: file.name,
          startPiece,
          elapsed: `${elapsed}ms`,
          timeout: this.streamTimeout,
          progress: torrent.progress,
          numPeers: torrent.numPeers,
        });
        reject(new StreamingError(
          `Timeout waiting for data. No peers available or download too slow. ` +
          `Progress: ${(torrent.progress * 100).toFixed(1)}%, Peers: ${torrent.numPeers}`
        ));
      }, this.streamTimeout);

      // Get bitfield reference for use in callbacks
      const getBitfield = (): { get: (index: number) => boolean } | undefined =>
        (torrent as unknown as { bitfield?: { get: (index: number) => boolean } }).bitfield;

      // Listen for download events
      downloadHandler = (): void => {
        // Check if our piece is now available
        const bf = getBitfield();
        if (bf?.get(startPiece)) {
          cleanup();
          const elapsed = Date.now() - startTime;
          logger.info('Data now available', {
            fileName: file.name,
            startPiece,
            elapsed: `${elapsed}ms`,
            progress: torrent.progress,
            numPeers: torrent.numPeers,
          });
          resolve();
        }
      };

      torrent.on('download', downloadHandler);

      // Also check periodically in case we missed the event
      const checkInterval = setInterval(() => {
        const bf = getBitfield();
        if (bf?.get(startPiece)) {
          clearInterval(checkInterval);
          cleanup();
          const elapsed = Date.now() - startTime;
          logger.info('Data now available (periodic check)', {
            fileName: file.name,
            startPiece,
            elapsed: `${elapsed}ms`,
          });
          resolve();
        }
      }, 500);

      // Clean up interval on timeout or success
      const originalCleanup = cleanup;
      const cleanupWithInterval = (): void => {
        clearInterval(checkInterval);
        originalCleanup();
      };
      
      // Replace cleanup with the one that also clears interval
      timeoutId = setTimeout(() => {
        cleanupWithInterval();
        const elapsed = Date.now() - startTime;
        logger.warn('Timeout waiting for data', {
          fileName: file.name,
          startPiece,
          elapsed: `${elapsed}ms`,
          timeout: this.streamTimeout,
          progress: torrent.progress,
          numPeers: torrent.numPeers,
        });
        reject(new StreamingError(
          `Timeout waiting for data. No peers available or download too slow. ` +
          `Progress: ${(torrent.progress * 100).toFixed(1)}%, Peers: ${torrent.numPeers}`
        ));
      }, this.streamTimeout);
    });
  }
}
