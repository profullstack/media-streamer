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
  DhtStats,
} from '../types';

/**
 * Bitmagnet's torrents table row
 */
interface BmTorrent {
  info_hash: string; // bytea as hex-encoded string
  name: string;
  size: number | null;
  files_count: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Bitmagnet's torrent_files table row
 */
interface BmTorrentFile {
  info_hash: string;
  index: number;
  path: string;
  size: number;
}

/**
 * Convert bytea info_hash to hex string
 * Supabase returns bytea as \x prefixed hex string
 */
function bytesToHex(bytea: string | Uint8Array): string {
  if (typeof bytea === 'string') {
    // Remove \x prefix if present
    if (bytea.startsWith('\\x')) {
      return bytea.slice(2).toLowerCase();
    }
    return bytea.toLowerCase();
  }
  return Array.from(bytea).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Search torrents with ILIKE pattern matching (Bitmagnet doesn't have tsvector)
export async function searchTorrents(params: SearchParams): Promise<SearchResults> {
  const { q, limit = 50, offset = 0, sort = 'date', order = 'desc', min_size, max_size } =
    params;

  // Build cache key
  const cacheKey = `search:${JSON.stringify(params)}`;
  const cached = await getCached<SearchResults>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  // Query Bitmagnet's torrents table directly with ILIKE search
  let query = db
    .from('torrents')
    .select('info_hash, name, size, files_count, created_at, updated_at', { count: 'exact' })
    .ilike('name', `%${q}%`);

  // Apply filters
  if (min_size !== undefined) {
    query = query.gte('size', min_size);
  }
  if (max_size !== undefined) {
    query = query.lte('size', max_size);
  }

  // Apply sorting
  const sortColumnMap: Record<string, string> = {
    date: 'created_at',
    size: 'size',
    name: 'name',
    relevance: 'created_at', // Bitmagnet doesn't have relevance scoring
  };
  const sortColumn = sortColumnMap[sort] || 'created_at';
  query = query.order(sortColumn, { ascending: order === 'asc', nullsFirst: false });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Search error:', error);
    throw new Error('Search failed');
  }

  const results: Torrent[] = (data || []).map((row: BmTorrent) => {
    const infohash = bytesToHex(row.info_hash);
    return {
      infohash,
      name: row.name,
      size: row.size ?? 0,
      size_formatted: formatBytes(row.size ?? 0),
      files_count: row.files_count ?? 0,
      category: null, // Bitmagnet doesn't categorize like our schema
      seeders: 0, // Would need to query torrent_sources
      leechers: 0,
      discovered_at: row.created_at,
      magnet: buildMagnetUri(infohash, row.name),
    };
  });

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
  const normalizedHash = infohash.toLowerCase();

  // Query Bitmagnet's torrents table
  // Note: Supabase doesn't support bytea comparison directly via JS client
  // We need to use a raw SQL query or RPC function for this
  // For now, we'll try using the hex-encoded comparison
  const { data: torrent, error: torrentError } = await db
    .from('torrents')
    .select('info_hash, name, size, files_count, created_at, updated_at')
    .filter('info_hash', 'eq', `\\x${normalizedHash}`)
    .single();

  if (torrentError || !torrent) {
    return null;
  }

  // Get files from Bitmagnet's torrent_files table
  const { data: filesData } = await db
    .from('torrent_files')
    .select('path, size, index')
    .filter('info_hash', 'eq', `\\x${normalizedHash}`)
    .order('index', { ascending: true });

  const files: TorrentFile[] = (filesData || []).map((f: BmTorrentFile) => ({
    path: f.path,
    size: f.size,
    size_formatted: formatBytes(f.size),
  }));

  const details: TorrentDetails = {
    infohash: normalizedHash,
    name: torrent.name,
    size: torrent.size ?? 0,
    size_formatted: formatBytes(torrent.size ?? 0),
    files_count: torrent.files_count ?? files.length,
    category: null,
    seeders: 0,
    leechers: 0,
    discovered_at: torrent.created_at,
    updated_at: torrent.updated_at,
    magnet: buildMagnetUri(normalizedHash, torrent.name),
    files,
  };

  // Cache for 5 minutes
  await setCache(cacheKey, details, 300);

  return details;
}

// Get recent torrents
export async function getRecentTorrents(
  limit = 50,
  _category?: string // Category not supported in Bitmagnet schema
): Promise<Torrent[]> {
  const cacheKey = `recent:${limit}:all`;
  const cached = await getCached<Torrent[]>(cacheKey);
  if (cached) return cached;

  const db = getDb();

  const { data, error } = await db
    .from('torrents')
    .select('info_hash, name, size, files_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Recent torrents error:', error);
    throw new Error('Failed to fetch recent torrents');
  }

  const results: Torrent[] = (data || []).map((row: BmTorrent) => {
    const infohash = bytesToHex(row.info_hash);
    return {
      infohash,
      name: row.name,
      size: row.size ?? 0,
      size_formatted: formatBytes(row.size ?? 0),
      files_count: row.files_count ?? 0,
      category: null,
      seeders: 0,
      leechers: 0,
      discovered_at: row.created_at,
      magnet: buildMagnetUri(infohash, row.name),
    };
  });

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

  // Query Bitmagnet's torrents table for basic stats
  const { count: totalCount } = await db
    .from('torrents')
    .select('*', { count: 'exact', head: true });

  // Get counts for different time windows
  const now = new Date();
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: count24h }, { count: count7d }, { count: count30d }] = await Promise.all([
    db.from('torrents').select('*', { count: 'exact', head: true }).gte('created_at', day),
    db.from('torrents').select('*', { count: 'exact', head: true }).gte('created_at', week),
    db.from('torrents').select('*', { count: 'exact', head: true }).gte('created_at', month),
  ]);

  // Get total size
  const { data: sizeData } = await db
    .from('torrents')
    .select('size')
    .not('size', 'is', null);

  const totalSize = (sizeData || []).reduce((acc: number, row: { size: number }) => acc + (row.size || 0), 0);

  // Get last indexed
  const { data: lastData } = await db
    .from('torrents')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const stats: DhtStats = {
    total_torrents: totalCount || 0,
    total_size_bytes: totalSize,
    total_size_formatted: formatBytes(totalSize),
    torrents_24h: count24h || 0,
    torrents_7d: count7d || 0,
    torrents_30d: count30d || 0,
    crawler_status: 'running', // Bitmagnet is running
    last_indexed_at: lastData?.created_at || null,
  };

  // Cache for 60 seconds
  await setCache(cacheKey, stats, 60);

  return stats;
}
