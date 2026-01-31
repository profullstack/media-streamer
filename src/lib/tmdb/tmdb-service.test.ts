/**
 * TMDB Service Tests
 *
 * Tests for TMDB API client: /discover endpoints with date-range
 * filtering, credit enrichment, genre resolution, and caching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TMDBService, type TMDBListResponse } from './tmdb-service';
import type { TMDBCache } from './tmdb-cache';

// Mock cache
function createMockCache(): TMDBCache {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as TMDBCache;
}

// TMDB API response factories
function createDiscoverMovieResponse(movies: Array<{ id: number; title: string; release_date?: string }>) {
  return {
    page: 1,
    total_pages: 1,
    total_results: movies.length,
    results: movies.map((m) => ({
      id: m.id,
      title: m.title,
      overview: 'Test overview',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      release_date: m.release_date ?? '2026-03-15',
      vote_average: 7.5,
      vote_count: 100,
      genre_ids: [28, 12],
      popularity: 50,
    })),
  };
}

function createDiscoverTVResponse(shows: Array<{ id: number; name: string; first_air_date?: string }>) {
  return {
    page: 1,
    total_pages: 1,
    total_results: shows.length,
    results: shows.map((s) => ({
      id: s.id,
      name: s.name,
      overview: 'Test TV overview',
      poster_path: '/tv-poster.jpg',
      backdrop_path: '/tv-backdrop.jpg',
      first_air_date: s.first_air_date ?? '2026-04-01',
      vote_average: 8.0,
      vote_count: 200,
      genre_ids: [18, 10765],
      popularity: 75,
    })),
  };
}

function createCreditsResponse(cast: string[] = [], directors: string[] = []) {
  return {
    cast: cast.map((name, i) => ({ name, character: `Character ${i}`, order: i })),
    crew: directors.map((name) => ({ name, job: 'Director' })),
  };
}

function createMovieDetailResponse(runtime: number | null = 120) {
  return {
    runtime,
    genres: [
      { id: 28, name: 'Action' },
      { id: 12, name: 'Adventure' },
    ],
  };
}

function createTVDetailResponse(episodeRuntime: number[] = [45]) {
  return {
    episode_run_time: episodeRuntime,
    genres: [
      { id: 18, name: 'Drama' },
      { id: 10765, name: 'Sci-Fi & Fantasy' },
    ],
    created_by: [{ name: 'Creator Name' }],
  };
}

function createGenresResponse(type: 'movie' | 'tv') {
  if (type === 'movie') {
    return {
      genres: [
        { id: 28, name: 'Action' },
        { id: 12, name: 'Adventure' },
        { id: 35, name: 'Comedy' },
      ],
    };
  }
  return {
    genres: [
      { id: 18, name: 'Drama' },
      { id: 10765, name: 'Sci-Fi & Fantasy' },
      { id: 10759, name: 'Action & Adventure' },
    ],
  };
}

describe('TMDBService', () => {
  let service: TMDBService;
  let mockCache: TMDBCache;
  const apiKey = 'test-api-key';
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCache = createMockCache();
    service = new TMDBService(apiKey, mockCache);
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchResponse(data: unknown, ok = true, status = 200) {
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(data),
    } as Response);
  }

  describe('getUpcomingMovies', () => {
    it('returns upcoming movies with credits via /discover', async () => {
      const discoverResponse = createDiscoverMovieResponse([
        { id: 1, title: 'Movie A', release_date: '2026-03-01' },
        { id: 2, title: 'Movie B', release_date: '2026-04-01' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);

        if (urlStr.includes('/genre/movie/list')) {
          return mockFetchResponse(createGenresResponse('movie'));
        }
        if (urlStr.includes('/genre/tv/list')) {
          return mockFetchResponse(createGenresResponse('tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['Actor A', 'Actor B'], ['Director X']));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(120));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Movie A');
      expect(result.items[0].mediaType).toBe('movie');
      expect(result.items[0].cast).toContain('Actor A');
      expect(result.items[0].directors).toContain('Director X');
      expect(result.items[0].runtime).toBe(120);
      expect(result.page).toBe(1);
    });

    it('uses discover endpoint with date range and sort params', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          // Verify the URL has the right params
          expect(urlStr).toContain('primary_release_date.gte=');
          expect(urlStr).toContain('primary_release_date.lte=');
          expect(urlStr).toContain('sort_by=primary_release_date.asc');
          expect(urlStr).toContain('with_original_language=en');
          return mockFetchResponse(createDiscoverMovieResponse([]));
        }
        return mockFetchResponse({}, false, 404);
      });

      await service.getUpcomingMovies(1);
    });

    it('returns cached result when available', async () => {
      const cachedResult: TMDBListResponse = {
        items: [
          {
            id: 1,
            title: 'Cached Movie',
            mediaType: 'movie',
            posterUrl: null,
            backdropUrl: null,
            overview: null,
            releaseDate: '2026-03-01',
            voteAverage: 7.0,
            voteCount: 50,
            genres: [],
            cast: [],
            directors: [],
            runtime: null,
            popularity: 30,
          },
        ],
        page: 1,
        totalPages: 1,
        totalResults: 1,
      };

      (mockCache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      const result = await service.getUpcomingMovies(1);

      expect(result).toEqual(cachedResult);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        return mockFetchResponse({ status_message: 'Not found' }, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('passes pagination through to TMDB', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          expect(urlStr).toContain('page=3');
          return mockFetchResponse({
            ...createDiscoverMovieResponse([]),
            page: 3,
            total_pages: 10,
            total_results: 200,
          });
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(3);

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(10);
    });
  });

  describe('getUpcomingTVSeries', () => {
    it('returns upcoming TV series with credits via /discover', async () => {
      const discoverResponse = createDiscoverTVResponse([
        { id: 10, name: 'Show A', first_air_date: '2026-03-01' },
        { id: 20, name: 'Show B', first_air_date: '2026-04-01' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/movie/list')) {
          return mockFetchResponse(createGenresResponse('movie'));
        }
        if (urlStr.includes('/genre/tv/list')) {
          return mockFetchResponse(createGenresResponse('tv'));
        }
        if (urlStr.includes('/discover/tv')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['TV Actor'], []));
        }
        if (urlStr.match(/\/tv\/\d+\?/)) {
          return mockFetchResponse(createTVDetailResponse([45]));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingTVSeries(1);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Show A');
      expect(result.items[0].mediaType).toBe('tv');
      expect(result.items[0].cast).toContain('TV Actor');
      expect(result.items[0].runtime).toBe(45);
    });

    it('uses discover endpoint with TV date range params', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/tv')) {
          expect(urlStr).toContain('first_air_date.gte=');
          expect(urlStr).toContain('first_air_date.lte=');
          expect(urlStr).toContain('sort_by=first_air_date.asc');
          return mockFetchResponse(createDiscoverTVResponse([]));
        }
        return mockFetchResponse({}, false, 404);
      });

      await service.getUpcomingTVSeries(1);
    });

    it('returns cached result when available', async () => {
      const cachedResult: TMDBListResponse = {
        items: [
          {
            id: 10,
            title: 'Cached Show',
            mediaType: 'tv',
            posterUrl: null,
            backdropUrl: null,
            overview: null,
            releaseDate: '2026-05-01',
            voteAverage: 8.0,
            voteCount: 100,
            genres: [],
            cast: [],
            directors: [],
            runtime: null,
            popularity: 60,
          },
        ],
        page: 1,
        totalPages: 1,
        totalResults: 1,
      };

      (mockCache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      const result = await service.getUpcomingTVSeries(1);

      expect(result).toEqual(cachedResult);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('credit enrichment', () => {
    it('limits cast to top 5 by order', async () => {
      const discoverResponse = createDiscoverMovieResponse([
        { id: 1, title: 'Big Cast Movie' },
      ]);

      const bigCast = Array.from({ length: 10 }, (_, i) => `Actor ${i + 1}`);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(bigCast, ['Director']));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(150));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items[0].cast).toHaveLength(5);
      expect(result.items[0].cast[0]).toBe('Actor 1');
      expect(result.items[0].cast[4]).toBe('Actor 5');
    });

    it('handles credit fetch failures gracefully', async () => {
      const discoverResponse = createDiscoverMovieResponse([
        { id: 1, title: 'No Credits Movie' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        // Credits and details fail
        return mockFetchResponse({}, false, 500);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].cast).toEqual([]);
      expect(result.items[0].directors).toEqual([]);
    });
  });

  describe('genre resolution', () => {
    it('maps genre IDs to names from detail endpoint', async () => {
      const discoverResponse = createDiscoverMovieResponse([
        { id: 1, title: 'Genre Movie' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/movie/list')) {
          return mockFetchResponse(createGenresResponse('movie'));
        }
        if (urlStr.includes('/genre/tv/list')) {
          return mockFetchResponse(createGenresResponse('tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse([], []));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(100));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items[0].genres).toContain('Action');
      expect(result.items[0].genres).toContain('Adventure');
    });
  });

  describe('image URLs', () => {
    it('constructs poster and backdrop URLs from TMDB paths', async () => {
      const discoverResponse = createDiscoverMovieResponse([
        { id: 1, title: 'Image Movie' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse([], []));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(90));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items[0].posterUrl).toContain('image.tmdb.org');
      expect(result.items[0].posterUrl).toContain('/w500');
      expect(result.items[0].backdropUrl).toContain('/w1280');
    });
  });

  describe('getRecentMovies', () => {
    it('merges now_playing and discover results, deduplicates by ID', async () => {
      const nowPlayingResponse = createDiscoverMovieResponse([
        { id: 1, title: 'NP Movie A', release_date: '2026-01-20' },
        { id: 2, title: 'NP Movie B', release_date: '2026-01-15' },
      ]);
      const discoverResponse = createDiscoverMovieResponse([
        { id: 2, title: 'Discover Movie B', release_date: '2026-01-15' },
        { id: 3, title: 'Discover Movie C', release_date: '2026-01-25' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/movie/now_playing')) {
          return mockFetchResponse(nowPlayingResponse);
        }
        if (urlStr.includes('/discover/movie')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['Actor'], ['Director']));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(120));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getRecentMovies(1);

      // Should have 3 unique items (id 2 deduplicated)
      expect(result.items).toHaveLength(3);
      // Should be sorted by release_date descending
      expect(result.items[0].title).toBe('Discover Movie C'); // 2026-01-25
      expect(result.items[1].title).toBe('NP Movie A');        // 2026-01-20
      expect(result.items[2].title).toBe('NP Movie B');        // 2026-01-15 (first-seen wins)
    });

    it('returns cached result when available', async () => {
      const cachedResult: TMDBListResponse = {
        items: [
          {
            id: 1, title: 'Cached Recent', mediaType: 'movie',
            posterUrl: null, backdropUrl: null, overview: null,
            releaseDate: '2026-01-20', voteAverage: 7.0, voteCount: 50,
            genres: [], cast: [], directors: [], runtime: null, popularity: 30,
          },
        ],
        page: 1, totalPages: 1, totalResults: 1,
      };
      (mockCache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      const result = await service.getRecentMovies(1);

      expect(result).toEqual(cachedResult);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        return mockFetchResponse({}, false, 500);
      });

      const result = await service.getRecentMovies(1);

      expect(result.items).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('uses discover with date range and desc sort for recent', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/movie')) {
          expect(urlStr).toContain('primary_release_date.gte=');
          expect(urlStr).toContain('primary_release_date.lte=');
          expect(urlStr).toContain('sort_by=primary_release_date.desc');
          return mockFetchResponse(createDiscoverMovieResponse([]));
        }
        if (urlStr.includes('/movie/now_playing')) {
          return mockFetchResponse(createDiscoverMovieResponse([]));
        }
        return mockFetchResponse({}, false, 404);
      });

      await service.getRecentMovies(1);
    });
  });

  describe('getRecentTVSeries', () => {
    it('merges on_the_air, airing_today, and discover results', async () => {
      const onTheAirResponse = createDiscoverTVResponse([
        { id: 10, name: 'On Air Show', first_air_date: '2026-01-20' },
      ]);
      const airingTodayResponse = createDiscoverTVResponse([
        { id: 20, name: 'Airing Today', first_air_date: '2026-01-30' },
        { id: 10, name: 'On Air Show Dup', first_air_date: '2026-01-20' },
      ]);
      const discoverResponse = createDiscoverTVResponse([
        { id: 30, name: 'Discover Show', first_air_date: '2026-01-25' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/tv/on_the_air')) {
          return mockFetchResponse(onTheAirResponse);
        }
        if (urlStr.includes('/tv/airing_today')) {
          return mockFetchResponse(airingTodayResponse);
        }
        if (urlStr.includes('/discover/tv')) {
          return mockFetchResponse(discoverResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['TV Actor'], []));
        }
        if (urlStr.match(/\/tv\/\d+\?/)) {
          return mockFetchResponse(createTVDetailResponse([45]));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getRecentTVSeries(1);

      // 3 unique shows (id 10 deduplicated)
      expect(result.items).toHaveLength(3);
      // Sorted by first_air_date descending
      expect(result.items[0].title).toBe('Airing Today');   // 2026-01-30
      expect(result.items[1].title).toBe('Discover Show');   // 2026-01-25
      expect(result.items[2].title).toBe('On Air Show');     // 2026-01-20
    });

    it('returns cached result when available', async () => {
      const cachedResult: TMDBListResponse = {
        items: [
          {
            id: 10, title: 'Cached TV', mediaType: 'tv',
            posterUrl: null, backdropUrl: null, overview: null,
            releaseDate: '2026-01-20', voteAverage: 8.0, voteCount: 100,
            genres: [], cast: [], directors: [], runtime: null, popularity: 60,
          },
        ],
        page: 1, totalPages: 1, totalResults: 1,
      };
      (mockCache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      const result = await service.getRecentTVSeries(1);

      expect(result).toEqual(cachedResult);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('uses discover with TV date range params for recent', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/discover/tv')) {
          expect(urlStr).toContain('first_air_date.gte=');
          expect(urlStr).toContain('first_air_date.lte=');
          expect(urlStr).toContain('sort_by=first_air_date.desc');
          return mockFetchResponse(createDiscoverTVResponse([]));
        }
        if (urlStr.includes('/tv/on_the_air') || urlStr.includes('/tv/airing_today')) {
          return mockFetchResponse(createDiscoverTVResponse([]));
        }
        return mockFetchResponse({}, false, 404);
      });

      await service.getRecentTVSeries(1);
    });
  });

  describe('searchMulti', () => {
    function createSearchMultiResponse(
      results: Array<{
        id: number;
        media_type: 'movie' | 'tv' | 'person';
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
      }>,
    ) {
      return {
        page: 1,
        total_pages: 1,
        total_results: results.length,
        results: results.map((r) => ({
          id: r.id,
          media_type: r.media_type,
          title: r.title,
          name: r.name,
          overview: 'Search result overview',
          poster_path: '/search-poster.jpg',
          backdrop_path: '/search-backdrop.jpg',
          release_date: r.release_date,
          first_air_date: r.first_air_date,
          vote_average: 7.0,
          vote_count: 100,
          genre_ids: [28],
          popularity: 50,
        })),
      };
    }

    it('searches and returns movies and TV results with credits', async () => {
      const searchResponse = createSearchMultiResponse([
        { id: 1, media_type: 'movie', title: 'Batman Begins', release_date: '2005-06-15' },
        { id: 10, media_type: 'tv', name: 'Batman: TAS', first_air_date: '1992-09-05' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/search/multi')) {
          expect(urlStr).toContain('query=batman');
          return mockFetchResponse(searchResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['Actor'], ['Director']));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(140));
        }
        if (urlStr.match(/\/tv\/\d+\?/)) {
          return mockFetchResponse(createTVDetailResponse([22]));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.searchMulti('batman', 1);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Batman Begins');
      expect(result.items[0].mediaType).toBe('movie');
      expect(result.items[0].cast).toContain('Actor');
      expect(result.items[1].title).toBe('Batman: TAS');
      expect(result.items[1].mediaType).toBe('tv');
    });

    it('filters out person results', async () => {
      const searchResponse = createSearchMultiResponse([
        { id: 1, media_type: 'movie', title: 'Batman Begins', release_date: '2005-06-15' },
        { id: 999, media_type: 'person', name: 'Christian Bale' },
        { id: 10, media_type: 'tv', name: 'Batman: TAS', first_air_date: '1992-09-05' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/search/multi')) {
          return mockFetchResponse(searchResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse([], []));
        }
        if (urlStr.match(/\/(movie|tv)\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(120));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.searchMulti('batman', 1);

      // Person filtered out
      expect(result.items).toHaveLength(2);
      expect(result.items.every(i => i.mediaType !== 'person' as string)).toBe(true);
    });

    it('returns cached result when available', async () => {
      const cachedResult: TMDBListResponse = {
        items: [
          {
            id: 1, title: 'Cached Search', mediaType: 'movie',
            posterUrl: null, backdropUrl: null, overview: null,
            releaseDate: '2005-06-15', voteAverage: 8.0, voteCount: 200,
            genres: [], cast: [], directors: [], runtime: null, popularity: 80,
          },
        ],
        page: 1, totalPages: 1, totalResults: 1,
      };
      (mockCache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResult);

      const result = await service.searchMulti('batman', 1);

      expect(result).toEqual(cachedResult);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns empty results on API error', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        return mockFetchResponse({}, false, 500);
      });

      const result = await service.searchMulti('batman', 1);

      expect(result.items).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('preserves original order after enrichment', async () => {
      const searchResponse = createSearchMultiResponse([
        { id: 1, media_type: 'movie', title: 'First Movie', release_date: '2020-01-01' },
        { id: 10, media_type: 'tv', name: 'Second Show', first_air_date: '2019-01-01' },
        { id: 2, media_type: 'movie', title: 'Third Movie', release_date: '2021-01-01' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/search/multi')) {
          return mockFetchResponse(searchResponse);
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(['Actor'], []));
        }
        if (urlStr.match(/\/(movie|tv)\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(100));
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.searchMulti('test', 1);

      expect(result.items[0].title).toBe('First Movie');
      expect(result.items[1].title).toBe('Second Show');
      expect(result.items[2].title).toBe('Third Movie');
    });
  });
});
