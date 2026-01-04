/**
 * TheTVDB Client Tests
 *
 * Tests for TheTVDB API v4 integration for trending/popular content
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTheTVDBAuthUrl,
  buildTheTVDBSeriesUrl,
  buildTheTVDBMoviesUrl,
  buildTheTVDBSeriesExtendedUrl,
  buildTheTVDBMovieExtendedUrl,
  buildTheTVDBImageUrl,
  parseTheTVDBSeriesResponse,
  parseTheTVDBMoviesResponse,
  parseTheTVDBSeriesExtendedResponse,
  parseTheTVDBMovieExtendedResponse,
  fetchTheTVDBToken,
  fetchTrendingTVShows,
  fetchTrendingMovies,
  fetchTVShowDetails,
  fetchMovieDetails,
  clearTokenCache,
  type TheTVDBTrendingItem,
  type TheTVDBTrendingResult,
} from './thetvdb-client';

describe('TheTVDB Client', () => {
  describe('URL Builders', () => {
    describe('buildTheTVDBAuthUrl', () => {
      it('should build correct auth URL', () => {
        const url = buildTheTVDBAuthUrl();
        expect(url).toBe('https://api4.thetvdb.com/v4/login');
      });
    });

    describe('buildTheTVDBSeriesUrl', () => {
      it('should build correct series URL with default page', () => {
        const url = buildTheTVDBSeriesUrl();
        expect(url).toBe('https://api4.thetvdb.com/v4/series?page=0');
      });

      it('should build correct series URL with custom page', () => {
        const url = buildTheTVDBSeriesUrl(2);
        expect(url).toBe('https://api4.thetvdb.com/v4/series?page=2');
      });
    });

    describe('buildTheTVDBMoviesUrl', () => {
      it('should build correct movies URL with default page', () => {
        const url = buildTheTVDBMoviesUrl();
        expect(url).toBe('https://api4.thetvdb.com/v4/movies?page=0');
      });

      it('should build correct movies URL with custom page', () => {
        const url = buildTheTVDBMoviesUrl(3);
        expect(url).toBe('https://api4.thetvdb.com/v4/movies?page=3');
      });
    });

    describe('buildTheTVDBSeriesExtendedUrl', () => {
      it('should build correct series extended URL', () => {
        const url = buildTheTVDBSeriesExtendedUrl(12345);
        expect(url).toBe('https://api4.thetvdb.com/v4/series/12345/extended');
      });
    });

    describe('buildTheTVDBMovieExtendedUrl', () => {
      it('should build correct movie extended URL', () => {
        const url = buildTheTVDBMovieExtendedUrl(67890);
        expect(url).toBe('https://api4.thetvdb.com/v4/movies/67890/extended');
      });
    });

    describe('buildTheTVDBImageUrl', () => {
      it('should return full URL for absolute paths', () => {
        const url = buildTheTVDBImageUrl('https://artworks.thetvdb.com/banners/posters/123.jpg');
        expect(url).toBe('https://artworks.thetvdb.com/banners/posters/123.jpg');
      });

      it('should build full URL for relative paths', () => {
        const url = buildTheTVDBImageUrl('/banners/posters/123.jpg');
        expect(url).toBe('https://artworks.thetvdb.com/banners/posters/123.jpg');
      });

      it('should return undefined for undefined input', () => {
        const url = buildTheTVDBImageUrl(undefined);
        expect(url).toBeUndefined();
      });
    });
  });

  describe('Response Parsers', () => {
    describe('parseTheTVDBSeriesResponse', () => {
      it('should parse valid series response', () => {
        const response = {
          status: 'success',
          data: [
            {
              id: 12345,
              name: 'Breaking Bad',
              year: '2008',
              image: '/banners/posters/breaking-bad.jpg',
              overview: 'A high school chemistry teacher turned meth producer.',
              status: { name: 'Ended' },
              originalNetwork: { name: 'AMC' },
              averageRuntime: 47,
              genres: [{ name: 'Drama' }, { name: 'Crime' }],
            },
            {
              id: 67890,
              name: 'Game of Thrones',
              year: '2011',
              image: 'https://artworks.thetvdb.com/banners/posters/got.jpg',
              overview: 'Nine noble families fight for control.',
              status: { name: 'Ended' },
              originalNetwork: { name: 'HBO' },
              averageRuntime: 60,
              genres: [{ name: 'Fantasy' }],
            },
          ],
        };

        const result = parseTheTVDBSeriesResponse(response);

        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toEqual({
          id: 12345,
          title: 'Breaking Bad',
          year: 2008,
          posterUrl: 'https://artworks.thetvdb.com/banners/posters/breaking-bad.jpg',
          overview: 'A high school chemistry teacher turned meth producer.',
          mediaType: 'tv',
          status: 'Ended',
          network: 'AMC',
          runtime: 47,
          genres: ['Drama', 'Crime'],
        });
        expect(result.items[1].title).toBe('Game of Thrones');
        expect(result.items[1].posterUrl).toBe('https://artworks.thetvdb.com/banners/posters/got.jpg');
      });

      it('should handle empty response', () => {
        const response = { status: 'success', data: [] };
        const result = parseTheTVDBSeriesResponse(response);
        expect(result.items).toHaveLength(0);
      });

      it('should handle failed response', () => {
        const response = { status: 'failure', data: [] };
        const result = parseTheTVDBSeriesResponse(response);
        expect(result.items).toHaveLength(0);
      });

      it('should handle missing optional fields', () => {
        const response = {
          status: 'success',
          data: [
            {
              id: 11111,
              name: 'Test Show',
            },
          ],
        };

        const result = parseTheTVDBSeriesResponse(response);
        expect(result.items[0]).toEqual({
          id: 11111,
          title: 'Test Show',
          year: undefined,
          posterUrl: undefined,
          overview: undefined,
          mediaType: 'tv',
          status: undefined,
          network: undefined,
          runtime: undefined,
          genres: [],
        });
      });
    });

    describe('parseTheTVDBMoviesResponse', () => {
      it('should parse valid movies response', () => {
        const response = {
          status: 'success',
          data: [
            {
              id: 54321,
              name: 'The Dark Knight',
              year: '2008',
              image: '/banners/movies/dark-knight.jpg',
              overview: 'Batman faces the Joker.',
              runtime: 152,
              genres: [{ name: 'Action' }, { name: 'Drama' }],
            },
          ],
        };

        const result = parseTheTVDBMoviesResponse(response);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toEqual({
          id: 54321,
          title: 'The Dark Knight',
          year: 2008,
          posterUrl: 'https://artworks.thetvdb.com/banners/movies/dark-knight.jpg',
          overview: 'Batman faces the Joker.',
          mediaType: 'movie',
          runtime: 152,
          genres: ['Action', 'Drama'],
        });
      });

      it('should handle empty response', () => {
        const response = { status: 'success', data: [] };
        const result = parseTheTVDBMoviesResponse(response);
        expect(result.items).toHaveLength(0);
      });
    });

    describe('parseTheTVDBSeriesExtendedResponse', () => {
      it('should parse extended series response with cast and crew', () => {
        const response = {
          status: 'success',
          data: {
            id: 12345,
            name: 'Breaking Bad',
            year: '2008',
            image: '/banners/posters/bb.jpg',
            overview: 'A chemistry teacher becomes a meth producer.',
            status: { name: 'Ended' },
            originalNetwork: { name: 'AMC' },
            averageRuntime: 47,
            genres: [{ name: 'Drama' }],
            characters: [
              { name: 'Walter White', personName: 'Bryan Cranston', type: 3 },
              { name: 'Jesse Pinkman', personName: 'Aaron Paul', type: 3 },
              { personName: 'Vince Gilligan', type: 1 }, // Director
            ],
          },
        };

        const result = parseTheTVDBSeriesExtendedResponse(response);

        expect(result).toBeDefined();
        expect(result?.id).toBe(12345);
        expect(result?.title).toBe('Breaking Bad');
        expect(result?.cast).toEqual(['Bryan Cranston', 'Aaron Paul']);
        expect(result?.directors).toEqual(['Vince Gilligan']);
      });

      it('should return undefined for failed response', () => {
        const response = { status: 'failure', data: null };
        const result = parseTheTVDBSeriesExtendedResponse(response);
        expect(result).toBeUndefined();
      });
    });

    describe('parseTheTVDBMovieExtendedResponse', () => {
      it('should parse extended movie response', () => {
        const response = {
          status: 'success',
          data: {
            id: 54321,
            name: 'Inception',
            year: '2010',
            image: '/banners/movies/inception.jpg',
            overview: 'A thief who steals corporate secrets.',
            runtime: 148,
            genres: [{ name: 'Sci-Fi' }, { name: 'Action' }],
            characters: [
              { name: 'Cobb', personName: 'Leonardo DiCaprio', type: 3 },
              { personName: 'Christopher Nolan', type: 1 },
            ],
          },
        };

        const result = parseTheTVDBMovieExtendedResponse(response);

        expect(result).toBeDefined();
        expect(result?.id).toBe(54321);
        expect(result?.title).toBe('Inception');
        expect(result?.cast).toEqual(['Leonardo DiCaprio']);
        expect(result?.directors).toEqual(['Christopher Nolan']);
      });
    });
  });

  describe('API Functions', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
      // Clear token cache before each test
      clearTokenCache();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      clearTokenCache();
    });

    describe('fetchTheTVDBToken', () => {
      it('should fetch and return token', async () => {
        const mockResponse = {
          status: 'success',
          data: { token: 'test-token-12345' },
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const token = await fetchTheTVDBToken('test-api-key');

        expect(token).toBe('test-token-12345');
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api4.thetvdb.com/v4/login',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apikey: 'test-api-key' }),
          })
        );
      });

      it('should throw error on failed response', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
        });

        await expect(fetchTheTVDBToken('invalid-key')).rejects.toThrow(
          'TheTVDB authentication failed: 401'
        );
      });

      it('should throw error on invalid response format', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'failure' }),
        });

        await expect(fetchTheTVDBToken('test-key')).rejects.toThrow(
          'TheTVDB authentication failed: invalid response'
        );
      });
    });

    describe('fetchTrendingTVShows', () => {
      it('should fetch trending TV shows', async () => {
        const mockTokenResponse = {
          status: 'success',
          data: { token: 'test-token' },
        };

        const mockSeriesResponse = {
          status: 'success',
          data: [
            {
              id: 12345,
              name: 'Test Show',
              year: '2024',
              image: '/test.jpg',
              overview: 'Test overview',
              genres: [],
            },
          ],
        };

        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockTokenResponse),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSeriesResponse),
          });
        });

        const result = await fetchTrendingTVShows('test-api-key', 1);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Test Show');
        expect(result.page).toBe(1);
      });

      it('should throw error when API key is missing', async () => {
        await expect(fetchTrendingTVShows('', 1)).rejects.toThrow(
          'THETVDB_API_KEY is required'
        );
      });
    });

    describe('fetchTrendingMovies', () => {
      it('should fetch trending movies', async () => {
        const mockTokenResponse = {
          status: 'success',
          data: { token: 'test-token' },
        };

        const mockMoviesResponse = {
          status: 'success',
          data: [
            {
              id: 54321,
              name: 'Test Movie',
              year: '2024',
              image: '/movie.jpg',
              overview: 'Movie overview',
              runtime: 120,
              genres: [],
            },
          ],
        };

        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockTokenResponse),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMoviesResponse),
          });
        });

        const result = await fetchTrendingMovies('test-api-key', 1);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe('Test Movie');
        expect(result.items[0].mediaType).toBe('movie');
      });
    });

    describe('fetchTVShowDetails', () => {
      it('should fetch TV show details', async () => {
        const mockTokenResponse = {
          status: 'success',
          data: { token: 'test-token' },
        };

        const mockDetailsResponse = {
          status: 'success',
          data: {
            id: 12345,
            name: 'Breaking Bad',
            year: '2008',
            image: '/bb.jpg',
            overview: 'Chemistry teacher becomes meth producer.',
            genres: [{ name: 'Drama' }],
            characters: [
              { personName: 'Bryan Cranston', type: 3 },
            ],
          },
        };

        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockTokenResponse),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockDetailsResponse),
          });
        });

        const result = await fetchTVShowDetails('test-api-key', 12345);

        expect(result).toBeDefined();
        expect(result?.title).toBe('Breaking Bad');
        expect(result?.cast).toContain('Bryan Cranston');
      });
    });

    describe('fetchMovieDetails', () => {
      it('should fetch movie details', async () => {
        const mockTokenResponse = {
          status: 'success',
          data: { token: 'test-token' },
        };

        const mockDetailsResponse = {
          status: 'success',
          data: {
            id: 54321,
            name: 'Inception',
            year: '2010',
            image: '/inception.jpg',
            overview: 'Dream heist movie.',
            runtime: 148,
            genres: [{ name: 'Sci-Fi' }],
            characters: [
              { personName: 'Leonardo DiCaprio', type: 3 },
              { personName: 'Christopher Nolan', type: 1 },
            ],
          },
        };

        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockTokenResponse),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockDetailsResponse),
          });
        });

        const result = await fetchMovieDetails('test-api-key', 54321);

        expect(result).toBeDefined();
        expect(result?.title).toBe('Inception');
        expect(result?.directors).toContain('Christopher Nolan');
      });
    });
  });

  describe('Type Exports', () => {
    it('should export TheTVDBTrendingItem type', () => {
      const item: TheTVDBTrendingItem = {
        id: 1,
        title: 'Test',
        mediaType: 'tv',
        genres: [],
      };
      expect(item.id).toBe(1);
    });

    it('should export TheTVDBTrendingResult type', () => {
      const result: TheTVDBTrendingResult = {
        items: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      };
      expect(result.page).toBe(1);
    });
  });
});
