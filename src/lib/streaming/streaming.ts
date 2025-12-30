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
import { getWebTorrentDir, ensureDir } from '../config';

const logger = createLogger('StreamingService');

// Well-known DHT bootstrap nodes for reliable peer discovery
// More nodes = faster DHT bootstrapping
const DHT_BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
  'dht.aelitis.com:6881',
  'router.bitcomet.com:6881',
  'dht.libtorrent.org:25401',
];

// HTTP/HTTPS trackers - PRIORITIZED for cloud environments where UDP is blocked
// These work on all platforms including DigitalOcean, Railway, etc.
// Ordered by reliability and response time
const HTTP_TRACKERS = [
  // Most reliable HTTP trackers (tested and working)
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.openbittorrent.com:80/announce',
  'http://open.tracker.cl:1337/announce',
  'http://tracker.torrent.eu.org:451/announce',
  'http://tracker.dler.org:6969/announce',
  'http://bt.endpot.com:80/announce',
  'http://tracker.mywaifu.best:6969/announce',
  'http://tracker.gbitt.info:80/announce',
  'http://open.acgnxtracker.com:80/announce',
  'http://tracker1.bt.moack.co.kr:80/announce',
  'http://tracker.files.fm:6969/announce',
  'http://tracker.zerobytes.xyz:1337/announce',
  // HTTPS trackers (may have SSL issues on some platforms)
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.loligirl.cn:443/announce',
  'https://tracker.lilithraws.org:443/announce',
  'https://opentracker.i2p.rocks:443/announce',
];

// WebSocket trackers - work in browsers and some cloud environments
const WEBSOCKET_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

// UDP trackers - FASTEST when available but often blocked on cloud platforms
// These are deprioritized because they timeout on DigitalOcean, Railway, etc.
const UDP_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
];

// Combined tracker list: HTTP first (works on cloud), then WebSocket, then UDP (often blocked)
// This order is optimized for cloud platforms like DigitalOcean where UDP is blocked
const OPEN_TRACKERS = [...HTTP_TRACKERS, ...WEBSOCKET_TRACKERS, ...UDP_TRACKERS];

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
  /** Timeout for stream operations in milliseconds (default: 90000) */
  streamTimeout?: number;
  /** Delay before removing torrent after last watcher disconnects in milliseconds (default: 30000) */
  torrentCleanupDelay?: number;
}

/**
 * Minimum buffer size in bytes before an audio file is considered "ready" for streaming
 * 2MB is enough for most audio files to start playing without buffering
 */
const MIN_AUDIO_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Minimum buffer size in bytes before a video file is considered "ready" for streaming
 * Video files need more buffer due to higher bitrates and transcoding overhead
 * 10MB provides enough buffer for FFmpeg to start transcoding without stalling
 */
const MIN_VIDEO_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Live torrent statistics from DHT/peers
 */
export interface TorrentStats {
  /** Torrent infohash */
  infohash: string;
  /** Number of peers currently connected (from DHT) */
  numPeers: number;
  /** Download progress (0-1) - overall torrent progress */
  progress: number;
  /** File-specific download progress (0-1) - only set if fileIndex was provided */
  fileProgress?: number;
  /** Download speed in bytes/second */
  downloadSpeed: number;
  /** Upload speed in bytes/second */
  uploadSpeed: number;
  /** Whether the torrent metadata is ready */
  ready: boolean;
  /** Whether the file has enough data buffered for streaming (2MB or complete) */
  fileReady?: boolean;
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
 * Default cleanup delay: 30 seconds after last watcher disconnects
 */
const DEFAULT_CLEANUP_DELAY = 30000;

/**
 * Watcher tracking for a torrent
 */
interface TorrentWatchers {
  /** Set of active watcher IDs */
  watchers: Set<string>;
  /** Cleanup timer (if scheduled) */
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Service for streaming media files from torrents
 */
export class StreamingService {
  private client: WebTorrent.Instance;
  private maxConcurrentStreams: number;
  private streamTimeout: number;
  private torrentCleanupDelay: number;
  private activeStreams: Map<string, ActiveStream>;
  private torrentWatchers: Map<string, TorrentWatchers>;
  private dhtReady: boolean = false;
  private dhtNodeCount: number = 0;

  constructor(options: StreamingServiceOptions = {}) {
    // Get and ensure WebTorrent download directory exists
    const downloadPath = getWebTorrentDir();
    ensureDir(downloadPath);

    logger.info('Initializing StreamingService', {
      maxConcurrentStreams: options.maxConcurrentStreams ?? 10,
      streamTimeout: options.streamTimeout ?? 90000,
      torrentCleanupDelay: options.torrentCleanupDelay ?? DEFAULT_CLEANUP_DELAY,
      downloadPath,
    });
    
    // Configure WebTorrent with DHT bootstrap nodes for trackerless operation
    // Note: DHT requires UDP which may be blocked on cloud platforms
    this.client = new WebTorrent({
      dht: {
        bootstrap: DHT_BOOTSTRAP_NODES,
        // Increase concurrency for faster DHT bootstrapping
        concurrency: 32,
      },
      // Enable all peer discovery methods
      tracker: true,
      lsd: true, // Local Service Discovery
      webSeeds: true,
      // Increase max connections for better peer discovery
      maxConns: 100,
      // Use configured download path instead of /tmp/webtorrent
      path: downloadPath,
    } as WebTorrent.Options);
    
    this.maxConcurrentStreams = options.maxConcurrentStreams ?? 10;
    this.streamTimeout = options.streamTimeout ?? 90000;
    this.torrentCleanupDelay = options.torrentCleanupDelay ?? DEFAULT_CLEANUP_DELAY;
    this.activeStreams = new Map();
    this.torrentWatchers = new Map();
    
    // Log client events
    this.client.on('error', (err) => {
      logger.error('WebTorrent client error', err);
    });
    
    // Log DHT events for debugging and track DHT state
    const dht = (this.client as unknown as { dht?: { on: (event: string, cb: (...args: unknown[]) => void) => void; toJSON?: () => { nodes: unknown[] } } }).dht;
    if (dht) {
      dht.on('ready', () => {
        this.dhtReady = true;
        // Note: "ready" just means DHT is initialized, NOT that it has connected to nodes
        // Check dhtNodeCount to see if UDP is actually working
        logger.info('DHT initialized (waiting for nodes via UDP)', {
          note: 'If dhtNodeCount stays at 0, UDP is likely blocked on this platform',
        });
      });
      dht.on('peer', (peer: unknown, infoHash: unknown) => {
        logger.info('DHT found peer via UDP!', { peer, infoHash });
      });
      dht.on('node', () => {
        this.dhtNodeCount++;
        // Log first node connection - this confirms UDP is working
        if (this.dhtNodeCount === 1) {
          logger.info('DHT connected to first node - UDP is working!', { nodes: this.dhtNodeCount });
        } else if (this.dhtNodeCount % 50 === 0) {
          logger.info('DHT node count', { nodes: this.dhtNodeCount });
        }
      });
      dht.on('error', (err: unknown) => {
        logger.warn('DHT error - UDP may be blocked on this platform', {
          error: String(err),
          hint: 'Check firewall settings for outbound UDP on ports 6881, 6969',
        });
      });
      
      // Check DHT status after 10 seconds
      setTimeout(() => {
        if (this.dhtNodeCount === 0) {
          logger.warn('DHT has 0 nodes after 10 seconds - UDP is likely blocked', {
            dhtReady: this.dhtReady,
            dhtNodeCount: this.dhtNodeCount,
            hint: 'Enable outbound UDP in firewall settings, or use HTTP trackers only',
          });
        } else {
          logger.info('DHT is working', { dhtNodeCount: this.dhtNodeCount });
        }
      }, 10000);
    } else {
      logger.warn('DHT not available on WebTorrent client');
    }
    
    logger.debug('WebTorrent client created for streaming with DHT bootstrap nodes', {
      bootstrapNodes: DHT_BOOTSTRAP_NODES.length,
    });
  }

  /**
   * Get DHT status for debugging
   */
  getDhtStatus(): { ready: boolean; nodeCount: number } {
    return {
      ready: this.dhtReady,
      nodeCount: this.dhtNodeCount,
    };
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

    // Log current download state
    const fileProgress = (file as unknown as { progress: number }).progress ?? 0;
    const downloadedBytes = fileProgress * file.length;
    logger.info('File download state before streaming', {
      fileName: file.name,
      fileSize: file.length,
      fileProgress: (fileProgress * 100).toFixed(2) + '%',
      downloadedBytes,
      downloadedMB: (downloadedBytes / (1024 * 1024)).toFixed(2),
      numPeers: torrent.numPeers,
      downloadSpeed: torrent.downloadSpeed,
      skipWaitForData,
    });

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

    // Clean up on stream end, error, or close
    // 'end' fires when stream is fully consumed
    // 'error' fires on stream errors
    // 'close' fires when the underlying resource is closed (e.g., client disconnects)
    const cleanupStream = (): void => {
      if (this.activeStreams.has(streamId)) {
        this.activeStreams.delete(streamId);
        logger.debug('Stream cleaned up', { streamId, activeStreams: this.activeStreams.size });
      }
    };

    stream.on('end', () => {
      logger.debug('Stream ended', { streamId });
      cleanupStream();
    });
    stream.on('error', (err) => {
      logger.error('Stream error', err, { streamId });
      cleanupStream();
    });
    stream.on('close', () => {
      logger.debug('Stream closed (client disconnected)', { streamId });
      cleanupStream();
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
   * Select a file for download priority
   * This tells WebTorrent to prioritize downloading pieces for this specific file
   *
   * @param infohash - The torrent infohash
   * @param fileIndex - The file index to prioritize
   * @returns true if file was selected, false if torrent/file not found
   */
  selectFileForDownload(infohash: string, fileIndex: number): boolean {
    const torrent = this.client.torrents.find(t => t.infoHash === infohash);
    if (!torrent || !torrent.ready) {
      return false;
    }

    if (fileIndex < 0 || fileIndex >= torrent.files.length) {
      return false;
    }

    const file = torrent.files[fileIndex];
    file.select();
    logger.debug('File selected for download priority via selectFileForDownload', {
      infohash,
      fileIndex,
      fileName: file.name,
    });
    return true;
  }

  /**
   * Add a torrent by magnet URI if not already added
   * This is used by the status endpoint to ensure the torrent is being downloaded
   *
   * @param magnetUri - The magnet URI to add
   * @returns Promise that resolves when torrent is added (not necessarily ready)
   */
  async addTorrentIfNeeded(magnetUri: string): Promise<void> {
    const infohash = extractInfohash(magnetUri);
    if (!infohash) {
      throw new StreamingError('Could not extract infohash from magnet URI');
    }

    // Check if torrent already exists
    const existing = this.client.torrents.find(t => t.infoHash === infohash);
    if (existing) {
      logger.debug('Torrent already exists in client', { infohash });
      return;
    }

    logger.info('Adding torrent for status tracking', { infohash });

    // Enhance magnet URI with additional trackers
    const enhancedMagnetUri = this.enhanceMagnetUri(magnetUri);

    // Add the torrent (don't wait for ready - status endpoint will poll)
    return new Promise((resolve, reject) => {
      try {
        const torrent = this.client.add(enhancedMagnetUri);
        
        // Log peer connections (debug level to avoid log spam)
        torrent.on('wire', (wire) => {
          logger.debug('Peer connected (status tracking)', {
            infohash,
            peerAddress: wire.remoteAddress,
            numPeers: torrent.numPeers,
          });
        });

        // Log when ready
        torrent.on('ready', () => {
          logger.info('Torrent ready (status tracking)', {
            infohash,
            name: torrent.name,
            fileCount: torrent.files.length,
          });
          // Deselect all files initially - status endpoint will select specific files
          torrent.deselect(0, torrent.pieces.length - 1, 0);
        });

        torrent.on('warning', (warn) => {
          const warnStr = String(warn);
          if (!warnStr.includes('fetch failed')) {
            logger.warn('Torrent warning (status tracking)', { infohash, warning: warnStr });
          }
        });

        // Use type assertion for error event
        (torrent as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
          logger.error('Torrent error (status tracking)', err, { infohash });
        });

        // Resolve immediately - we don't wait for ready
        resolve();
      } catch (err) {
        logger.error('Failed to add torrent for status tracking', err as Error, { infohash });
        reject(new StreamingError(`Failed to add torrent: ${(err as Error).message}`));
      }
    });
  }

  /**
   * Get live statistics for a torrent from DHT/connected peers
   * This provides real-time peer counts that are more accurate than tracker scraping
   *
   * @param infohash - The torrent infohash
   * @param fileIndex - Optional file index to get file-specific progress
   * @param selectFile - If true and fileIndex is provided, select the file for download priority
   * @returns TorrentStats or null if torrent is not loaded
   */
  getTorrentStats(infohash: string, fileIndex?: number, selectFile = false): TorrentStats | null {
    const torrent = this.client.torrents.find(t => t.infoHash === infohash);
    if (!torrent) {
      return null;
    }

    const stats: TorrentStats = {
      infohash: torrent.infoHash,
      numPeers: torrent.numPeers,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      ready: torrent.ready,
    };

    // Add file-specific progress and ready state if fileIndex is provided
    if (fileIndex !== undefined && fileIndex >= 0 && fileIndex < torrent.files.length) {
      const file = torrent.files[fileIndex];
      
      // Select file for download priority if requested and torrent is ready
      if (selectFile && torrent.ready) {
        file.select();
      }
      
      // WebTorrent files have a progress property (0-1) for file-specific progress
      const fileProgress = (file as unknown as { progress: number }).progress ?? 0;
      stats.fileProgress = fileProgress;
      
      // Determine minimum buffer size based on media type
      const mediaCategory = getMediaCategory(file.name);
      const minBufferSize = mediaCategory === 'video' ? MIN_VIDEO_BUFFER_SIZE : MIN_AUDIO_BUFFER_SIZE;
      
      // Calculate if file has enough data buffered for streaming
      // File is ready if:
      // 1. File is completely downloaded (progress >= 1), OR
      // 2. File has at least minBufferSize bytes downloaded, OR
      // 3. File is smaller than minBufferSize and is complete
      const downloadedBytes = fileProgress * file.length;
      const isComplete = fileProgress >= 1;
      const hasMinBuffer = downloadedBytes >= minBufferSize;
      const isSmallAndComplete = file.length < minBufferSize && isComplete;
      
      stats.fileReady = torrent.ready && (isComplete || hasMinBuffer || isSmallAndComplete);
    }

    return stats;
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
   * Register a watcher for a torrent (e.g., when SSE connection opens)
   * This tracks active viewers to know when to clean up torrents.
   *
   * @param infohash - The torrent infohash
   * @returns A unique watcher ID to use when unregistering
   */
  registerWatcher(infohash: string): string {
    const watcherId = randomUUID();
    
    let watcherInfo = this.torrentWatchers.get(infohash);
    if (!watcherInfo) {
      watcherInfo = {
        watchers: new Set(),
        cleanupTimer: null,
      };
      this.torrentWatchers.set(infohash, watcherInfo);
    }
    
    // Cancel any pending cleanup since we have a new watcher
    if (watcherInfo.cleanupTimer) {
      clearTimeout(watcherInfo.cleanupTimer);
      watcherInfo.cleanupTimer = null;
      logger.debug('Cancelled pending torrent cleanup due to new watcher', { infohash });
    }
    
    watcherInfo.watchers.add(watcherId);
    
    logger.debug('Watcher registered', {
      infohash,
      watcherId,
      totalWatchers: watcherInfo.watchers.size,
    });
    
    return watcherId;
  }

  /**
   * Unregister a watcher for a torrent (e.g., when SSE connection closes)
   * If this was the last watcher, schedules torrent removal after a grace period.
   *
   * @param infohash - The torrent infohash
   * @param watcherId - The watcher ID returned from registerWatcher
   */
  unregisterWatcher(infohash: string, watcherId: string): void {
    const watcherInfo = this.torrentWatchers.get(infohash);
    if (!watcherInfo) {
      logger.debug('No watcher info found for infohash', { infohash, watcherId });
      return;
    }
    
    // Remove this watcher
    const wasRemoved = watcherInfo.watchers.delete(watcherId);
    if (!wasRemoved) {
      logger.debug('Watcher ID not found', { infohash, watcherId });
      return;
    }
    
    logger.debug('Watcher unregistered', {
      infohash,
      watcherId,
      remainingWatchers: watcherInfo.watchers.size,
    });
    
    // If no more watchers, schedule cleanup
    if (watcherInfo.watchers.size === 0) {
      this.scheduleCleanup(infohash);
    }
  }

  /**
   * Get the number of active watchers for a torrent
   *
   * @param infohash - The torrent infohash
   * @returns Number of active watchers (0 if none)
   */
  getActiveWatcherCount(infohash: string): number {
    const watcherInfo = this.torrentWatchers.get(infohash);
    return watcherInfo?.watchers.size ?? 0;
  }

  /**
   * Schedule torrent removal after the cleanup delay
   * This is called when the last watcher disconnects.
   */
  private scheduleCleanup(infohash: string): void {
    const watcherInfo = this.torrentWatchers.get(infohash);
    if (!watcherInfo) {
      return;
    }
    
    // Cancel any existing cleanup timer
    if (watcherInfo.cleanupTimer) {
      clearTimeout(watcherInfo.cleanupTimer);
    }
    
    logger.info('Scheduling torrent cleanup', {
      infohash,
      delayMs: this.torrentCleanupDelay,
    });
    
    watcherInfo.cleanupTimer = setTimeout(() => {
      // Double-check no new watchers connected during the delay
      const currentInfo = this.torrentWatchers.get(infohash);
      if (currentInfo && currentInfo.watchers.size === 0) {
        logger.info('Removing torrent after cleanup delay (no active watchers)', { infohash });
        
        // Remove the torrent from WebTorrent client
        (this.client.remove as (torrentId: string, callback: (err: Error | null) => void) => void)(
          infohash,
          (err: Error | null) => {
            if (err) {
              logger.warn('Error removing torrent during cleanup', { infohash, error: String(err) });
            } else {
              logger.info('Torrent removed successfully (DMCA protection)', { infohash });
            }
          }
        );
        
        // Clean up watcher tracking
        this.torrentWatchers.delete(infohash);
      } else {
        logger.debug('Cleanup cancelled - new watchers connected', {
          infohash,
          watcherCount: currentInfo?.watchers.size ?? 0,
        });
      }
    }, this.torrentCleanupDelay);
  }

  /**
   * Destroy the service and clean up all resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying StreamingService', {
      activeStreams: this.activeStreams.size,
      activeWatchers: this.torrentWatchers.size,
    });

    // Clear all cleanup timers
    for (const [infohash, watcherInfo] of this.torrentWatchers) {
      if (watcherInfo.cleanupTimer) {
        clearTimeout(watcherInfo.cleanupTimer);
        logger.debug('Cleared cleanup timer during destroy', { infohash });
      }
    }
    this.torrentWatchers.clear();

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
   *
   * Priority order (optimized for cloud platforms where UDP is blocked):
   * 1. DHT (always enabled via WebTorrent config - but may not work on cloud)
   * 2. Our HTTP/HTTPS trackers (most reliable on cloud platforms)
   * 3. Our WebSocket trackers (work in browsers and some cloud)
   * 4. Our UDP trackers (fastest but often blocked on cloud)
   * 5. Original magnet URL trackers (last priority)
   *
   * This function rebuilds the magnet URI to put our trackers FIRST,
   * ensuring faster peer discovery on cloud platforms.
   */
  private enhanceMagnetUri(magnetUri: string): string {
    // Extract infohash from magnet URI
    const infohash = extractInfohash(magnetUri);
    if (!infohash) {
      logger.warn('Could not extract infohash for enhancement, returning original');
      return magnetUri;
    }
    
    // Extract display name if present
    const dnMatch = magnetUri.match(/[?&]dn=([^&]+)/);
    const displayName = dnMatch ? decodeURIComponent(dnMatch[1]) : null;
    
    // Extract original trackers
    const originalTrackers: string[] = [];
    const trMatches = magnetUri.matchAll(/[?&]tr=([^&]+)/g);
    for (const match of trMatches) {
      try {
        originalTrackers.push(decodeURIComponent(match[1]));
      } catch {
        // Skip invalid tracker URLs
      }
    }
    
    // Build a new magnet URI with our trackers FIRST, then original trackers
    let enhanced = `magnet:?xt=urn:btih:${infohash}`;
    
    // Add display name if present
    if (displayName) {
      enhanced += `&dn=${encodeURIComponent(displayName)}`;
    }
    
    // Add OUR trackers FIRST (highest priority after DHT)
    let addedCount = 0;
    const addedTrackers = new Set<string>();
    
    for (const tracker of OPEN_TRACKERS) {
      const normalizedTracker = tracker.toLowerCase();
      if (!addedTrackers.has(normalizedTracker)) {
        enhanced += `&tr=${encodeURIComponent(tracker)}`;
        addedTrackers.add(normalizedTracker);
        addedCount++;
      }
    }
    
    // Add original magnet trackers LAST (lowest priority)
    let originalCount = 0;
    for (const tracker of originalTrackers) {
      const normalizedTracker = tracker.toLowerCase();
      if (!addedTrackers.has(normalizedTracker)) {
        enhanced += `&tr=${encodeURIComponent(tracker)}`;
        addedTrackers.add(normalizedTracker);
        originalCount++;
      }
    }
    
    logger.info('Enhanced magnet URI - our trackers FIRST, original trackers LAST', {
      ourTrackersAdded: addedCount,
      originalTrackersAdded: originalCount,
      totalTrackers: addedTrackers.size,
      priority: 'HTTP → WSS → UDP → Original (optimized for cloud)',
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

    logger.info('Adding new torrent', {
      infohash,
      dhtReady: this.dhtReady,
      dhtNodeCount: this.dhtNodeCount,
    });

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

      // Log peer connections (debug level to avoid log spam)
      torrent.on('wire', (wire) => {
        logger.debug('Peer connected', {
          infohash,
          peerAddress: wire.remoteAddress,
          numPeers: torrent?.numPeers,
          elapsed: `${Date.now() - startTime}ms`,
        });
      });

      // Log tracker announcements (event exists at runtime but not in types)
      (torrent as unknown as NodeJS.EventEmitter).on('trackerAnnounce', () => {
        logger.info('Tracker announce successful', {
          infohash,
          numPeers: torrent?.numPeers,
          elapsed: `${Date.now() - startTime}ms`,
        });
      });

      torrent.on('warning', (warn) => {
        // Only log non-fetch warnings at warn level, fetch failures are common
        const warnStr = String(warn);
        if (warnStr.includes('fetch failed')) {
          logger.debug('Tracker fetch failed (common on cloud platforms)', {
            infohash,
            warning: warnStr.substring(0, 100),
          });
        } else {
          logger.warn('Torrent warning', {
            infohash,
            warning: warnStr,
          });
        }
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
