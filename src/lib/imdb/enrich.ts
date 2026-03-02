/**
 * IMDB Enrichment Module
 *
 * Enriches torrent data with IMDB ratings, runtime, and other metadata
 * by joining external_id (tt* IMDB IDs) against imported IMDB dataset tables.
 */

import { createServerClient } from '@/lib/supabase';

interface ImdbData {
  imdbRating: number | null;
  imdbVotes: number | null;
  runtimeMinutes: number | null;
}

/**
 * Fetch IMDB data for a given tconst (e.g., tt1234567)
 */
async function getImdbData(tconst: string): Promise<ImdbData | null> {
  try {
    const supabase = createServerClient();

    const [ratingsResult, basicsResult] = await Promise.all([
      (supabase as any)
        .from('imdb_title_ratings')
        .select('average_rating, num_votes')
        .eq('tconst', tconst)
        .single(),
      (supabase as any)
        .from('imdb_title_basics')
        .select('runtime_minutes')
        .eq('tconst', tconst)
        .single(),
    ]);

    const rating = ratingsResult.data as { average_rating: string; num_votes: string } | null;
    const basics = basicsResult.data as { runtime_minutes: string } | null;

    if (!rating && !basics) return null;

    return {
      imdbRating: rating?.average_rating ? parseFloat(rating.average_rating) : null,
      imdbVotes: rating?.num_votes ? parseInt(rating.num_votes, 10) : null,
      runtimeMinutes: basics?.runtime_minutes ? parseInt(basics.runtime_minutes, 10) : null,
    };
  } catch (error) {
    console.error(`[IMDB] Error fetching data for ${tconst}:`, error);
    return null;
  }
}

/**
 * Enrich a torrent object with IMDB data if it has an IMDB external_id.
 */
export async function enrichWithImdb<T extends {
  externalId: string | null;
  externalSource: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  runtimeMinutes: number | null;
}>(torrent: T): Promise<T> {
  if (!torrent.externalId || torrent.externalSource !== 'omdb') {
    return torrent;
  }

  const tconst = torrent.externalId;
  if (!tconst.startsWith('tt')) {
    return torrent;
  }

  const imdbData = await getImdbData(tconst);
  if (!imdbData) return torrent;

  return {
    ...torrent,
    imdbRating: imdbData.imdbRating,
    imdbVotes: imdbData.imdbVotes,
    runtimeMinutes: imdbData.runtimeMinutes ?? torrent.runtimeMinutes,
  };
}

/**
 * Batch enrich multiple torrents with IMDB data.
 * Efficient for list pages — fetches all IMDB IDs in one query.
 */
export async function batchEnrichWithImdb<T extends {
  externalId: string | null;
  externalSource: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  runtimeMinutes: number | null;
}>(torrents: T[]): Promise<T[]> {
  const imdbIds = torrents
    .filter(t => t.externalId && t.externalSource === 'omdb' && t.externalId.startsWith('tt'))
    .map(t => t.externalId!);

  if (imdbIds.length === 0) return torrents;

  try {
    const supabase = createServerClient();

    const [ratingsResult, basicsResult] = await Promise.all([
      (supabase as any)
        .from('imdb_title_ratings')
        .select('tconst, average_rating, num_votes')
        .in('tconst', imdbIds),
      (supabase as any)
        .from('imdb_title_basics')
        .select('tconst, runtime_minutes')
        .in('tconst', imdbIds),
    ]);

    type RatingRow = { tconst: string; average_rating: string; num_votes: string };
    type BasicRow = { tconst: string; runtime_minutes: string };

    const ratingsMap = new Map(
      ((ratingsResult.data ?? []) as RatingRow[]).map(r => [r.tconst, r])
    );
    const basicsMap = new Map(
      ((basicsResult.data ?? []) as BasicRow[]).map(b => [b.tconst, b])
    );

    return torrents.map(t => {
      if (!t.externalId || t.externalSource !== 'omdb' || !t.externalId.startsWith('tt')) {
        return t;
      }

      const rating = ratingsMap.get(t.externalId);
      const basics = basicsMap.get(t.externalId);

      return {
        ...t,
        imdbRating: rating?.average_rating ? parseFloat(rating.average_rating) : null,
        imdbVotes: rating?.num_votes ? parseInt(rating.num_votes, 10) : null,
        runtimeMinutes: basics?.runtime_minutes ? parseInt(basics.runtime_minutes, 10) : null,
      };
    });
  } catch (error) {
    console.error('[IMDB] Batch enrichment error:', error);
    return torrents;
  }
}

/**
 * Batch enrich DHT search results with IMDB data via dht_imdb_matches table.
 * Looks up infohashes → tconst → ratings/basics.
 */
export async function batchEnrichDhtWithImdb<T extends {
  torrent_infohash: string;
  [key: string]: unknown;
}>(results: T[]): Promise<(T & {
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  runtime_minutes: number | null;
  genres: string | null;
  year: number | null;
  poster_url: string | null;
})[]> {
  const defaults = { imdb_id: null, imdb_rating: null, imdb_votes: null, runtime_minutes: null, genres: null, year: null, poster_url: null };

  if (results.length === 0) return results.map(r => ({ ...r, ...defaults }));

  try {
    const supabase = createServerClient();
    const hexHashes = results.map(r => r.torrent_infohash.toLowerCase());

    const { data: matches } = await (supabase as any)
      .rpc('lookup_dht_imdb_matches', { hex_hashes: hexHashes });

    if (!matches?.length) return results.map(r => ({ ...r, ...defaults }));

    const matchMap = new Map<string, { tconst: string; poster_url: string | null }>();
    for (const m of matches as { info_hash_hex: string; tconst: string; poster_url: string | null }[]) {
      matchMap.set(m.info_hash_hex.toLowerCase(), { tconst: m.tconst, poster_url: m.poster_url || null });
    }

    const tconsts = [...new Set([...matchMap.values()].map(v => v.tconst))];

    if (tconsts.length === 0) return results.map(r => ({ ...r, ...defaults }));

    const [ratingsRes, basicsRes] = await Promise.all([
      (supabase as any).from('imdb_title_ratings')
        .select('tconst, average_rating, num_votes').in('tconst', tconsts),
      (supabase as any).from('imdb_title_basics')
        .select('tconst, runtime_minutes, genres, start_year').in('tconst', tconsts),
    ]);

    type RatingRow = { tconst: string; average_rating: string; num_votes: string };
    type BasicRow = { tconst: string; runtime_minutes: string; genres: string; start_year: string };

    const ratingsMap = new Map(((ratingsRes.data ?? []) as RatingRow[]).map(r => [r.tconst, r]));
    const basicsMap = new Map(((basicsRes.data ?? []) as BasicRow[]).map(b => [b.tconst, b]));

    return results.map(r => {
      const match = matchMap.get(r.torrent_infohash.toLowerCase());
      const tconst = match?.tconst ?? null;
      const rating = tconst ? ratingsMap.get(tconst) : null;
      const basics = tconst ? basicsMap.get(tconst) : null;

      return {
        ...r,
        imdb_id: tconst,
        poster_url: match?.poster_url ?? null,
        imdb_rating: rating?.average_rating ? parseFloat(rating.average_rating) : null,
        imdb_votes: rating?.num_votes ? parseInt(rating.num_votes, 10) : null,
        runtime_minutes: basics?.runtime_minutes && basics.runtime_minutes !== '\\N'
          ? parseInt(basics.runtime_minutes, 10) : null,
        genres: basics?.genres && basics.genres !== '\\N'
          ? basics.genres.replace(/,/g, ', ') : null,
        year: basics?.start_year && basics.start_year !== '\\N'
          ? parseInt(basics.start_year, 10) : null,
      };
    });
  } catch (error) {
    console.error('[IMDB] DHT batch enrichment error:', error);
    return results.map(r => ({ ...r, ...defaults }));
  }
}
