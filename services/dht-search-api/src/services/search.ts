import { getDb } from './db';
import { getCached, setCache } from './cache';
import { formatBytes } from '../utils/format';
import { buildMagnetUri } from '../utils/magnet';
import type {
  SearchParams,
  SearchResults,
  Torrent,
  TorrentDetails,
  TorrentFile,
  DbTorrent,
  DbTorrentFile,
  DhtStats,
} from '../types';

// Search torrents with full-text search
export async function searchTorrents(params: SearchParams): Promise<SearchResults> {
  const { q, limit = 50, offset = 0, sort = 'date', order = 'desc', category, min_size, max_size } =
    params;

  // Build cache key
  const cacheKey = `search:${JSON.stringify(params)}`;
  const cached = await getCached<SearchResults>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  // Build query
  let query = db
    .from('v_dht_torrents')
    .select('*', { count: 'exact' })
    .textSearch('search_vector', q, { type: 'websearch' });

  // Apply filters
  if (category) {
    query = query.eq('category', category);
  }
  if (min_size !== undefined) {
    query = query.gte('size', min_size);
  }
  if (max_size !== undefined) {
    query = query.lte('size', max_size);
  }

  // Apply sorting
  const sortColumn = sort === 'date' ? 'discovered_at' : sort === 'relevance' ? 'discovered_at' : sort;
  query = query.order(sortColumn, { ascending: order === 'asc' });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Search error:', error);
    throw new Error('Search failed');
  }

  const results: Torrent[] = (data || []).map((row: DbTorrent) => ({
    infohash: row.infohash,
    name: row.name,
    size: row.size,
    size_formatted: formatBytes(row.size),
    files_count: row.files_count,
    category: row.category as Torrent['category'],
    seeders: row.seeders,
    leechers: row.leechers,
    discovered_at: row.discovered_at,
    magnet: row.magnet || buildMagnetUri(row.infohash, row.name),
  }));

  const searchResults: SearchResults = {
    query: q,
    total: count || 0,
    limit,
    offset,
    results,
  };

  // Cache for 30 seconds
  await setCache(cacheKey, searchResults, 30);

  return searchResults;
}

// Get torrent details by infohash
export async function getTorrentByInfohash(infohash: string): Promise<TorrentDetails | null> {
  const cacheKey = `torrent:${infohash}`;
  const cached = await getCached<TorrentDetails>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  // Get torrent
  const { data: torrent, error: torrentError } = await db
    .from('v_dht_torrents')
    .select('*')
    .eq('infohash', infohash.toLowerCase())
    .single();

  if (torrentError || !torrent) {
    return null;
  }

  // Get torrent ID from main table for file lookup
  const { data: torrentRecord } = await db
    .from('dht_torrents')
    .select('id')
    .eq('info_hash', `\\x${infohash.toLowerCase()}`)
    .single();

  // Get files
  let files: TorrentFile[] = [];
  if (torrentRecord) {
    const { data: filesData } = await db
      .from('dht_torrent_files')
      .select('*')
      .eq('torrent_id', torrentRecord.id)
      .order('file_index', { ascending: true });

    files = (filesData || []).map((f: DbTorrentFile) => ({
      path: f.path,
      size: f.size,
      size_formatted: formatBytes(f.size),
    }));
  }

  const details: TorrentDetails = {
    infohash: torrent.infohash,
    name: torrent.name,
    size: torrent.size,
    size_formatted: formatBytes(torrent.size),
    files_count: torrent.files_count,
    category: torrent.category as Torrent['category'],
    seeders: torrent.seeders,
    leechers: torrent.leechers,
    discovered_at: torrent.discovered_at,
    updated_at: torrent.updated_at,
    magnet: torrent.magnet || buildMagnetUri(torrent.infohash, torrent.name),
    files,
  };

  // Cache for 5 minutes
  await setCache(cacheKey, details, 300);

  return details;
}

// Get recent torrents
export async function getRecentTorrents(
  limit = 50,
  category?: string
): Promise<Torrent[]> {
  const cacheKey = `recent:${limit}:${category || 'all'}`;
  const cached = await getCached<Torrent[]>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  let query = db
    .from('v_dht_torrents')
    .select('*')
    .order('discovered_at', { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Recent torrents error:', error);
    throw new Error('Failed to fetch recent torrents');
  }

  const results: Torrent[] = (data || []).map((row: DbTorrent) => ({
    infohash: row.infohash,
    name: row.name,
    size: row.size,
    size_formatted: formatBytes(row.size),
    files_count: row.files_count,
    category: row.category as Torrent['category'],
    seeders: row.seeders,
    leechers: row.leechers,
    discovered_at: row.discovered_at,
    magnet: row.magnet || buildMagnetUri(row.infohash, row.name),
  }));

  // Cache for 30 seconds
  await setCache(cacheKey, results, 30);

  return results;
}

// Get DHT statistics
export async function getStats(): Promise<DhtStats> {
  const cacheKey = 'stats';
  const cached = await getCached<DhtStats>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  const { data, error } = await db.from('v_dht_stats').select('*').single();

  if (error) {
    console.error('Stats error:', error);
    throw new Error('Failed to fetch stats');
  }

  const stats: DhtStats = {
    total_torrents: data?.total_torrents || 0,
    total_size_bytes: data?.total_size_bytes || 0,
    total_size_formatted: formatBytes(data?.total_size_bytes),
    torrents_24h: data?.torrents_24h || 0,
    torrents_7d: data?.torrents_7d || 0,
    torrents_30d: data?.torrents_30d || 0,
    crawler_status: 'unknown', // Would need to check Bitmagnet process
    last_indexed_at: data?.last_indexed_at || null,
  };

  // Cache for 60 seconds
  await setCache(cacheKey, stats, 60);

  return stats;
}
