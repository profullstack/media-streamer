/**
 * Indexer Module
 * 
 * Provides torrent indexing functionality that combines metadata fetching
 * with Supabase storage.
 * This is a SERVER-SIDE ONLY module.
 */

export {
  IndexerService,
  IndexerError,
  DuplicateTorrentError,
} from './indexer';

export type {
  IndexResult,
  IndexOptions,
} from './indexer';
