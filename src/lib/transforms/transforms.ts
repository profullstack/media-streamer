/**
 * Data transformation utilities
 * 
 * Converts between Supabase snake_case database format and frontend camelCase format.
 */

import type { Torrent as DbTorrent, TorrentFile as DbTorrentFile } from '@/lib/supabase/types';
import type { Torrent, TorrentFile, MediaCategory } from '@/types';

/**
 * Transform a database torrent record to frontend format
 * @param dbTorrent - The database torrent record with snake_case fields
 * @returns The transformed torrent with camelCase fields
 */
export function transformTorrent(dbTorrent: DbTorrent): Torrent {
  return {
    id: dbTorrent.id,
    infohash: dbTorrent.infohash,
    magnetUri: dbTorrent.magnet_uri,
    name: dbTorrent.name,
    totalSize: dbTorrent.total_size,
    fileCount: dbTorrent.file_count,
    pieceLength: dbTorrent.piece_length ?? 0,
    createdAt: dbTorrent.created_at,
    updatedAt: dbTorrent.updated_at,
  };
}

/**
 * Transform a database torrent file record to frontend format
 * @param dbFile - The database file record with snake_case fields
 * @returns The transformed file with camelCase fields
 */
export function transformTorrentFile(dbFile: DbTorrentFile): TorrentFile {
  return {
    id: dbFile.id,
    torrentId: dbFile.torrent_id,
    fileIndex: dbFile.file_index,
    path: dbFile.path,
    name: dbFile.name,
    extension: dbFile.extension ?? '',
    size: dbFile.size,
    pieceStart: dbFile.piece_start,
    pieceEnd: dbFile.piece_end,
    mediaCategory: (dbFile.media_category ?? 'other') as MediaCategory,
    mimeType: dbFile.mime_type ?? 'application/octet-stream',
    createdAt: dbFile.created_at,
  };
}

/**
 * Transform an array of database torrent file records to frontend format
 * @param dbFiles - Array of database file records
 * @returns Array of transformed files
 */
export function transformTorrentFiles(dbFiles: DbTorrentFile[]): TorrentFile[] {
  return dbFiles.map(transformTorrentFile);
}

/**
 * Transform an array of database torrent records to frontend format
 * @param dbTorrents - Array of database torrent records
 * @returns Array of transformed torrents
 */
export function transformTorrents(dbTorrents: DbTorrent[]): Torrent[] {
  return dbTorrents.map(transformTorrent);
}
