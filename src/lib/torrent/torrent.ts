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
}

/**
 * Options for TorrentService
 */
export interface TorrentServiceOptions {
  /** Timeout for metadata fetch in milliseconds (default: 30000) */
  metadataTimeout?: number;
}

/**
 * Service for fetching torrent metadata without downloading content
 */
export class TorrentService {
  private client: WebTorrent.Instance;
  private metadataTimeout: number;

  constructor(options: TorrentServiceOptions = {}) {
    logger.info('Initializing TorrentService', { timeout: options.metadataTimeout ?? 30000 });
    this.client = new WebTorrent();
    this.metadataTimeout = options.metadataTimeout ?? 30000;
    
    // Log client events
    this.client.on('error', (err) => {
      logger.error('WebTorrent client error', err);
    });
    
    logger.debug('WebTorrent client created');
  }

  /**
   * Fetch metadata for a torrent from a magnet URI
   * 
   * This fetches ONLY the metadata (file list, sizes, etc.) without downloading
   * any actual file content.
   * 
   * @param magnetUri - The magnet URI to fetch metadata for
   * @returns Promise resolving to torrent metadata
   * @throws TorrentMetadataError if the magnet URI is invalid
   * @throws TorrentTimeoutError if metadata fetch times out
   */
  async fetchMetadata(magnetUri: string): Promise<TorrentMetadata> {
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

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
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
        
        if (torrent) {
          logger.debug('Removing torrent after timeout', { infohash: parsed.infohash });
          this.client.remove(torrent);
        }
        reject(new TorrentTimeoutError(`Metadata fetch timed out after ${this.metadataTimeout}ms`));
      }, this.metadataTimeout);

      logger.debug('Adding torrent to client', { infohash: parsed.infohash });

      // Add torrent and wait for metadata
      try {
        torrent = this.client.add(magnetUri, (t) => {
          logger.debug('Torrent added callback fired', { 
            infohash: t.infoHash,
            name: t.name,
            numPeers: t.numPeers
          });

          // Listen for various events for debugging
          t.on('wire', (wire) => {
            logger.debug('New peer connected', { 
              infohash: t.infoHash,
              peerAddress: wire.remoteAddress,
              numPeers: t.numPeers
            });
          });

          t.on('warning', (warn) => {
            logger.warn('Torrent warning', { 
              infohash: t.infoHash,
              warning: String(warn)
            });
          });

          t.on('error', (err) => {
            logger.error('Torrent error', err, { infohash: t.infoHash });
          });

          // Listen for metadata event
          t.on('metadata', () => {
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
            };

            logger.info('Metadata extraction complete', {
              infohash: metadata.infohash,
              name: metadata.name,
              fileCount: files.length,
              totalSize: metadata.totalSize,
              elapsed: `${Date.now() - startTime}ms`
            });

            resolve(metadata);
          });
        });

        // Log torrent state after adding
        if (torrent) {
          logger.debug('Torrent object created', {
            infohash: torrent.infoHash,
            ready: torrent.ready,
            numPeers: torrent.numPeers
          });
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
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
}
