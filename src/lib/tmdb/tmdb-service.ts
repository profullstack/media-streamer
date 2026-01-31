/**
 * TMDB Service
 *
 * Uses /discover/movie and /discover/tv endpoints with server-side
 * date filtering (last 30 days → 6 months ahead) sorted by release
 * date descending. Enriches with credits (cast, directors).
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

  /**
   * Fetch upcoming movies via /discover/movie
   * Date window: 30 days ago → 6 months from now, sorted newest first
   */
  async getUpcomingMovies(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `movies:v2:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchDiscover('movie', page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch upcoming TV series via /discover/tv
   * Date window: 30 days ago → 6 months from now, sorted newest first
   */
  async getUpcomingTVSeries(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `tv:v2:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchDiscover('tv', page);

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch from /discover endpoint with server-side date range and sort
   */
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

    // Build discover URL with date range + sort
    const dateParams = mediaType === 'movie'
      ? `primary_release_date.gte=${dateFromStr}&primary_release_date.lte=${dateToStr}&sort_by=primary_release_date.desc`
      : `first_air_date.gte=${dateFromStr}&first_air_date.lte=${dateToStr}&sort_by=first_air_date.desc`;

    const discoverUrl = `${TMDB_BASE_URL}/discover/${mediaType}`
      + `?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`
      + `&${dateParams}&include_adult=false&with_original_language=en`;

    const data = await this.fetchUrl<TMDBDiscoverResponse>(discoverUrl, `discover:${mediaType}:${page}`);

    if (!data) {
      return { items: [], page, totalPages: 0, totalResults: 0 };
    }

    // Map to our format
    const genreMap = mediaType === 'movie' ? this.genreMapMovie : this.genreMapTV;
    const items: TMDBUpcomingItem[] = data.results.map(raw => {
      const isMovie = mediaType === 'movie';
      const movieRaw = raw as TMDBRawMovie;
      const tvRaw = raw as TMDBRawTV;

      return {
        id: raw.id,
        title: isMovie ? movieRaw.title : tvRaw.name,
        mediaType,
        posterUrl: raw.poster_path ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}` : null,
        backdropUrl: raw.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${raw.backdrop_path}` : null,
        overview: raw.overview || null,
        releaseDate: isMovie ? movieRaw.release_date : tvRaw.first_air_date,
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
    });

    // Enrich with credits
    const enriched = await this.enrichWithCredits(items, mediaType);

    return {
      items: enriched,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  /**
   * Generic URL fetcher with cache
   */
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

  /**
   * Enrich items with credits (cast + directors)
   */
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

  /**
   * Fetch credits for a single item
   */
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

  /**
   * Fetch details for a single item (runtime, genres)
   */
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

  /**
   * Ensure genre maps are loaded
   */
  private async ensureGenreMaps(): Promise<void> {
    if (this.genreMapMovie && this.genreMapTV) return;

    const [movieGenres, tvGenres] = await Promise.all([
      this.fetchGenres('movie'),
      this.fetchGenres('tv'),
    ]);

    this.genreMapMovie = movieGenres;
    this.genreMapTV = tvGenres;
  }

  /**
   * Fetch genre list from TMDB
   */
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
