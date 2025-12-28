/**
 * Supabase Module
 * 
 * CRITICAL: All exports from this module are SERVER-SIDE ONLY
 * NEVER import this module in client components
 */

// Client
export { createServerClient, getServerClient, resetServerClient } from './client';
export type { ServerClient } from './client';

// Types
export type {
  Database,
  Json,
  Tables,
  InsertTables,
  UpdateTables,
  Torrent,
  TorrentInsert,
  TorrentUpdate,
  TorrentFile,
  TorrentFileInsert,
  TorrentFileUpdate,
  AudioMetadata,
  AudioMetadataInsert,
  AudioMetadataUpdate,
  VideoMetadata,
  VideoMetadataInsert,
  VideoMetadataUpdate,
  EbookMetadata,
  EbookMetadataInsert,
  EbookMetadataUpdate,
  UserFavorite,
  Collection,
  CollectionItem,
  ReadingProgress,
  WatchProgress,
  RateLimit,
  MediaCategory,
  CollectionType,
} from './types';

// Queries
export {
  getTorrentById,
  getTorrentByInfohash,
  createTorrent,
  deleteTorrent,
  getTorrentFiles,
  createTorrentFiles,
  getAudioMetadata,
  createAudioMetadata,
  getVideoMetadata,
  createVideoMetadata,
  getEbookMetadata,
  createEbookMetadata,
  searchFiles,
} from './queries';

export type { SearchResult, SearchOptions } from './queries';
