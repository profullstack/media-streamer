/**
 * WebTorrent Metadata Service
 * 
 * Fetches torrent metadata (file list, sizes, piece info) without downloading content.
 * This is a SERVER-SIDE ONLY service.
 */

import WebTorrent from 'webtorrent';
import { validateMagnetUri, parseMagnetUri } from '../magnet';
import { getMediaCategory, getMimeType } from '../utils';
import { createLogger } from '../logger';

const logger = createLogger('TorrentService');

/**
 * Custom error for metadata fetch failures
 */
export class TorrentMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TorrentMetadataError';
  }
}

/**
 * Custom error for timeout during metadata fetch
 */
export class TorrentTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TorrentTimeoutError';
  }
}

/**
 * Information about a single file in a torrent
 */
export interface TorrentFileInfo {
  /** Index of the file in the torrent */
  index: number;
  /** File name (without path) */
  name: string;
  /** Full path within the torrent */
  path: string;
  /** File size in bytes */
  size: number;
  /** Byte offset within the torrent */
  offset: number;
  /** First piece index containing this file */
  pieceStart: number;
  /** Last piece index containing this file */
  pieceEnd: number;
  /** File extension (lowercase, without dot) or null */
  extension: string | null;
  /** Media category (audio, video, ebook, document, other) */
  mediaCategory: 'audio' | 'video' | 'ebook' | 'document' | 'other';
  /** MIME type or null if unknown */
  mimeType: string | null;
}

/**
 * Metadata for a torrent
 */
export interface TorrentMetadata {
  /** Torrent infohash (40 character hex string) */
  infohash: string;
  /** Torrent name */
  name: string;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Piece length in bytes */
  pieceLength: number;
  /** List of files in the torrent */
  files: TorrentFileInfo[];
  /** Original magnet URI */
  magnetUri: string;
  /** Number of seeders (peers with complete copies), null if unknown */
  seeders: number | null;
  /** Number of leechers (peers downloading), null if unknown */
  leechers: number | null;
}

/**
 * Options for TorrentService
 */
export interface TorrentServiceOptions {
  /** Timeout for metadata fetch in milliseconds (default: 60000) */
  metadataTimeout?: number;
}

/**
 * Progress event stages during metadata fetch
 */
export type MetadataProgressStage =
  | 'connecting'    // Initial connection to DHT/trackers
  | 'searching'     // Searching for peers
  | 'downloading'   // Downloading metadata from peers
  | 'complete'      // Metadata fetch complete
  | 'error';        // Error occurred

/**
 * Progress event emitted during metadata fetch
 */
export interface MetadataProgressEvent {
  /** Current stage of the metadata fetch */
  stage: MetadataProgressStage;
  /** Progress percentage (0-100) */
  progress: number;
  /** Number of connected peers */
  numPeers: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Human-readable status message */
  message: string;
  /** Infohash of the torrent */
  infohash: string;
}

/**
 * Callback for progress events during metadata fetch
 */
export type MetadataProgressCallback = (event: MetadataProgressEvent) => void;

// Default timeout for metadata fetch (60 seconds)
// Can be overridden via TORRENT_METADATA_TIMEOUT_MS environment variable
const DEFAULT_METADATA_TIMEOUT = parseInt(
  process.env.TORRENT_METADATA_TIMEOUT_MS ?? '60000',
  10
);

// Well-known DHT bootstrap nodes for reliable peer discovery
// DHT is the PRIMARY peer discovery method - it's decentralized and fast
// Note: DHT requires UDP which may be blocked on some cloud platforms
const DHT_BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
  'dht.aelitis.com:6881',
];

// UDP trackers - FASTEST for peer discovery when UDP is available
// These are prioritized because they're faster than HTTP trackers
// Will timeout on cloud platforms that block UDP
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
  'udp://retracker01-msk-virt.corbina.net:80/announce',
];

// WebSocket trackers - work in browsers and some cloud platforms
const WEBSOCKET_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

// HTTP/HTTPS trackers - fallback for cloud environments where UDP is blocked
// These are slower but work on all platforms
// Prioritizing port 80 and 443 which are most likely to work
const HTTP_TRACKERS = [
  // Port 80 (HTTP)
  'http://tracker.openbittorrent.com:80/announce',
  'http://tracker.gbitt.info:80/announce',
  'http://open.acgnxtracker.com:80/announce',
  'http://tracker1.bt.moack.co.kr:80/announce',
  // Port 443 (HTTPS)
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.loligirl.cn:443/announce',
  'https://tracker.lilithraws.org:443/announce',
  // Non-standard ports (may be blocked on some cloud platforms)
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.bt4g.com:2095/announce',
];

/**
 * Service for fetching torrent metadata without downloading content
 */
export class TorrentService {
  private client: WebTorrent.Instance;
  private metadataTimeout: number;

  constructor(options: TorrentServiceOptions = {}) {
    const timeout = options.metadataTimeout ?? DEFAULT_METADATA_TIMEOUT;
    
    logger.info('Initializing TorrentService', {
      timeout,
      defaultTimeout: DEFAULT_METADATA_TIMEOUT,
      dhtBootstrapNodes: DHT_BOOTSTRAP_NODES,
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
    
    this.metadataTimeout = timeout;
    
    // Log client events
    this.client.on('error', (err) => {
      logger.error('WebTorrent client error', err);
    });
    
    // Log DHT events for debugging
    const dht = (this.client as unknown as { dht?: { on: (event: string, cb: (...args: unknown[]) => void) => void } }).dht;
    if (dht) {
      dht.on('ready', () => {
        logger.info('DHT ready - connected to bootstrap nodes');
      });
      dht.on('peer', (peer: unknown, infoHash: unknown) => {
        logger.debug('DHT found peer', { peer, infoHash });
      });
      dht.on('node', () => {
        logger.debug('DHT discovered new node');
      });
      dht.on('error', (err: unknown) => {
        logger.error('DHT error', err instanceof Error ? err : new Error(String(err)));
      });
    } else {
      logger.warn('DHT not available on WebTorrent client');
    }
    
    logger.debug('WebTorrent client created with DHT bootstrap nodes', {
      bootstrapNodes: DHT_BOOTSTRAP_NODES.length,
    });
  }

  /**
   * Fetch metadata for a torrent from a magnet URI
   *
   * This fetches ONLY the metadata (file list, sizes, etc.) without downloading
   * any actual file content.
   *
   * @param magnetUri - The magnet URI to fetch metadata for
   * @param onProgress - Optional callback for progress events
   * @returns Promise resolving to torrent metadata
   * @throws TorrentMetadataError if the magnet URI is invalid
   * @throws TorrentTimeoutError if metadata fetch times out
   */
  async fetchMetadata(
    magnetUri: string,
    onProgress?: MetadataProgressCallback
  ): Promise<TorrentMetadata> {
    const startTime = Date.now();
    logger.info('Starting metadata fetch', {
      magnetUri: magnetUri.substring(0, 100) + '...',
      timeout: this.metadataTimeout
    });

    // Validate magnet URI
    if (!validateMagnetUri(magnetUri)) {
      logger.error('Invalid magnet URI', undefined, { magnetUri: magnetUri.substring(0, 100) });
      throw new TorrentMetadataError(`Invalid magnet URI: ${magnetUri}`);
    }

    const parsed = parseMagnetUri(magnetUri);
    logger.debug('Parsed magnet URI', {
      infohash: parsed.infohash,
      displayName: parsed.displayName,
      trackerCount: parsed.trackers.length
    });

    // Enhance magnet URI with additional trackers for better peer discovery
    const enhancedMagnetUri = this.enhanceMagnetUri(magnetUri);
    logger.debug('Enhanced magnet URI with additional trackers', {
      originalTrackers: parsed.trackers.length,
      addedTrackers: WEBSOCKET_TRACKERS.length + HTTP_TRACKERS.length + UDP_TRACKERS.length,
    });

    // Helper to emit progress events
    const emitProgress = (
      stage: MetadataProgressStage,
      progress: number,
      numPeers: number,
      message: string
    ): void => {
      if (onProgress) {
        const event: MetadataProgressEvent = {
          stage,
          progress,
          numPeers,
          elapsedMs: Date.now() - startTime,
          message,
          infohash: parsed.infohash,
        };
        onProgress(event);
        logger.debug('Progress event emitted', event);
      }
    };

    // Emit initial connecting event
    emitProgress('connecting', 0, 0, 'Connecting to DHT and trackers...');

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let progressIntervalId: ReturnType<typeof setInterval> | null = null;
      let torrent: WebTorrent.Torrent | null = null;
      let metadataReceived = false;

      // Set up timeout
      timeoutId = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        logger.warn('Metadata fetch timeout', {
          infohash: parsed.infohash,
          elapsed: `${elapsed}ms`,
          timeout: `${this.metadataTimeout}ms`,
          metadataReceived,
          torrentAdded: !!torrent,
          numPeers: torrent?.numPeers ?? 0,
          progress: torrent?.progress ?? 0
        });
        
        // Clear progress interval
        if (progressIntervalId) {
          clearInterval(progressIntervalId);
        }
        
        // Emit error progress event
        emitProgress('error', 0, torrent?.numPeers ?? 0, 'Metadata fetch timed out');
        
        if (torrent) {
          logger.debug('Removing torrent after timeout', { infohash: parsed.infohash });
          this.client.remove(torrent);
        }
        reject(new TorrentTimeoutError(`Metadata fetch timed out after ${this.metadataTimeout}ms`));
      }, this.metadataTimeout);

      logger.debug('Adding torrent to client', { infohash: parsed.infohash });

      // Helper function to extract metadata from torrent
      const extractMetadata = (t: WebTorrent.Torrent): void => {
        if (metadataReceived) return; // Prevent double processing
        metadataReceived = true;
        
        const elapsed = Date.now() - startTime;
        logger.info('Metadata received', {
          infohash: t.infoHash,
          name: t.name,
          elapsed: `${elapsed}ms`,
          fileCount: t.files.length,
          totalSize: t.length,
          numPeers: t.numPeers
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (progressIntervalId) {
          clearInterval(progressIntervalId);
        }

        // Emit complete progress event
        emitProgress('complete', 100, t.numPeers, 'Metadata received successfully');

        // Deselect all files to prevent downloading
        t.deselect(0, t.pieces.length - 1, 0);
        logger.debug('Deselected all pieces to prevent download');

        // Calculate file offsets (WebTorrent doesn't expose offset directly)
        let currentOffset = 0;
        const fileOffsets: number[] = [];
        for (const file of t.files) {
          fileOffsets.push(currentOffset);
          currentOffset += file.length;
        }

        // Extract file information
        const files: TorrentFileInfo[] = t.files.map((file, index) => {
          const extension = this.extractExtension(file.name);
          // Pass full filename to getMediaCategory and getMimeType
          const mediaCategory = getMediaCategory(file.name);
          const mimeType = getMimeType(file.name);
          const offset = fileOffsets[index];

          // Calculate piece indices
          const pieceStart = Math.floor(offset / t.pieceLength);
          const pieceEnd = Math.floor((offset + file.length - 1) / t.pieceLength);

          return {
            index,
            name: file.name,
            path: file.path,
            size: file.length,
            offset,
            pieceStart,
            pieceEnd,
            extension,
            mediaCategory,
            mimeType,
          };
        });

        const metadata: TorrentMetadata = {
          infohash: t.infoHash.toLowerCase(),
          name: t.name,
          totalSize: t.length,
          pieceLength: t.pieceLength,
          files,
          magnetUri: parsed.originalUri,
          // Seeders/leechers are populated separately via tracker scraping
          // WebTorrent's numPeers only shows currently connected peers, not total swarm
          seeders: null,
          leechers: null,
        };

        logger.info('Metadata extraction complete', {
          infohash: metadata.infohash,
          name: metadata.name,
          fileCount: files.length,
          totalSize: metadata.totalSize,
          elapsed: `${Date.now() - startTime}ms`
        });

        resolve(metadata);
      };

      // Add torrent and wait for metadata
      try {
        torrent = this.client.add(enhancedMagnetUri);
        
        logger.debug('Torrent object created', {
          infohash: torrent.infoHash,
          ready: torrent.ready,
          numPeers: torrent.numPeers
        });

        // Check if metadata is already available (torrent might already have it)
        // This happens when the torrent was previously added or metadata came very fast
        if (torrent.files && torrent.files.length > 0 && torrent.length > 0) {
          logger.info('Metadata already available on torrent object', {
            infohash: torrent.infoHash,
            fileCount: torrent.files.length,
            totalSize: torrent.length
          });
          extractMetadata(torrent);
          return;
        }

        // Emit searching event
        emitProgress('searching', 10, torrent.numPeers, 'Searching for peers...');

        // Set up progress interval to emit updates every 2 seconds
        const t = torrent;
        progressIntervalId = setInterval(() => {
          if (!metadataReceived && t) {
            const numPeers = t.numPeers;
            // Estimate progress based on peers found (max 50% before metadata)
            const peerProgress = Math.min(numPeers * 10, 40);
            const stage: MetadataProgressStage = numPeers > 0 ? 'downloading' : 'searching';
            const message = numPeers > 0
              ? `Downloading metadata from ${numPeers} peer${numPeers > 1 ? 's' : ''}...`
              : 'Searching for peers...';
            emitProgress(stage, 10 + peerProgress, numPeers, message);
          }
        }, 2000);

        // Listen for various events for debugging
        torrent.on('wire', (wire) => {
          logger.debug('New peer connected', {
            infohash: t.infoHash,
            peerAddress: wire.remoteAddress,
            numPeers: t.numPeers
          });
          // Emit progress when peer connects
          emitProgress(
            'downloading',
            10 + Math.min(t.numPeers * 10, 40),
            t.numPeers,
            `Connected to ${t.numPeers} peer${t.numPeers > 1 ? 's' : ''}, downloading metadata...`
          );
        });

        torrent.on('warning', (warn) => {
          logger.warn('Torrent warning', {
            infohash: t.infoHash,
            warning: String(warn)
          });
        });

        torrent.on('error', (err) => {
          logger.error('Torrent error', err, { infohash: t.infoHash });
        });

        // Listen for metadata event - this fires when metadata is received from peers
        torrent.on('metadata', () => {
          logger.debug('metadata event fired');
          extractMetadata(t);
        });

        // Also listen for 'ready' event as a backup - this fires when torrent is ready to use
        torrent.on('ready', () => {
          logger.debug('ready event fired', {
            infohash: t.infoHash,
            fileCount: t.files?.length ?? 0,
            metadataReceived
          });
          // Only extract if we haven't already
          if (!metadataReceived && t.files && t.files.length > 0) {
            extractMetadata(t);
          }
        });
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (progressIntervalId) {
          clearInterval(progressIntervalId);
        }
        emitProgress('error', 0, 0, `Failed to add torrent: ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.error('Failed to add torrent', error, { magnetUri: magnetUri.substring(0, 100) });
        reject(new TorrentMetadataError(`Failed to add torrent: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Remove a torrent from the client
   * 
   * @param infohash - The infohash of the torrent to remove
   */
  async removeTorrent(infohash: string): Promise<void> {
    logger.debug('Removing torrent', { infohash });
    this.client.remove(infohash);
  }

  /**
   * Destroy the WebTorrent client and clean up resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying TorrentService');
    return new Promise((resolve) => {
      this.client.destroy(() => {
        logger.debug('WebTorrent client destroyed');
        resolve();
      });
    });
  }

  /**
   * Extract file extension from filename
   */
  private extractExtension(filename: string): string | null {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return null;
    }
    return filename.slice(lastDot + 1).toLowerCase();
  }

  /**
   * Enhance a magnet URI with additional trackers for better peer discovery
   *
   * Tracker priority order (fastest first):
   * 1. UDP trackers (fastest, work with DHT, but blocked on some cloud platforms)
   * 2. WebSocket trackers (fast, work in browsers and cloud)
   * 3. HTTP/HTTPS trackers (slowest, but work everywhere)
   *
   * DHT is the primary peer discovery method and is always enabled.
   * Trackers are used as a supplement to DHT.
   */
  private enhanceMagnetUri(magnetUri: string): string {
    // Prioritize UDP trackers first (fastest), then WSS, then HTTP (slowest)
    const allTrackers = [...UDP_TRACKERS, ...WEBSOCKET_TRACKERS, ...HTTP_TRACKERS];
    
    // Add trackers that aren't already in the magnet URI
    let enhanced = magnetUri;
    let addedCount = 0;
    for (const tracker of allTrackers) {
      const encodedTracker = encodeURIComponent(tracker);
      if (!magnetUri.includes(encodedTracker) && !magnetUri.includes(tracker)) {
        enhanced += `&tr=${encodedTracker}`;
        addedCount++;
      }
    }
    
    logger.debug('Enhanced magnet URI with trackers', {
      addedTrackers: addedCount,
      udpTrackers: UDP_TRACKERS.length,
      wssTrackers: WEBSOCKET_TRACKERS.length,
      httpTrackers: HTTP_TRACKERS.length,
    });
    
    return enhanced;
  }
}
