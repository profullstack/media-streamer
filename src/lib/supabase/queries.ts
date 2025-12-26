import { getServerClient } from './client';
import type {
  Torrent,
  TorrentInsert,
  TorrentFile,
  TorrentFileInsert,
  AudioMetadata,
  AudioMetadataInsert,
  VideoMetadata,
  VideoMetadataInsert,
  EbookMetadata,
  EbookMetadataInsert,
  MediaCategory,
} from './types';

/**
 * Search result type from the search_files RPC function
 */
export interface SearchResult {
  file_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_media_category: string;
  file_index: number;
  torrent_id: string;
  torrent_name: string;
  torrent_infohash: string;
  rank: number;
}

/**
 * Search options for file search
 */
export interface SearchOptions {
  query: string;
  mediaType?: MediaCategory | null;
  torrentId?: string | null;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Torrent Operations
// ============================================================================

/**
 * Get a torrent by its infohash
 * @param infohash - The torrent's infohash
 * @returns The torrent or null if not found
 */
export async function getTorrentByInfohash(infohash: string): Promise<Torrent | null> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrents')
    .select('*')
    .eq('infohash', infohash)
    .single();

  if (error) {
    // PGRST116 = no rows returned
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Create a new torrent
 * @param torrent - The torrent data to insert
 * @returns The created torrent
 */
export async function createTorrent(torrent: TorrentInsert): Promise<Torrent> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrents')
    .insert(torrent)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Get a torrent by its ID
 * @param id - The torrent's UUID
 * @returns The torrent or null if not found
 */
export async function getTorrentById(id: string): Promise<Torrent | null> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    // PGRST116 = no rows returned
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Get all torrents with optional pagination
 * @param limit - Maximum number of torrents to return
 * @param offset - Number of torrents to skip
 * @returns Array of torrents
 */
export async function getTorrents(limit = 50, offset = 0): Promise<Torrent[]> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrents')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Delete a torrent by ID (cascades to files and metadata)
 * @param id - The torrent ID
 */
export async function deleteTorrent(id: string): Promise<void> {
  const client = getServerClient();
  
  const { error } = await client
    .from('torrents')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

// ============================================================================
// Torrent File Operations
// ============================================================================

/**
 * Get all files for a torrent
 * @param torrentId - The torrent ID
 * @returns Array of torrent files
 */
export async function getTorrentFiles(torrentId: string): Promise<TorrentFile[]> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrent_files')
    .select('*')
    .eq('torrent_id', torrentId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Create multiple torrent files
 * @param files - Array of file data to insert
 * @returns Array of created files
 */
export async function createTorrentFiles(files: TorrentFileInsert[]): Promise<TorrentFile[]> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('torrent_files')
    .insert(files)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

// ============================================================================
// Audio Metadata Operations
// ============================================================================

/**
 * Get audio metadata for a file
 * @param fileId - The file ID
 * @returns Audio metadata or null if not found
 */
export async function getAudioMetadata(fileId: string): Promise<AudioMetadata | null> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('audio_metadata')
    .select('*')
    .eq('file_id', fileId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Create audio metadata for a file
 * @param metadata - The audio metadata to insert
 * @returns The created metadata
 */
export async function createAudioMetadata(metadata: AudioMetadataInsert): Promise<AudioMetadata> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('audio_metadata')
    .insert(metadata)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// ============================================================================
// Video Metadata Operations
// ============================================================================

/**
 * Get video metadata for a file
 * @param fileId - The file ID
 * @returns Video metadata or null if not found
 */
export async function getVideoMetadata(fileId: string): Promise<VideoMetadata | null> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('video_metadata')
    .select('*')
    .eq('file_id', fileId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Create video metadata for a file
 * @param metadata - The video metadata to insert
 * @returns The created metadata
 */
export async function createVideoMetadata(metadata: VideoMetadataInsert): Promise<VideoMetadata> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('video_metadata')
    .insert(metadata)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// ============================================================================
// Ebook Metadata Operations
// ============================================================================

/**
 * Get ebook metadata for a file
 * @param fileId - The file ID
 * @returns Ebook metadata or null if not found
 */
export async function getEbookMetadata(fileId: string): Promise<EbookMetadata | null> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('ebook_metadata')
    .select('*')
    .eq('file_id', fileId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Create ebook metadata for a file
 * @param metadata - The ebook metadata to insert
 * @returns The created metadata
 */
export async function createEbookMetadata(metadata: EbookMetadataInsert): Promise<EbookMetadata> {
  const client = getServerClient();
  
  const { data, error } = await client
    .from('ebook_metadata')
    .insert(metadata)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Search files across all torrents using full-text search
 * @param options - Search options
 * @returns Array of search results
 */
export async function searchFiles(options: SearchOptions): Promise<SearchResult[]> {
  const client = getServerClient();
  
  const { query, mediaType = null, torrentId = null, limit = 50, offset = 0 } = options;

  const { data, error } = await client.rpc('search_files', {
    search_query: query,
    media_type: mediaType,
    torrent_uuid: torrentId,
    result_limit: limit,
    result_offset: offset,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
