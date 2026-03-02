/**
 * TMDB Enrichment — fetches rich metadata from TMDB using an IMDB ID.
 * Makes 2 API calls: /find (IMDB→TMDB) + /movie or /tv (details+credits).
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

export async function fetchTmdbData(imdbId: string): Promise<TmdbData> {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey || !imdbId) return EMPTY;

  try {
    // Step 1: Find TMDB ID from IMDB ID
    const findRes = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`
    );
    if (!findRes.ok) return EMPTY;

    const findData = await findRes.json() as any;
    const movieResult = findData.movie_results?.[0];
    const tvResult = findData.tv_results?.[0];
    const isTV = !movieResult && !!tvResult;
    const result = movieResult || tvResult;
    if (!result) return EMPTY;

    const tmdbId = result.id as number;
    const posterUrl = result.poster_path
      ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
    const backdropUrl = result.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : null;
    let overview = result.overview || null;

    // Step 2: Get credits + release info in one call
    const mediaType = isTV ? 'tv' : 'movie';
    const appendTo = isTV ? 'credits,content_ratings' : 'credits,release_dates';
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=${appendTo}`
    );

    let tagline: string | null = null;
    let cast: string | null = null;
    let writers: string | null = null;
    let contentRating: string | null = null;

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

    return { posterUrl, backdropUrl, overview, tagline, cast, writers, contentRating, tmdbId };
  } catch {
    return EMPTY;
  }
}
