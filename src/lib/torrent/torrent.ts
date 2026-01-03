/**
 * WebTorrent Metadata Service
 *
 * Fetches torrent metadata (file list, sizes, piece info) without downloading content.
 * This is a SERVER-SIDE ONLY service.
 *
 * WebRTC Support:
 * This service uses node-datachannel to enable WebRTC peer connections.
 * This allows the server to connect to browser WebTorrent clients via WebRTC.
 */

import WebTorrent from 'webtorrent';
// Import node-datachannel polyfill to enable WebRTC in Node.js
// This allows the server to connect to browser WebTorrent clients via WebRTC
import nodeDataChannel from 'node-datachannel/polyfill';
import { validateMagnetUri, parseMagnetUri } from '../magnet';
import { getMediaCategory, getMimeType } from '../utils';
import { createLogger } from '../logger';
import { getWebTorrentDir, ensureDir } from '../config';

const logger = createLogger('TorrentService');

// Set up WebRTC polyfill for Node.js
// This enables the server to act as a WebRTC peer that browsers can connect to
if (typeof globalThis.RTCPeerConnection === 'undefined') {
  logger.info('Setting up node-datachannel WebRTC polyfill for TorrentService');
  // node-datachannel/polyfill automatically sets up the global WebRTC APIs
  if (nodeDataChannel.RTCPeerConnection) {
    logger.info('WebRTC polyfill loaded successfully for TorrentService');
  }
}

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

// Default timeout for metadata fetch (90 seconds)
// Can be overridden via TORRENT_METADATA_TIMEOUT_MS environment variable
const DEFAULT_METADATA_TIMEOUT = parseInt(
  process.env.TORRENT_METADATA_TIMEOUT_MS ?? '90000',
  10
);

// Well-known DHT bootstrap nodes for reliable peer discovery
// DHT is the PRIMARY peer discovery method - it's decentralized and fast
// Note: DHT requires UDP which may be blocked on some cloud platforms
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
const HTTP_TRACKERS = [
  // Port 80 (HTTP) - most likely to work through firewalls
  'http://tracker.openbittorrent.com:80/announce',
  'http://tracker.gbitt.info:80/announce',
  'http://open.acgnxtracker.com:80/announce',
  'http://tracker1.bt.moack.co.kr:80/announce',
  // Port 443 (HTTPS) - also very likely to work
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.loligirl.cn:443/announce',
  'https://tracker.lilithraws.org:443/announce',
  // Non-standard ports (may be blocked on some platforms)
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.bt4g.com:2095/announce',
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
  'udp://retracker01-msk-virt.corbina.net:80/announce',
];

/**
 * Service for fetching torrent metadata without downloading content
 */
export class TorrentService {
  private client: WebTorrent.Instance;
  private metadataTimeout: number;
  private downloadPath: string;

  constructor(options: TorrentServiceOptions = {}) {
    const timeout = options.metadataTimeout ?? DEFAULT_METADATA_TIMEOUT;
    
    // Get and ensure WebTorrent download directory exists
    this.downloadPath = getWebTorrentDir();
    ensureDir(this.downloadPath);
    
    logger.info('Initializing TorrentService', {
      timeout,
      defaultTimeout: DEFAULT_METADATA_TIMEOUT,
      dhtBootstrapNodes: DHT_BOOTSTRAP_NODES,
      downloadPath: this.downloadPath,
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
      // Use configured download path instead of /tmp/webtorrent
      path: this.downloadPath,
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
          logger.debug('Destroying torrent and deleting files after timeout', { infohash: parsed.infohash });
          // Use destroy() with destroyStore to delete downloaded files
          (torrent.destroy as (opts: { destroyStore: boolean }, callback?: (err: Error | null) => void) => void)(
            { destroyStore: true },
            (err: Error | null) => {
              if (err) {
                logger.warn('Error destroying torrent after timeout', { infohash: parsed.infohash, error: String(err) });
              } else {
                logger.debug('Torrent destroyed and files deleted after timeout', { infohash: parsed.infohash });
              }
            }
          );
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
        // Pass path option to ensure downloads go to configured directory
        // Type assertion needed because WebTorrent types are incomplete
        torrent = this.client.add(enhancedMagnetUri, { path: this.downloadPath } as WebTorrent.TorrentOptions);
        
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
          // Only emit progress if metadata hasn't been received yet
          if (!metadataReceived) {
            emitProgress(
              'downloading',
              10 + Math.min(t.numPeers * 10, 40),
              t.numPeers,
              `Connected to ${t.numPeers} peer${t.numPeers > 1 ? 's' : ''}, downloading metadata...`
            );
          }
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
   * Remove a torrent from the client and delete downloaded files
   *
   * @param infohash - The infohash of the torrent to remove
   */
  async removeTorrent(infohash: string): Promise<void> {
    logger.debug('Removing torrent and deleting files', { infohash });
    const torrent = this.client.torrents.find(t => t.infoHash === infohash);
    if (torrent) {
      // Use destroy() with destroyStore to delete downloaded files
      return new Promise((resolve) => {
        (torrent.destroy as (opts: { destroyStore: boolean }, callback?: (err: Error | null) => void) => void)(
          { destroyStore: true },
          (err: Error | null) => {
            if (err) {
              logger.warn('Error destroying torrent', { infohash, error: String(err) });
            } else {
              logger.debug('Torrent destroyed and files deleted', { infohash });
            }
            resolve();
          }
        );
      });
    }
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
    // Parse the magnet URI to extract components
    const parsed = parseMagnetUri(magnetUri);
    
    // Our open source trackers in priority order (HTTP first for cloud, then WSS, then UDP)
    const ourTrackers = [...HTTP_TRACKERS, ...WEBSOCKET_TRACKERS, ...UDP_TRACKERS];
    
    // Build a new magnet URI with our trackers FIRST, then original trackers
    // Start with the base magnet (xt=urn:btih:infohash)
    let enhanced = `magnet:?xt=urn:btih:${parsed.infohash}`;
    
    // Add display name if present
    if (parsed.displayName) {
      enhanced += `&dn=${encodeURIComponent(parsed.displayName)}`;
    }
    
    // Add OUR trackers FIRST (highest priority after DHT)
    let addedCount = 0;
    const addedTrackers = new Set<string>();
    
    for (const tracker of ourTrackers) {
      const normalizedTracker = tracker.toLowerCase();
      if (!addedTrackers.has(normalizedTracker)) {
        enhanced += `&tr=${encodeURIComponent(tracker)}`;
        addedTrackers.add(normalizedTracker);
        addedCount++;
      }
    }
    
    // Add original magnet trackers LAST (lowest priority)
    let originalCount = 0;
    for (const tracker of parsed.trackers) {
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
}
