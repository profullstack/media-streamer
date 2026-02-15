/**
 * Direct DHT torrent queries against Bitmagnet tables.
 * Used for thin /dht/[infohash] landing pages.
 */

import { getServerClient } from '@/lib/supabase/client';

export interface DhtTorrentDetail {
  info_hash: string;
  name: string;
  size: number;
  files_count: number | null;
  extension: string | null;
  created_at: string;
  seeders: number | null;
  leechers: number | null;
  content_type: string | null;
  files: DhtFile[];
}

export interface DhtFile {
  index: number;
  path: string;
  size: number;
  extension: string | null;
}

/**
 * Fetch a DHT torrent by infohash with swarm stats and file list.
 */
export async function getDhtTorrentDetail(infohash: string): Promise<DhtTorrentDetail | null> {
  const supabase = getServerClient();

  const hexHash = `\\x${infohash}`;

  // Fetch torrent base row
  const { data: torrent, error } = await supabase
    .from('torrents' as never)
    .select('info_hash, name, size, files_count, extension, created_at')
    .eq('info_hash', hexHash)
    .single() as { data: Record<string, unknown> | null; error: unknown };

  if (error || !torrent) return null;

  // Fetch swarm stats (best source)
  const { data: sources } = await supabase
    .from('torrents_torrent_sources' as never)
    .select('seeders, leechers')
    .eq('info_hash', hexHash)
    .order('updated_at', { ascending: false })
    .limit(1) as { data: Array<{ seeders: number; leechers: number }> | null };

  const swarm = sources?.[0];

  // Fetch content type from torrent_contents
  const { data: contents } = await supabase
    .from('torrent_contents' as never)
    .select('content_type')
    .eq('info_hash', hexHash)
    .limit(1) as { data: Array<{ content_type: string | null }> | null };

  const contentType = contents?.[0]?.content_type ?? null;

  // Fetch files (limit 200 for display)
  const { data: files } = await supabase
    .from('torrent_files' as never)
    .select('index, path, size, extension')
    .eq('info_hash', hexHash)
    .order('index', { ascending: true })
    .limit(200) as { data: DhtFile[] | null };

  return {
    info_hash: infohash,
    name: String(torrent.name),
    size: Number(torrent.size),
    files_count: torrent.files_count != null ? Number(torrent.files_count) : null,
    extension: torrent.extension != null ? String(torrent.extension) : null,
    created_at: String(torrent.created_at),
    seeders: swarm?.seeders ?? null,
    leechers: swarm?.leechers ?? null,
    content_type: contentType,
    files: (files ?? []),
  };
}
