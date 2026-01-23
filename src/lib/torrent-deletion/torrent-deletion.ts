/**
 * Torrent Deletion Module
 * 
 * Provides functionality to delete torrents and all related data from the database.
 * Uses CASCADE constraints to automatically clean up related records.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface TorrentRecord {
  id: string;
  infohash: string;
  name: string;
  file_count: number;
  total_size: number;
}

export interface RelatedRecordCounts {
  audioMetadata: number;
  videoMetadata: number;
  ebookMetadata: number;
  favorites: number;
  collectionItems: number;
  readingProgress: number;
  watchProgress: number;
}

export interface DeletionResult {
  torrent: TorrentRecord;
  fileCount: number;
  relatedCounts: RelatedRecordCounts;
  totalDeleted: number;
}

/**
 * Validates that a string is a valid infohash (40-character hex string)
 */
export function validateInfohash(infohash: string): boolean {
  const infohashRegex = /^[0-9a-f]{40}$/i;
  return infohashRegex.test(infohash);
}

/**
 * Formats bytes into human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Fetches a torrent by its infohash
 */
export async function getTorrentByInfohash(
  supabase: SupabaseClient,
  infohash: string
): Promise<TorrentRecord | null> {
  const { data, error } = await supabase
    .from('bt_torrents')
    .select('id, infohash, name, file_count, total_size')
    .eq('infohash', infohash.toLowerCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to fetch torrent: ${error.message}`);
  }

  return data as TorrentRecord;
}

/**
 * Gets all file IDs for a torrent
 */
export async function getFileIds(
  supabase: SupabaseClient,
  torrentId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('bt_torrent_files')
    .select('id')
    .eq('torrent_id', torrentId);

  if (error) {
    throw new Error(`Failed to fetch file IDs: ${error.message}`);
  }

  return (data as Array<{ id: string }>).map(f => f.id);
}

/**
 * Counts all related records that will be deleted
 */
export async function countRelatedRecords(
  supabase: SupabaseClient,
  fileIds: string[]
): Promise<RelatedRecordCounts> {
  if (fileIds.length === 0) {
    return {
      audioMetadata: 0,
      videoMetadata: 0,
      ebookMetadata: 0,
      favorites: 0,
      collectionItems: 0,
      readingProgress: 0,
      watchProgress: 0,
    };
  }

  const [
    audioResult,
    videoResult,
    ebookResult,
    favoritesResult,
    collectionItemsResult,
    readingProgressResult,
    watchProgressResult,
  ] = await Promise.all([
    supabase.from('bt_audio_metadata').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('bt_video_metadata').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('bt_ebook_metadata').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('user_favorites').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('collection_items').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('reading_progress').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
    supabase.from('watch_progress').select('id', { count: 'exact', head: true }).in('file_id', fileIds),
  ]);

  return {
    audioMetadata: audioResult.count ?? 0,
    videoMetadata: videoResult.count ?? 0,
    ebookMetadata: ebookResult.count ?? 0,
    favorites: favoritesResult.count ?? 0,
    collectionItems: collectionItemsResult.count ?? 0,
    readingProgress: readingProgressResult.count ?? 0,
    watchProgress: watchProgressResult.count ?? 0,
  };
}

/**
 * Deletes a torrent by its ID
 * Due to CASCADE constraints, this will automatically delete all related records
 */
export async function deleteTorrentById(
  supabase: SupabaseClient,
  torrentId: string
): Promise<void> {
  const { error } = await supabase
    .from('bt_torrents')
    .delete()
    .eq('id', torrentId);

  if (error) {
    throw new Error(`Failed to delete torrent: ${error.message}`);
  }
}

/**
 * Deletes a torrent and all related data by infohash
 * Returns detailed information about what was deleted
 */
export async function deleteTorrentByInfohash(
  supabase: SupabaseClient,
  infohash: string
): Promise<DeletionResult> {
  // Validate infohash
  if (!validateInfohash(infohash)) {
    throw new Error('Invalid infohash format. Must be a 40-character hexadecimal string.');
  }

  // Find the torrent
  const torrent = await getTorrentByInfohash(supabase, infohash);
  if (!torrent) {
    throw new Error(`Torrent not found with infohash: ${infohash}`);
  }

  // Get file IDs for counting
  const fileIds = await getFileIds(supabase, torrent.id);

  // Count related records
  const relatedCounts = await countRelatedRecords(supabase, fileIds);

  // Calculate total
  const totalDeleted = 1 + fileIds.length + 
    relatedCounts.audioMetadata + 
    relatedCounts.videoMetadata + 
    relatedCounts.ebookMetadata + 
    relatedCounts.favorites + 
    relatedCounts.collectionItems + 
    relatedCounts.readingProgress + 
    relatedCounts.watchProgress;

  // Delete the torrent (cascades to all related records)
  await deleteTorrentById(supabase, torrent.id);

  return {
    torrent,
    fileCount: fileIds.length,
    relatedCounts,
    totalDeleted,
  };
}
