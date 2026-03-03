/**
 * TMDB Enrichment — fetches rich metadata from TMDB using an IMDB ID.
 * Makes 2-3 API calls: /find (IMDB→TMDB) + /movie or /tv (details+credits).
 * Falls back to /search if /find returns nothing (common for obscure IMDB entries).
 *
 * Results are cached in the tmdb_data table to avoid repeated API calls.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export interface TmdbData {
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  tagline: string | null;
  cast: string | null;
  writers: string | null;
  contentRating: string | null;
  tmdbId: number | null;
}

const EMPTY: TmdbData = {
  posterUrl: null, backdropUrl: null, overview: null, tagline: null,
  cast: null, writers: null, contentRating: null, tmdbId: null,
};

function getCacheKey(imdbId: string, titleHint?: string): string {
  if (imdbId) return imdbId;
  if (titleHint) return 'title:' + createHash('sha256').update(titleHint.toLowerCase().trim()).digest('hex').slice(0, 32);
  return '';
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCached(key: string): Promise<TmdbData | null> {
  if (!key) return null;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from('tmdb_data')
      .select('*')
      .eq('lookup_key', key)
      .single();
    if (!data) return null;

    return {
      posterUrl: data.poster_url,
      backdropUrl: data.backdrop_url,
      overview: data.overview,
      tagline: data.tagline,
      cast: data.cast_names,
      writers: data.writers,
      contentRating: data.content_rating,
      tmdbId: data.tmdb_id,
    };
  } catch {
    return null;
  }
}

async function setCache(key: string, data: TmdbData): Promise<void> {
  if (!key) return;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase
      .from('tmdb_data')
      .upsert({
        lookup_key: key,
        tmdb_id: data.tmdbId,
        poster_url: data.posterUrl,
        backdrop_url: data.backdropUrl,
        overview: data.overview,
        tagline: data.tagline,
        cast_names: data.cast,
        writers: data.writers,
        content_rating: data.contentRating,
      }, { onConflict: 'lookup_key' });
  } catch {
    // Cache write failure is non-critical
  }
}

function cleanTitleForSearch(titleHint: string): string {
  let cleanTitle = titleHint
    .replace(/\.\w{2,4}$/, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^(www\.)?[a-z0-9_-]+\.(org|com|net|io|tv|cc|to|bargains|club|xyz|me)\s*[-\u2013\u2014]\s*/i, '')
    .replace(/[._]/g, ' ')
    .replace(/(S\d{1,2}E\d{1,2}).*$/i, '')
    .replace(/\b(1080p|720p|2160p|4k|480p|bluray|blu-ray|brrip|bdrip|dvdrip|webrip|web-?dl|webdl|hdtv|hdrip|x264|x265|hevc|avc|aac[0-9. ]*|ac3|dts|flac|mp3|remux|uhd|uhdr|hdr|hdr10|dv|dolby|vision|10bit|8bit|repack|proper|extended|unrated|dubbed|subbed|multi|dual|audio|subs|h264|h265)\b/gi, '')
    .replace(/\b(HQ|HDRip|ESub|HDCAM|CAM|DVDScr|PDTV|TS|TC|SCR)\b/gi, '')
    .replace(/\b(Malayalam|Tamil|Telugu|Hindi|Kannada|Bengali|Marathi|Punjabi|Gujarati|English|Spanish|French|German|Italian|Korean|Japanese|Chinese|Russian|Arabic|Turkish|Hungarian|Polish|Dutch|Portuguese|Ukrainian|Czech)\b/gi, '')
    .replace(/\b\d+(\.\d+)?\s*(MB|GB|TB)\b/gi, '')
    .replace(/\s*[-\u2013]\s*[A-Za-z0-9]{2,15}\s*$/, '')
    .replace(/(19|20)\d{2}.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanTitle.length < 2) cleanTitle = titleHint;
  return cleanTitle;
}

export async function fetchTmdbData(imdbId: string, titleHint?: string): Promise<TmdbData> {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return EMPTY;
  if (!imdbId && !titleHint) return EMPTY;

  // Check cache first
  const cacheKey = getCacheKey(imdbId, titleHint);
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  try {
    let tmdbId: number | null = null;
    let isTV = false;
    let posterUrl: string | null = null;
    let backdropUrl: string | null = null;
    let overview: string | null = null;

    // Step 1: Find TMDB ID from IMDB ID
    if (imdbId) {
      const findRes = await fetch(
        `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`
      );
      if (findRes.ok) {
        const findData = await findRes.json() as any;
        const movieResult = findData.movie_results?.[0];
        const tvResult = findData.tv_results?.[0];
        const result = movieResult || tvResult;

        if (result) {
          tmdbId = result.id;
          isTV = !movieResult && !!tvResult;
          posterUrl = result.poster_path
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
          backdropUrl = result.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : null;
          overview = result.overview || null;
        }
      }
    }

    // Step 1b: Fallback — search TMDB by title
    if (!tmdbId && titleHint) {
      const cleanTitle = cleanTitleForSearch(titleHint);
      const searchQuery = encodeURIComponent(cleanTitle);
      for (const mediaType of ['tv', 'movie'] as const) {
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/${mediaType}?api_key=${tmdbKey}&query=${searchQuery}&page=1`
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json() as any;
          const result = searchData.results?.[0];
          if (result) {
            tmdbId = result.id;
            isTV = mediaType === 'tv';
            posterUrl = result.poster_path
              ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
            backdropUrl = result.backdrop_path
              ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : null;
            overview = result.overview || null;
            break;
          }
        }
      }
    }

    if (!tmdbId) {
      // Cache the miss too (avoid repeated lookups for non-existent content)
      await setCache(cacheKey, EMPTY);
      return EMPTY;
    }

    // Step 2: Get credits + release info
    let tagline: string | null = null;
    let cast: string | null = null;
    let writers: string | null = null;
    let contentRating: string | null = null;

    const mediaType = isTV ? 'tv' : 'movie';
    const appendTo = isTV ? 'credits,content_ratings' : 'credits,release_dates';
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=${appendTo}`
    );

    if (detailRes.ok) {
      const detail = await detailRes.json() as any;
      tagline = detail.tagline || null;
      overview = detail.overview || overview;

      const castList = detail.credits?.cast?.slice(0, 8);
      if (castList?.length) {
        cast = castList.map((c: any) => c.name).join(', ');
      }

      const writersList = detail.credits?.crew
        ?.filter((c: any) => c.department === 'Writing')
        ?.slice(0, 3);
      if (writersList?.length) {
        writers = writersList.map((w: any) => w.name).join(', ');
      }

      if (isTV) {
        const usRating = detail.content_ratings?.results
          ?.find((r: any) => r.iso_3166_1 === 'US');
        contentRating = usRating?.rating || null;
      } else {
        const usRelease = detail.release_dates?.results
          ?.find((r: any) => r.iso_3166_1 === 'US');
        contentRating = usRelease?.release_dates?.[0]?.certification || null;
      }
    }

    const result: TmdbData = { posterUrl, backdropUrl, overview, tagline, cast, writers, contentRating, tmdbId };

    // Cache the result
    await setCache(cacheKey, result);

    return result;
  } catch {
    return EMPTY;
  }
}
