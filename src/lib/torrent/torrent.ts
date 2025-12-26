/**
 * WebTorrent Metadata Service
 * 
 * Fetches torrent metadata (file list, sizes, piece info) without downloading content.
 * This is a SERVER-SIDE ONLY service.
 */

import WebTorrent from 'webtorrent';
import { validateMagnetUri, parseMagnetUri } from '../magnet';
import { getMediaCategory, getMimeType } from '../utils';

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
    this.client = new WebTorrent();
    this.metadataTimeout = options.metadataTimeout ?? 30000;
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
    // Validate magnet URI
    if (!validateMagnetUri(magnetUri)) {
      throw new TorrentMetadataError(`Invalid magnet URI: ${magnetUri}`);
    }

    const parsed = parseMagnetUri(magnetUri);

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let torrent: WebTorrent.Torrent | null = null;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (torrent) {
          this.client.remove(torrent);
        }
        reject(new TorrentTimeoutError(`Metadata fetch timed out after ${this.metadataTimeout}ms`));
      }, this.metadataTimeout);

      // Add torrent and wait for metadata
      torrent = this.client.add(magnetUri, (t) => {
        // Listen for metadata event
        t.on('metadata', () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // Deselect all files to prevent downloading
          t.deselect(0, t.pieces.length - 1, 0);

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

          resolve(metadata);
        });
      });
    });
  }

  /**
   * Remove a torrent from the client
   * 
   * @param infohash - The infohash of the torrent to remove
   */
  async removeTorrent(infohash: string): Promise<void> {
    this.client.remove(infohash);
  }

  /**
   * Destroy the WebTorrent client and clean up resources
   */
  async destroy(): Promise<void> {
    return new Promise((resolve) => {
      this.client.destroy(() => {
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
