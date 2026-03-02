/**
 * TMDB Enrichment — fetches rich metadata from TMDB using an IMDB ID.
 * Makes 2-3 API calls: /find (IMDB→TMDB) + /movie or /tv (details+credits).
 * Falls back to /search if /find returns nothing (common for obscure IMDB entries).
 */

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

export async function fetchTmdbData(imdbId: string, titleHint?: string): Promise<TmdbData> {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return EMPTY;
    if (!imdbId && !titleHint) return EMPTY;

  try {
    let tmdbId: number | null = null;
    let isTV = false;
    let posterUrl: string | null = null;
    let backdropUrl: string | null = null;
    let overview: string | null = null;

    // Step 1: Find TMDB ID from IMDB ID (skip if no imdbId)
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

    // Step 1b: Fallback — search TMDB by title if /find returned nothing
    if (!tmdbId && titleHint) {
      // Clean the title: strip codecs, quality, brackets, file extensions, season/episode info
      let cleanTitle = titleHint
        .replace(/\.\w{2,4}$/, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[._]/g, ' ')
        .replace(/(S\d{1,2}E\d{1,2}).*$/i, '')
        .replace(/(1080p|720p|2160p|4k|480p|bluray|brrip|dvdrip|webrip|web-?dl|hdtv|hdrip|x264|x265|hevc|aac|ac3|dts|remux|uhd|hdr|h264|h265)/gi, '')
        .replace(/(19|20)\d{2}.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
        if (cleanTitle.length < 2) cleanTitle = titleHint;
      const searchQuery = encodeURIComponent(cleanTitle);
      // Try TV first, then movie
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

    if (!tmdbId) return EMPTY;

    // Step 2: Get credits + release info in one call
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

    const result = { posterUrl, backdropUrl, overview, tagline, cast, writers, contentRating, tmdbId };
    try { require('fs').writeFileSync('/tmp/tmdb-debug.json', JSON.stringify({ imdbId, titleHint, result }, null, 2)); } catch {}
    return result;
  } catch {
    return EMPTY;
  }
}
