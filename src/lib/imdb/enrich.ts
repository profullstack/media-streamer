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
