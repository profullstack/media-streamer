/**
 * TMDB Service Tests
 *
 * Tests for TMDB API client: fetching upcoming movies/TV, merging
 * endpoints, deduplication, credit enrichment, and caching.
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
function createMovieListResponse(movies: Array<{ id: number; title: string; release_date?: string }>) {
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

function createTVListResponse(shows: Array<{ id: number; name: string; first_air_date?: string }>) {
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

  // Helper to create a mock Response
  function mockFetchResponse(data: unknown, ok = true, status = 200) {
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(data),
    } as Response);
  }

  describe('getUpcomingMovies', () => {
    it('returns upcoming movies with credits', async () => {
      const movieList = createMovieListResponse([
        { id: 1, title: 'Movie A', release_date: '2026-03-01' },
        { id: 2, title: 'Movie B', release_date: '2026-04-01' },
      ]);

      // Setup fetch responses in order:
      // 1-2. Genre lists (movie + tv)
      // 3+. List endpoints (upcoming pages + now_playing pages)
      // Then credits and details for each movie
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);

        if (urlStr.includes('/genre/movie/list')) {
          return mockFetchResponse(createGenresResponse('movie'));
        }
        if (urlStr.includes('/genre/tv/list')) {
          return mockFetchResponse(createGenresResponse('tv'));
        }
        if (urlStr.includes('/movie/upcoming') || urlStr.includes('/movie/now_playing')) {
          return mockFetchResponse(movieList);
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

    it('deduplicates movies from overlapping endpoints', async () => {
      // Same movie appears in both upcoming and now_playing
      const list = createMovieListResponse([
        { id: 1, title: 'Same Movie', release_date: '2026-03-15' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/movie/')) {
          if (urlStr.includes('/credits')) {
            return mockFetchResponse(createCreditsResponse([], []));
          }
          if (urlStr.match(/\/movie\/\d+\?/)) {
            return mockFetchResponse(createMovieDetailResponse(90));
          }
          return mockFetchResponse(list);
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      // Should only have 1 item despite appearing in both endpoints
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(1);
    });

    it('handles API errors gracefully', async () => {
      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        // All list endpoints fail
        return mockFetchResponse({ status_message: 'Not found' }, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items).toHaveLength(0);
    });
  });

  describe('getUpcomingTVSeries', () => {
    it('returns upcoming TV series with credits', async () => {
      const tvList = createTVListResponse([
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
        if (urlStr.includes('/tv/on_the_air') || urlStr.includes('/tv/airing_today')) {
          return mockFetchResponse(tvList);
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
      const movieList = createMovieListResponse([
        { id: 1, title: 'Big Cast Movie' },
      ]);

      const bigCast = Array.from({ length: 10 }, (_, i) => `Actor ${i + 1}`);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse(bigCast, ['Director']));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(150));
        }
        if (urlStr.includes('/movie/')) {
          return mockFetchResponse(movieList);
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items[0].cast).toHaveLength(5);
      expect(result.items[0].cast[0]).toBe('Actor 1');
      expect(result.items[0].cast[4]).toBe('Actor 5');
    });

    it('handles credit fetch failures gracefully', async () => {
      const movieList = createMovieListResponse([
        { id: 1, title: 'No Credits Movie' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/movie/upcoming') || urlStr.includes('/movie/now_playing')) {
          return mockFetchResponse(movieList);
        }
        // Credits and details fail
        return mockFetchResponse({}, false, 500);
      });

      const result = await service.getUpcomingMovies(1);

      // Should still return the movie, just without credits
      expect(result.items).toHaveLength(1);
      expect(result.items[0].cast).toEqual([]);
      expect(result.items[0].directors).toEqual([]);
    });
  });

  describe('genre resolution', () => {
    it('maps genre IDs to names', async () => {
      const movieList = createMovieListResponse([
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
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse([], []));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          // Return details with genre names
          return mockFetchResponse(createMovieDetailResponse(100));
        }
        if (urlStr.includes('/movie/')) {
          return mockFetchResponse(movieList);
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      // Genre names from detail endpoint override genre_ids
      expect(result.items[0].genres).toContain('Action');
      expect(result.items[0].genres).toContain('Adventure');
    });
  });

  describe('image URLs', () => {
    it('constructs poster and backdrop URLs from TMDB paths', async () => {
      const movieList = createMovieListResponse([
        { id: 1, title: 'Image Movie' },
      ]);

      fetchSpy.mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/genre/')) {
          return mockFetchResponse(createGenresResponse(urlStr.includes('movie') ? 'movie' : 'tv'));
        }
        if (urlStr.includes('/credits')) {
          return mockFetchResponse(createCreditsResponse([], []));
        }
        if (urlStr.match(/\/movie\/\d+\?/)) {
          return mockFetchResponse(createMovieDetailResponse(90));
        }
        if (urlStr.includes('/movie/')) {
          return mockFetchResponse(movieList);
        }
        return mockFetchResponse({}, false, 404);
      });

      const result = await service.getUpcomingMovies(1);

      expect(result.items[0].posterUrl).toContain('image.tmdb.org');
      expect(result.items[0].posterUrl).toContain('/w500');
      expect(result.items[0].backdropUrl).toContain('/w1280');
    });
  });
});
