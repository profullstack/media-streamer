/**
 * TMDB Service
 *
 * Uses /discover, /movie/now_playing, /tv/on_the_air, /tv/airing_today,
 * and /search/multi endpoints. Enriches with credits (cast, directors).
 * All responses are cached via TMDBCache.
 */

import { TMDBCache, CACHE_TTL, getTMDBCache } from './tmdb-cache';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ============================================================================
// Types
// ============================================================================

export interface TMDBUpcomingItem {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number;
  genres: string[];
  cast: string[];
  directors: string[];
  runtime: number | null;
  popularity: number;
}

export interface TMDBListResponse {
  items: TMDBUpcomingItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

// Raw TMDB API types
interface TMDBRawMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
}

interface TMDBRawTV {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
}

interface TMDBDiscoverResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: (TMDBRawMovie | TMDBRawTV)[];
}

interface TMDBSearchMultiResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
}

interface TMDBSearchMultiResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TMDBSearchMultiResult[];
}

interface TMDBCreditsResponse {
  cast: { name: string; character: string; order: number }[];
  crew: { name: string; job: string }[];
}

interface TMDBMovieDetail {
  runtime: number | null;
  genres: { id: number; name: string }[];
}

interface TMDBTVDetail {
  episode_run_time: number[];
  genres: { id: number; name: string }[];
  created_by: { name: string }[];
}

interface TMDBGenre {
  id: number;
  name: string;
}

/** Format a Date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// Service
// ============================================================================

export class TMDBService {
  private genreMapMovie: Map<number, string> | null = null;
  private genreMapTV: Map<number, string> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly cache: TMDBCache,
  ) {}

  // --------------------------------------------------------------------------
  // Public: Upcoming (discover with future date range)
  // --------------------------------------------------------------------------

  /**
   * Fetch upcoming movies via /discover/movie
   * Date window: 30 days ago → 6 months from now, sorted newest first
   */
  async getUpcomingMovies(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `movies:v3:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchDiscover('movie', page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch upcoming TV series via /discover/tv
   * Date window: 30 days ago → 6 months from now, sorted soonest first
   */
  async getUpcomingTVSeries(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `tv:v3:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchDiscover('tv', page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  // --------------------------------------------------------------------------
  // Public: Recent releases
  // --------------------------------------------------------------------------

  /**
   * Fetch recently released movies.
   * Merges /movie/now_playing with /discover/movie (last 30 days),
   * deduplicates, sorts by release date desc.
   */
  async getRecentMovies(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `recent:movies:v1:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchRecentMovies(page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch recently airing TV series.
   * Merges /tv/on_the_air + /tv/airing_today + /discover/tv (last 30 days),
   * deduplicates, sorts by air date desc.
   */
  async getRecentTVSeries(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `recent:tv:v1:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchRecentTV(page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  // --------------------------------------------------------------------------
  // Public: Search
  // --------------------------------------------------------------------------

  /**
   * Search TMDB for movies and TV series.
   * Uses /search/multi, filters out person results, enriches with credits.
   */
  async searchMulti(query: string, page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `search:multi:${query}:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchSearchMulti(query, page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  // --------------------------------------------------------------------------
  // Private: Discover (upcoming)
  // --------------------------------------------------------------------------

  private async fetchDiscover(
    mediaType: 'movie' | 'tv',
    page: number,
  ): Promise<TMDBListResponse> {
    await this.ensureGenreMaps();

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(now);
    dateTo.setMonth(dateTo.getMonth() + 6);

    const dateFromStr = toDateStr(dateFrom);
    const dateToStr = toDateStr(dateTo);

    const dateParams = mediaType === 'movie'
      ? `primary_release_date.gte=${dateFromStr}&primary_release_date.lte=${dateToStr}&sort_by=primary_release_date.asc`
      : `first_air_date.gte=${dateFromStr}&first_air_date.lte=${dateToStr}&sort_by=first_air_date.asc`;

    const discoverUrl = `${TMDB_BASE_URL}/discover/${mediaType}`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`
      + `&${dateParams}&include_adult=false&with_original_language=en`;

    const data = await this.fetchUrl<TMDBDiscoverResponse>(discoverUrl, `discover:${mediaType}:${page}`);

    if (!data) {
      return { items: [], page, totalPages: 0, totalResults: 0 };
    }

    const items = this.mapRawResults(data.results, mediaType);
    const enriched = await this.enrichWithCredits(items, mediaType);

    return {
      items: enriched,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  // --------------------------------------------------------------------------
  // Private: Recent releases
  // --------------------------------------------------------------------------

  private async fetchRecentMovies(page: number): Promise<TMDBListResponse> {
    await this.ensureGenreMaps();

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateFromStr = toDateStr(dateFrom);
    const dateToStr = toDateStr(now);

    const nowPlayingUrl = `${TMDB_BASE_URL}/movie/now_playing`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`;

    const discoverUrl = `${TMDB_BASE_URL}/discover/movie`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`
      + `&primary_release_date.gte=${dateFromStr}&primary_release_date.lte=${dateToStr}`
      + `&sort_by=primary_release_date.desc&include_adult=false&with_original_language=en`;

    const [nowPlaying, discover] = await Promise.all([
      this.fetchUrl<TMDBDiscoverResponse>(nowPlayingUrl, `now_playing:movie:${page}`),
      this.fetchUrl<TMDBDiscoverResponse>(discoverUrl, `recent_discover:movie:${page}`),
    ]);

    const allRaw = [
      ...(nowPlaying?.results ?? []),
      ...(discover?.results ?? []),
    ];

    // Deduplicate by ID
    const seen = new Map<number, TMDBRawMovie>();
    for (const raw of allRaw) {
      if (!seen.has(raw.id)) {
        seen.set(raw.id, raw as TMDBRawMovie);
      }
    }

    // Sort by release_date descending
    const unique = Array.from(seen.values()).sort((a, b) => {
      const da = a.release_date || '';
      const db = b.release_date || '';
      return db.localeCompare(da);
    });

    const items = unique.map(raw => this.mapRawMovieToItem(raw));
    const enriched = await this.enrichWithCredits(items, 'movie');

    // Use discover totals as authoritative (filtered by date range)
    const totalPages = discover?.total_pages ?? nowPlaying?.total_pages ?? 0;
    const totalResults = discover?.total_results ?? nowPlaying?.total_results ?? 0;

    return {
      items: enriched,
      page,
      totalPages,
      totalResults,
    };
  }

  private async fetchRecentTV(page: number): Promise<TMDBListResponse> {
    await this.ensureGenreMaps();

    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateFromStr = toDateStr(dateFrom);
    const dateToStr = toDateStr(now);

    const onTheAirUrl = `${TMDB_BASE_URL}/tv/on_the_air`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}`;

    const airingTodayUrl = `${TMDB_BASE_URL}/tv/airing_today`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}`;

    const discoverUrl = `${TMDB_BASE_URL}/discover/tv`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`
      + `&first_air_date.gte=${dateFromStr}&first_air_date.lte=${dateToStr}`
      + `&sort_by=first_air_date.desc&include_adult=false&with_original_language=en`;

    const [onTheAir, airingToday, discover] = await Promise.all([
      this.fetchUrl<TMDBDiscoverResponse>(onTheAirUrl, `on_the_air:tv:${page}`),
      this.fetchUrl<TMDBDiscoverResponse>(airingTodayUrl, `airing_today:tv:${page}`),
      this.fetchUrl<TMDBDiscoverResponse>(discoverUrl, `recent_discover:tv:${page}`),
    ]);

    const allRaw = [
      ...(onTheAir?.results ?? []),
      ...(airingToday?.results ?? []),
      ...(discover?.results ?? []),
    ];

    // Deduplicate by ID
    const seen = new Map<number, TMDBRawTV>();
    for (const raw of allRaw) {
      if (!seen.has(raw.id)) {
        seen.set(raw.id, raw as TMDBRawTV);
      }
    }

    // Sort by first_air_date descending
    const unique = Array.from(seen.values()).sort((a, b) => {
      const da = a.first_air_date || '';
      const db = b.first_air_date || '';
      return db.localeCompare(da);
    });

    const items = unique.map(raw => this.mapRawTVToItem(raw));
    const enriched = await this.enrichWithCredits(items, 'tv');

    const totalPages = discover?.total_pages ?? onTheAir?.total_pages ?? 0;
    const totalResults = discover?.total_results ?? onTheAir?.total_results ?? 0;

    return {
      items: enriched,
      page,
      totalPages,
      totalResults,
    };
  }

  // --------------------------------------------------------------------------
  // Private: Search
  // --------------------------------------------------------------------------

  private async fetchSearchMulti(
    query: string,
    page: number,
  ): Promise<TMDBListResponse> {
    await this.ensureGenreMaps();

    const searchUrl = `${TMDB_BASE_URL}/search/multi`
      + `?api_key=${this.apiKey}&language=en-US`
      + `&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;

    const data = await this.fetchUrl<TMDBSearchMultiResponse>(
      searchUrl,
      `search:multi:${query}:${page}`,
    );

    if (!data) {
      return { items: [], page, totalPages: 0, totalResults: 0 };
    }

    // Filter out person results
    const mediaResults = data.results.filter(
      r => r.media_type === 'movie' || r.media_type === 'tv',
    );

    // Map to items
    const items: TMDBUpcomingItem[] = mediaResults.map(raw => {
      if (raw.media_type === 'movie') {
        return this.mapRawMovieToItem({
          id: raw.id,
          title: raw.title ?? '',
          overview: raw.overview ?? '',
          poster_path: raw.poster_path,
          backdrop_path: raw.backdrop_path,
          release_date: raw.release_date ?? '',
          vote_average: raw.vote_average,
          vote_count: raw.vote_count,
          genre_ids: raw.genre_ids ?? [],
          popularity: raw.popularity,
        });
      }
      return this.mapRawTVToItem({
        id: raw.id,
        name: raw.name ?? '',
        overview: raw.overview ?? '',
        poster_path: raw.poster_path,
        backdrop_path: raw.backdrop_path,
        first_air_date: raw.first_air_date ?? '',
        vote_average: raw.vote_average,
        vote_count: raw.vote_count,
        genre_ids: raw.genre_ids ?? [],
        popularity: raw.popularity,
      });
    });

    // Enrich movies and TV separately, then merge back in original order
    const movieItems = items.filter(i => i.mediaType === 'movie');
    const tvItems = items.filter(i => i.mediaType === 'tv');

    const [enrichedMovies, enrichedTv] = await Promise.all([
      movieItems.length > 0 ? this.enrichWithCredits(movieItems, 'movie') : Promise.resolve([]),
      tvItems.length > 0 ? this.enrichWithCredits(tvItems, 'tv') : Promise.resolve([]),
    ]);

    // Rebuild in original order
    const enrichedMap = new Map<string, TMDBUpcomingItem>();
    for (const item of [...enrichedMovies, ...enrichedTv]) {
      enrichedMap.set(`${item.mediaType}-${item.id}`, item);
    }
    const finalItems = items.map(i => enrichedMap.get(`${i.mediaType}-${i.id}`) ?? i);

    return {
      items: finalItems,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  // --------------------------------------------------------------------------
  // Private: Mapping helpers
  // --------------------------------------------------------------------------

  private mapRawMovieToItem(raw: TMDBRawMovie): TMDBUpcomingItem {
    const genreMap = this.genreMapMovie;
    return {
      id: raw.id,
      title: raw.title,
      mediaType: 'movie',
      posterUrl: raw.poster_path ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}` : null,
      backdropUrl: raw.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${raw.backdrop_path}` : null,
      overview: raw.overview || null,
      releaseDate: raw.release_date || null,
      voteAverage: raw.vote_average || null,
      voteCount: raw.vote_count || 0,
      genres: (raw.genre_ids || [])
        .map(id => genreMap?.get(id))
        .filter((g): g is string => !!g),
      cast: [],
      directors: [],
      runtime: null,
      popularity: raw.popularity || 0,
    };
  }

  private mapRawTVToItem(raw: TMDBRawTV): TMDBUpcomingItem {
    const genreMap = this.genreMapTV;
    return {
      id: raw.id,
      title: raw.name,
      mediaType: 'tv',
      posterUrl: raw.poster_path ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}` : null,
      backdropUrl: raw.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${raw.backdrop_path}` : null,
      overview: raw.overview || null,
      releaseDate: raw.first_air_date || null,
      voteAverage: raw.vote_average || null,
      voteCount: raw.vote_count || 0,
      genres: (raw.genre_ids || [])
        .map(id => genreMap?.get(id))
        .filter((g): g is string => !!g),
      cast: [],
      directors: [],
      runtime: null,
      popularity: raw.popularity || 0,
    };
  }

  private mapRawResults(
    results: (TMDBRawMovie | TMDBRawTV)[],
    mediaType: 'movie' | 'tv',
  ): TMDBUpcomingItem[] {
    if (mediaType === 'movie') {
      return results.map(raw => this.mapRawMovieToItem(raw as TMDBRawMovie));
    }
    return results.map(raw => this.mapRawTVToItem(raw as TMDBRawTV));
  }

  // --------------------------------------------------------------------------
  // Private: Fetching and enrichment
  // --------------------------------------------------------------------------

  private async fetchUrl<T>(url: string, cacheKey: string): Promise<T | null> {
    const cached = await this.cache.get<T>('list', cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[TMDB] Failed to fetch ${cacheKey}: ${response.status}`);
        return null;
      }

      const data = await response.json() as T;
      await this.cache.set('list', cacheKey, data, CACHE_TTL.LIST);
      return data;
    } catch (error) {
      console.error(`[TMDB] Error fetching ${cacheKey}:`, error);
      return null;
    }
  }

  private async enrichWithCredits(
    items: TMDBUpcomingItem[],
    mediaType: 'movie' | 'tv',
  ): Promise<TMDBUpcomingItem[]> {
    const enrichPromises = items.map(async (item) => {
      try {
        const [credits, details] = await Promise.all([
          this.fetchCredits(item.id, mediaType),
          this.fetchDetails(item.id, mediaType),
        ]);

        return {
          ...item,
          cast: credits.cast,
          directors: credits.directors,
          runtime: details.runtime,
          genres: details.genres.length > 0 ? details.genres : item.genres,
        };
      } catch {
        return item;
      }
    });

    const results = await Promise.allSettled(enrichPromises);
    return results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : items[i]
    );
  }

  private async fetchCredits(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
  ): Promise<{ cast: string[]; directors: string[] }> {
    const cacheKey = `${mediaType}:${tmdbId}`;
    const cached = await this.cache.get<{ cast: string[]; directors: string[] }>('credits', cacheKey);
    if (cached) return cached;

    try {
      const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/credits?api_key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return { cast: [], directors: [] };
      }

      const data = await response.json() as TMDBCreditsResponse;

      const cast = (data.cast || [])
        .sort((a, b) => a.order - b.order)
        .slice(0, 5)
        .map(c => c.name);

      const directors = (data.crew || [])
        .filter(c => c.job === 'Director')
        .map(c => c.name);

      const result = { cast, directors };
      await this.cache.set('credits', cacheKey, result, CACHE_TTL.DETAIL);
      return result;
    } catch {
      return { cast: [], directors: [] };
    }
  }

  private async fetchDetails(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
  ): Promise<{ runtime: number | null; genres: string[] }> {
    const cacheKey = `detail:${mediaType}:${tmdbId}`;
    const cached = await this.cache.get<{ runtime: number | null; genres: string[] }>('detail', cacheKey);
    if (cached) return cached;

    try {
      const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return { runtime: null, genres: [] };
      }

      if (mediaType === 'movie') {
        const data = await response.json() as TMDBMovieDetail;
        const result = {
          runtime: data.runtime,
          genres: (data.genres || []).map(g => g.name),
        };
        await this.cache.set('detail', cacheKey, result, CACHE_TTL.DETAIL);
        return result;
      } else {
        const data = await response.json() as TMDBTVDetail;
        const runtime = data.episode_run_time?.length > 0
          ? data.episode_run_time[0]
          : null;
        const directors = (data.created_by || []).map(c => c.name);
        const result = {
          runtime,
          genres: (data.genres || []).map(g => g.name),
          creators: directors,
        };
        await this.cache.set('detail', cacheKey, result, CACHE_TTL.DETAIL);
        return result;
      }
    } catch {
      return { runtime: null, genres: [] };
    }
  }

  private async ensureGenreMaps(): Promise<void> {
    if (this.genreMapMovie && this.genreMapTV) return;

    const [movieGenres, tvGenres] = await Promise.all([
      this.fetchGenres('movie'),
      this.fetchGenres('tv'),
    ]);

    this.genreMapMovie = movieGenres;
    this.genreMapTV = tvGenres;
  }

  private async fetchGenres(type: 'movie' | 'tv'): Promise<Map<number, string>> {
    const cacheKey = `genres:${type}`;
    const cached = await this.cache.get<{ id: number; name: string }[]>('detail', cacheKey);
    if (cached) {
      return new Map(cached.map(g => [g.id, g.name]));
    }

    try {
      const url = `${TMDB_BASE_URL}/genre/${type}/list?api_key=${this.apiKey}&language=en-US`;
      const response = await fetch(url);

      if (!response.ok) {
        return new Map();
      }

      const data = await response.json() as { genres: TMDBGenre[] };
      await this.cache.set('detail', cacheKey, data.genres, CACHE_TTL.DETAIL);
      return new Map(data.genres.map(g => [g.id, g.name]));
    } catch {
      return new Map();
    }
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let tmdbServiceInstance: TMDBService | null = null;

export function getTMDBService(): TMDBService {
  if (!tmdbServiceInstance) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB_API_KEY environment variable is required');
    }
    tmdbServiceInstance = new TMDBService(apiKey, getTMDBCache());
  }
  return tmdbServiceInstance;
}
