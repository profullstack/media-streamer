/**
 * TMDB Service
 *
 * Fetches upcoming/now-playing movies and on-the-air/airing-today TV
 * from TMDB API v3. Enriches with credits (cast, directors).
 * All responses are cached via TMDBCache.
 */

import { TMDBCache, CACHE_TTL, getTMDBCache } from './tmdb-cache';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const ITEMS_PER_PAGE = 50;

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

interface TMDBListApiResponse {
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
   * Fetch upcoming movies (combines upcoming + now_playing)
   */
  async getUpcomingMovies(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `movies:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchMergedList(
      '/movie/upcoming',
      '/movie/now_playing',
      'movie',
      page,
    );

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch upcoming TV series (combines on_the_air + airing_today)
   */
  async getUpcomingTVSeries(page: number = 1): Promise<TMDBListResponse> {
    const cacheKey = `tv:page:${page}`;
    const cached = await this.cache.get<TMDBListResponse>('response', cacheKey);
    if (cached) return cached;

    const result = await this.fetchMergedList(
      '/tv/on_the_air',
      '/tv/airing_today',
      'tv',
      page,
    );

    await this.cache.set('response', cacheKey, result, CACHE_TTL.RESPONSE);
    return result;
  }

  /**
   * Fetch and merge two TMDB list endpoints, deduplicate by ID
   */
  private async fetchMergedList(
    endpoint1: string,
    endpoint2: string,
    mediaType: 'movie' | 'tv',
    page: number,
  ): Promise<TMDBListResponse> {
    // Ensure genre maps are loaded
    await this.ensureGenreMaps();

    // We need enough items to fill our page. TMDB returns 20 per page.
    // For 50 items per page, we need ~3 TMDB pages from each endpoint.
    const tmdbPagesNeeded = Math.ceil(ITEMS_PER_PAGE / 20) + 1; // 4 pages
    const startTmdbPage = (page - 1) * tmdbPagesNeeded + 1;

    // Fetch from both endpoints in parallel
    const fetchPromises: Promise<TMDBListApiResponse | null>[] = [];
    for (let i = 0; i < tmdbPagesNeeded; i++) {
      const tmdbPage = startTmdbPage + i;
      fetchPromises.push(this.fetchTMDBList(endpoint1, tmdbPage));
      fetchPromises.push(this.fetchTMDBList(endpoint2, tmdbPage));
    }

    const responses = await Promise.allSettled(fetchPromises);
    const allItems: (TMDBRawMovie | TMDBRawTV)[] = [];
    let maxTotalResults = 0;

    for (const response of responses) {
      if (response.status === 'fulfilled' && response.value) {
        allItems.push(...response.value.results);
        maxTotalResults = Math.max(maxTotalResults, response.value.total_results);
      }
    }

    // Deduplicate by ID
    const seen = new Set<number>();
    const uniqueItems: (TMDBRawMovie | TMDBRawTV)[] = [];
    for (const item of allItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        uniqueItems.push(item);
      }
    }

    // Sort by release date (ascending - soonest first)
    uniqueItems.sort((a, b) => {
      const dateA = mediaType === 'movie'
        ? (a as TMDBRawMovie).release_date
        : (a as TMDBRawTV).first_air_date;
      const dateB = mediaType === 'movie'
        ? (b as TMDBRawMovie).release_date
        : (b as TMDBRawTV).first_air_date;
      return (dateA || '').localeCompare(dateB || '');
    });

    // Take items for current page
    const pageItems = uniqueItems.slice(0, ITEMS_PER_PAGE);

    // Map to our format
    const genreMap = mediaType === 'movie' ? this.genreMapMovie : this.genreMapTV;
    const items: TMDBUpcomingItem[] = pageItems.map(raw => {
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

    const totalPages = Math.ceil(maxTotalResults / ITEMS_PER_PAGE);

    return {
      items: enriched,
      page,
      totalPages,
      totalResults: maxTotalResults,
    };
  }

  /**
   * Fetch a single TMDB list endpoint
   */
  private async fetchTMDBList(endpoint: string, page: number): Promise<TMDBListApiResponse | null> {
    const cacheKey = `${endpoint}:${page}`;
    const cached = await this.cache.get<TMDBListApiResponse>('list', cacheKey);
    if (cached) return cached;

    try {
      const url = `${TMDB_BASE_URL}${endpoint}?api_key=${this.apiKey}&language=en-US&page=${page}&region=US`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[TMDB] Failed to fetch ${endpoint} page ${page}: ${response.status}`);
        return null;
      }

      const data = await response.json() as TMDBListApiResponse;
      await this.cache.set('list', cacheKey, data, CACHE_TTL.LIST);
      return data;
    } catch (error) {
      console.error(`[TMDB] Error fetching ${endpoint}:`, error);
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
