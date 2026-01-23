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
  torrent_poster_url: string | null;
  torrent_cover_url: string | null;
  torrent_clean_title: string | null;
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
    .from('bt_torrents')
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
 * DHT Torrent type - a torrent from Bitmagnet's DHT crawl
 * This is a lightweight representation since DHT torrents don't have all the metadata
 */
export interface DhtTorrent {
  infohash: string;
  name: string;
  size: number;
  files_count: number | null;
  created_at: string;
  seeders: number;
  leechers: number;
  source: 'dht';
}

/**
 * DHT Torrent File type - a file from Bitmagnet's DHT crawl
 */
export interface DhtTorrentFile {
  index: number;
  path: string;
  extension: string | null;
  size: number;
}

/**
 * Get a DHT torrent by its infohash from Bitmagnet's torrents table
 * Uses the search_all_torrents RPC to find DHT torrents
 * @param infohash - The torrent's infohash (40 hex chars)
 * @returns The DHT torrent or null if not found
 */
export async function getDhtTorrentByInfohash(infohash: string): Promise<DhtTorrent | null> {
  const client = getServerClient();

  // Use the search_all_torrents RPC with the infohash as search query
  // This will find exact matches in DHT torrents
  const { data, error } = await client.rpc('search_all_torrents', {
    search_query: infohash,
    result_limit: 10,
    result_offset: 0,
  });

  if (error) {
    console.error('DHT torrent lookup error:', error);
    throw new Error(error.message);
  }

  // Find the DHT torrent with matching infohash
  const dhtResult = (data ?? []).find(
    (row: Record<string, unknown>) =>
      row.source === 'dht' && (row.infohash as string).toLowerCase() === infohash.toLowerCase()
  );

  if (!dhtResult) {
    return null;
  }

  return {
    infohash: dhtResult.infohash as string,
    name: dhtResult.name as string,
    size: Number(dhtResult.size),
    files_count: Number(dhtResult.files_count ?? 0),
    created_at: dhtResult.created_at as string,
    seeders: Number(dhtResult.seeders ?? 0),
    leechers: Number(dhtResult.leechers ?? 0),
    source: 'dht',
  };
}

/**
 * Get files for a DHT torrent from Bitmagnet's torrent_files table
 * Uses direct SQL query via RPC since Supabase doesn't support bytea filtering well
 * @param infohash - The torrent's infohash (40 hex chars)
 * @returns Array of DHT torrent files (empty if not found or table doesn't exist)
 */
export async function getDhtTorrentFiles(infohash: string): Promise<DhtTorrentFile[]> {
  // DHT torrents may not have file info indexed
  // Return empty array - the torrent detail page will show the torrent without file browser
  // In the future, we could add an RPC function to query torrent_files by bytea info_hash
  console.log(`getDhtTorrentFiles called for ${infohash} - DHT file listing not implemented`);
  return [];
}

/**
 * Create a new torrent
 * @param torrent - The torrent data to insert
 * @returns The created torrent
 */
export async function createTorrent(torrent: TorrentInsert): Promise<Torrent> {
  const client = getServerClient();

  const { data, error } = await client
    .from('bt_torrents')
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
    .from('bt_torrents')
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
    .from('bt_torrents')
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
    .from('bt_torrents')
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
    .from('bt_torrent_files')
    .select('*')
    .eq('torrent_id', torrentId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * File with codec metadata from joined tables
 */
export interface TorrentFileWithCodec extends TorrentFile {
  video_codec?: string | null;
  audio_codec?: string | null;
  container?: string | null;
  needs_transcoding?: boolean;
}

/**
 * Get all files for a torrent with codec metadata
 * Joins with video_metadata and audio_metadata tables to get codec info
 * @param torrentId - The torrent ID
 * @returns Array of torrent files with codec info
 */
export async function getTorrentFilesWithCodec(torrentId: string): Promise<TorrentFileWithCodec[]> {
  const client = getServerClient();
  
  // First get all files
  const { data: files, error: filesError } = await client
    .from('bt_torrent_files')
    .select('*')
    .eq('torrent_id', torrentId);

  if (filesError) {
    throw new Error(filesError.message);
  }

  if (!files || files.length === 0) {
    return [];
  }

  // Get file IDs for video and audio files
  const videoFileIds = files
    .filter(f => f.media_category === 'video')
    .map(f => f.id);
  const audioFileIds = files
    .filter(f => f.media_category === 'audio')
    .map(f => f.id);

  // Fetch video metadata
  const videoMetadataMap = new Map<string, { codec: string | null; audio_codec: string | null; container: string | null; needs_transcoding: boolean }>();
  if (videoFileIds.length > 0) {
    const { data: videoMeta } = await client
      .from('bt_video_metadata')
      .select('file_id, codec, audio_codec, container, needs_transcoding')
      .in('file_id', videoFileIds);
    
    if (videoMeta) {
      for (const vm of videoMeta) {
        videoMetadataMap.set(vm.file_id, {
          codec: vm.codec,
          audio_codec: vm.audio_codec,
          container: vm.container,
          needs_transcoding: vm.needs_transcoding ?? false,
        });
      }
    }
  }

  // Fetch audio metadata (audio files don't need transcoding check - browsers support most audio codecs)
  const audioMetadataMap = new Map<string, { codec: string | null; container: string | null }>();
  if (audioFileIds.length > 0) {
    const { data: audioMeta } = await client
      .from('bt_audio_metadata')
      .select('file_id, codec, container')
      .in('file_id', audioFileIds);
    
    if (audioMeta) {
      for (const am of audioMeta) {
        audioMetadataMap.set(am.file_id, {
          codec: am.codec,
          container: am.container,
        });
      }
    }
  }

  // Merge codec info into files
  return files.map(file => {
    const result: TorrentFileWithCodec = { ...file };
    
    if (file.media_category === 'video') {
      const videoMeta = videoMetadataMap.get(file.id);
      if (videoMeta) {
        result.video_codec = videoMeta.codec;
        result.audio_codec = videoMeta.audio_codec;
        result.container = videoMeta.container;
        result.needs_transcoding = videoMeta.needs_transcoding;
      }
    } else if (file.media_category === 'audio') {
      const audioMeta = audioMetadataMap.get(file.id);
      if (audioMeta) {
        result.audio_codec = audioMeta.codec;
        result.container = audioMeta.container;
        // Audio files don't need transcoding - browsers support most audio codecs
        result.needs_transcoding = false;
      }
    }
    
    return result;
  });
}

/**
 * Create multiple torrent files
 * @param files - Array of file data to insert
 * @returns Array of created files
 */
export async function createTorrentFiles(files: TorrentFileInsert[]): Promise<TorrentFile[]> {
  const client = getServerClient();

  const { data, error } = await client
    .from('bt_torrent_files')
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
    .from('bt_audio_metadata')
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
    .from('bt_audio_metadata')
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
    .from('bt_video_metadata')
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
    .from('bt_video_metadata')
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
    .from('bt_ebook_metadata')
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
    .from('bt_ebook_metadata')
    .insert(metadata)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// ============================================================================
// Torrent Update Operations
// ============================================================================

/**
 * Swarm stats update data
 */
export interface SwarmStatsUpdate {
  seeders: number | null;
  leechers: number | null;
}

/**
 * Update swarm statistics for a torrent
 * Only updates if the new values are provided (non-null)
 * @param torrentId - The torrent ID
 * @param stats - The swarm stats to update
 * @returns The updated torrent
 */
export async function updateTorrentSwarmStats(
  torrentId: string,
  stats: SwarmStatsUpdate
): Promise<Torrent> {
  const client = getServerClient();

  const { data, error } = await client
    .from('bt_torrents')
    .update({
      seeders: stats.seeders,
      leechers: stats.leechers,
      swarm_updated_at: new Date().toISOString(),
    })
    .eq('id', torrentId)
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

  // Map the RPC result to SearchResult, handling cases where new fields might not exist
  // (for backwards compatibility with older database versions)
  if (!data) {
    return [];
  }

  return (data as Array<Record<string, unknown>>).map((row) => ({
    file_id: row.file_id as string,
    file_name: row.file_name as string,
    file_path: row.file_path as string,
    file_size: row.file_size as number,
    file_media_category: row.file_media_category as string,
    file_index: row.file_index as number,
    torrent_id: row.torrent_id as string,
    torrent_name: row.torrent_name as string,
    torrent_infohash: row.torrent_infohash as string,
    torrent_poster_url: (row.torrent_poster_url as string | null) ?? null,
    torrent_cover_url: (row.torrent_cover_url as string | null) ?? null,
    torrent_clean_title: (row.torrent_clean_title as string | null) ?? null,
    rank: row.rank as number,
  }));
}

/**
 * Torrent search result type
 */
export interface TorrentSearchResult {
  torrent_id: string;
  torrent_name: string;
  torrent_clean_title: string | null;
  torrent_infohash: string;
  torrent_total_size: number;
  torrent_file_count: number;
  torrent_seeders: number | null;
  torrent_leechers: number | null;
  torrent_created_at: string;
  torrent_poster_url: string | null;
  torrent_cover_url: string | null;
  match_type: string;
  rank: number;
}

/**
 * Search options for torrent search
 */
export interface TorrentSearchOptions {
  query: string;
  mediaType?: MediaCategory | null;
  limit?: number;
  offset?: number;
}

/**
 * Search torrents in bt_torrents table using ILIKE pattern matching
 * @param options - Search options
 * @returns Array of torrent search results
 */
export async function searchTorrents(options: TorrentSearchOptions): Promise<TorrentSearchResult[]> {
  const client = getServerClient();

  const { query, mediaType = null, limit = 50, offset = 0 } = options;

  // Build the search pattern
  const searchPattern = `%${query.toLowerCase()}%`;

  // Query bt_torrents with ILIKE search
  const queryBuilder = client
    .from('bt_torrents')
    .select('id, name, clean_title, infohash, total_size, file_count, seeders, leechers, created_at, poster_url, cover_url')
    .ilike('name', searchPattern)
    .order('seeders', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(error.message);
  }

  // If media type filter is specified, filter by files
  let results = data ?? [];

  if (mediaType && results.length > 0) {
    const torrentIds = results.map(t => t.id);
    const { data: filesWithType } = await client
      .from('bt_torrent_files')
      .select('torrent_id')
      .in('torrent_id', torrentIds)
      .eq('media_category', mediaType);

    if (filesWithType) {
      const torrentIdsWithType = new Set(filesWithType.map(f => f.torrent_id));
      results = results.filter(t => torrentIdsWithType.has(t.id));
    }
  }

  // Transform to TorrentSearchResult format
  return results.map(t => ({
    torrent_id: t.id,
    torrent_name: t.name,
    torrent_clean_title: t.clean_title,
    torrent_infohash: t.infohash,
    torrent_total_size: t.total_size,
    torrent_file_count: t.file_count,
    torrent_seeders: t.seeders,
    torrent_leechers: t.leechers,
    torrent_created_at: t.created_at ?? new Date().toISOString(),
    torrent_poster_url: t.poster_url,
    torrent_cover_url: t.cover_url,
    match_type: 'torrent_name',
    rank: 1.0,
  }));
}

/**
 * Search torrents by name only (simpler, faster)
 * @param options - Search options
 * @returns Array of torrent search results
 */
export async function searchTorrentsByName(options: TorrentSearchOptions): Promise<TorrentSearchResult[]> {
  // This is the same as searchTorrents for now
  return searchTorrents(options);
}

/**
 * Search DHT torrents in Bitmagnet's torrents table
 * @param options - Search options
 * @returns Array of DHT torrent search results
 */
export async function searchDhtTorrents(options: TorrentSearchOptions): Promise<TorrentSearchResult[]> {
  const client = getServerClient();
  const { query, limit = 50, offset = 0 } = options;

  // Use the search_all_torrents RPC with source='dht' filtering
  const { data, error } = await client.rpc('search_all_torrents', {
    search_query: query,
    result_limit: limit + offset + 100, // Fetch extra to filter by source
    result_offset: 0,
  });

  if (error) {
    console.error('DHT search error:', error);
    throw new Error(error.message);
  }

  // Filter to only DHT results and apply pagination
  const dhtResults = (data ?? [])
    .filter((row: Record<string, unknown>) => row.source === 'dht')
    .slice(offset, offset + limit);

  return dhtResults.map((row: Record<string, unknown>) => ({
    torrent_id: row.id as string,
    torrent_name: row.name as string,
    torrent_clean_title: null,
    torrent_infohash: row.infohash as string,
    torrent_total_size: Number(row.size),
    torrent_file_count: Number(row.files_count ?? 0),
    torrent_seeders: Number(row.seeders ?? 0),
    torrent_leechers: Number(row.leechers ?? 0),
    torrent_created_at: row.created_at as string,
    torrent_poster_url: row.poster_url as string | null,
    torrent_cover_url: row.cover_url as string | null,
    match_type: 'torrent_name',
    rank: 1.0,
    source: 'dht' as const,
  }));
}

/**
 * Search all torrents (both user and DHT) using unified search
 * @param options - Search options with optional source filter and sorting
 * @returns Array of torrent search results with source field
 */
export async function searchAllTorrents(
  options: TorrentSearchOptions & {
    source?: 'all' | 'user' | 'dht';
    sortBy?: 'relevance' | 'date' | 'seeders' | 'leechers' | 'size';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<(TorrentSearchResult & { source: 'user' | 'dht' })[]> {
  const client = getServerClient();
  const { query, source = 'all', limit = 50, offset = 0, sortBy = 'seeders', sortOrder = 'desc' } = options;

  // Use the search_all_torrents RPC
  const { data, error } = await client.rpc('search_all_torrents', {
    search_query: query,
    result_limit: source === 'all' ? limit : limit + 100, // Fetch extra if filtering
    result_offset: source === 'all' ? offset : 0,
    sort_by: sortBy === 'relevance' ? 'seeders' : sortBy, // Relevance defaults to seeders
    sort_order: sortOrder,
  });

  if (error) {
    console.error('Unified search error:', error);
    throw new Error(error.message);
  }

  let results = (data ?? []).map((row: Record<string, unknown>) => ({
    torrent_id: row.id as string,
    torrent_name: row.name as string,
    torrent_clean_title: (row.source === 'user' ? null : null) as string | null, // DHT torrents don't have clean_title
    torrent_infohash: row.infohash as string,
    torrent_total_size: Number(row.size),
    torrent_file_count: Number(row.files_count ?? 0),
    torrent_seeders: Number(row.seeders ?? 0),
    torrent_leechers: Number(row.leechers ?? 0),
    torrent_created_at: row.created_at as string,
    torrent_poster_url: row.poster_url as string | null,
    torrent_cover_url: row.cover_url as string | null,
    match_type: 'torrent_name',
    rank: 1.0,
    source: row.source as 'user' | 'dht',
  }));

  // Filter by source if specified
  if (source === 'user') {
    results = results.filter(r => r.source === 'user');
  } else if (source === 'dht') {
    results = results.filter(r => r.source === 'dht');
  }

  // Apply pagination if we fetched extra for filtering
  if (source !== 'all') {
    results = results.slice(offset, offset + limit);
  }

  return results;
}
