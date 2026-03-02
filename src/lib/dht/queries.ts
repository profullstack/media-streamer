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
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  runtime_minutes: number | null;
  genres: string | null;
  director: string | null;
  actors: string | null;
  year: number | null;
  poster_url: string | null;
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

  // Fetch IMDB match if available
  const { data: imdbMatch } = await (supabase as any)
    .from('dht_imdb_matches')
    .select('tconst')
    .eq('info_hash', hexHash)
    .single();

  let imdbRating: number | null = null;
  let imdbVotes: number | null = null;
  let runtimeMinutes: number | null = null;
  let genres: string | null = null;
  let director: string | null = null;
  let imdbYear: number | null = null;
  const imdbId: string | null = imdbMatch?.tconst ?? null;

  if (imdbId) {
    const [ratingsRes, basicsRes, crewRes] = await Promise.all([
      (supabase as any).from('imdb_title_ratings').select('average_rating, num_votes').eq('tconst', imdbId).single(),
      (supabase as any).from('imdb_title_basics').select('runtime_minutes, genres, start_year').eq('tconst', imdbId).single(),
      (supabase as any).from('imdb_title_crew').select('directors').eq('tconst', imdbId).single(),
    ]);
    if (ratingsRes.data) {
      imdbRating = parseFloat(ratingsRes.data.average_rating) || null;
      imdbVotes = parseInt(ratingsRes.data.num_votes, 10) || null;
    }
    if (basicsRes.data) {
      const rt = basicsRes.data.runtime_minutes;
      if (rt && rt !== '\\N') runtimeMinutes = parseInt(rt, 10) || null;
      const g = basicsRes.data.genres;
      if (g && g !== '\\N') genres = g.replace(/,/g, ', ');
      const y = basicsRes.data.start_year;
      if (y && y !== '\\N') imdbYear = parseInt(y, 10) || null;
    }
    if (crewRes.data?.directors && crewRes.data.directors !== '\\N') {
      const dirIds = crewRes.data.directors.split(',').slice(0, 3);
      const { data: names } = await (supabase as any)
        .from('imdb_name_basics')
        .select('primary_name')
        .in('nconst', dirIds);
      if (names?.length) {
        director = (names as any[]).map((n: any) => n.primary_name).join(', ');
      }
    }
  }

  // Fetch poster from TMDB using IMDB ID
  let posterUrl: string | null = null;
  if (imdbId) {
    try {
      const tmdbKey = process.env.TMDB_API_KEY;
      if (tmdbKey) {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`
        );
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json() as any;
          const movie = tmdbData.movie_results?.[0] || tmdbData.tv_results?.[0];
          if (movie?.poster_path) {
            posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
          }
        }
      }
    } catch {
      // TMDB fetch failed, continue without poster
    }
  }

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
    imdb_id: imdbId,
    imdb_rating: imdbRating,
    imdb_votes: imdbVotes,
    runtime_minutes: runtimeMinutes,
    genres,
    director,
    actors: null,
    year: imdbYear,
    poster_url: posterUrl,
    files: (files ?? []),
  };
}
