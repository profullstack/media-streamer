/**
 * Torrent Indexer Service
 * 
 * Combines torrent metadata fetching with Supabase storage.
 * This is a SERVER-SIDE ONLY service.
 */

import { TorrentService, type TorrentMetadata, type TorrentFileInfo } from '../torrent';
import {
  getTorrentByInfohash,
  createTorrent,
  createTorrentFiles,
  type TorrentFileInsert,
} from '../supabase';

/**
 * Custom error for indexer failures
 */
export class IndexerError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'IndexerError';
  }
}

/**
 * Error thrown when attempting to index a duplicate torrent
 */
export class DuplicateTorrentError extends Error {
  constructor(public readonly infohash: string) {
    super(`Torrent with infohash ${infohash} already exists`);
    this.name = 'DuplicateTorrentError';
  }
}

/**
 * Result of indexing a magnet URI
 */
export interface IndexResult {
  /** UUID of the torrent in the database */
  torrentId: string;
  /** Torrent infohash */
  infohash: string;
  /** Torrent name */
  name: string;
  /** Number of files in the torrent */
  fileCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Whether this is a newly indexed torrent */
  isNew: boolean;
}

/**
 * Options for indexing a magnet URI
 */
export interface IndexOptions {
  /** If true, return existing torrent instead of throwing error (default: true) */
  skipDuplicates?: boolean;
}

/**
 * Service for indexing torrents into the database
 */
export class IndexerService {
  private torrentService: TorrentService;

  constructor() {
    this.torrentService = new TorrentService();
  }

  /**
   * Index a magnet URI
   * 
   * Fetches metadata from the torrent network and stores it in Supabase.
   * 
   * @param magnetUri - The magnet URI to index
   * @param options - Indexing options
   * @returns Index result with torrent details
   * @throws IndexerError if indexing fails
   * @throws DuplicateTorrentError if torrent exists and skipDuplicates is false
   */
  async indexMagnet(magnetUri: string, options: IndexOptions = {}): Promise<IndexResult> {
    const { skipDuplicates = true } = options;

    let metadata: TorrentMetadata;

    // Fetch metadata from torrent network
    try {
      metadata = await this.torrentService.fetchMetadata(magnetUri);
    } catch (error) {
      throw new IndexerError(
        `Failed to fetch torrent metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }

    // Check if torrent already exists
    try {
      const existingTorrent = await getTorrentByInfohash(metadata.infohash);

      if (existingTorrent) {
        if (!skipDuplicates) {
          throw new DuplicateTorrentError(metadata.infohash);
        }

        // Return existing torrent info
        return {
          torrentId: existingTorrent.id,
          infohash: existingTorrent.infohash,
          name: existingTorrent.name,
          fileCount: existingTorrent.file_count,
          totalSize: existingTorrent.total_size,
          isNew: false,
        };
      }
    } catch (error) {
      if (error instanceof DuplicateTorrentError) {
        throw error;
      }
      throw new IndexerError(
        `Failed to check for existing torrent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }

    // Create new torrent record
    let torrentId: string;
    try {
      const torrent = await createTorrent({
        infohash: metadata.infohash,
        magnet_uri: metadata.magnetUri,
        name: metadata.name,
        total_size: metadata.totalSize,
        file_count: metadata.files.length,
        piece_length: metadata.pieceLength,
      });
      torrentId = torrent.id;
    } catch (error) {
      throw new IndexerError(
        `Failed to create torrent record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }

    // Create file records
    if (metadata.files.length > 0) {
      try {
        const fileInserts: TorrentFileInsert[] = metadata.files.map((file) => 
          this.mapFileToInsert(torrentId, file)
        );
        await createTorrentFiles(fileInserts);
      } catch (error) {
        throw new IndexerError(
          `Failed to create file records: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    return {
      torrentId,
      infohash: metadata.infohash,
      name: metadata.name,
      fileCount: metadata.files.length,
      totalSize: metadata.totalSize,
      isNew: true,
    };
  }

  /**
   * Map a TorrentFileInfo to a database insert object
   */
  private mapFileToInsert(torrentId: string, file: TorrentFileInfo): TorrentFileInsert {
    return {
      torrent_id: torrentId,
      file_index: file.index,
      path: file.path,
      name: file.name,
      extension: file.extension,
      size: file.size,
      piece_start: file.pieceStart,
      piece_end: file.pieceEnd,
      media_category: file.mediaCategory,
      mime_type: file.mimeType,
    };
  }

  /**
   * Destroy the underlying torrent service
   */
  async destroy(): Promise<void> {
    await this.torrentService.destroy();
  }
}
