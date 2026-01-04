/**
 * Trending API Route Tests
 *
 * Tests for the trending API endpoint that returns
 * trending content from TheTVDB (movies/TV) and local database (torrents)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock the trending modules
vi.mock('@/lib/trending', () => ({
  fetchTrendingMovies: vi.fn(),
  fetchTrendingTVShows: vi.fn(),
  fetchTrendingWithDetails: vi.fn(),
  fetchPopularContent: vi.fn(),
  fetchRecentlyAdded: vi.fn(),
  fetchMostSeeded: vi.fn(),
}));

import {
  fetchTrendingMovies,
  fetchTrendingTVShows,
  fetchPopularContent,
} from '@/lib/trending';

describe('Trending API Route', () => {
  const mockTheTVDBMovies = {
    items: [
      {
        id: 123,
        title: 'Test Movie',
        mediaType: 'movie' as const,
        year: 2024,
        posterUrl: 'https://artworks.thetvdb.com/banners/movies/poster.jpg',
        overview: 'A test movie',
        runtime: 120,
        genres: ['Action', 'Adventure'],
        cast: ['Actor One'],
        directors: ['Director One'],
        rating: 8.5,
      },
    ],
    page: 1,
    totalPages: 10,
    totalResults: 200,
  };

  const mockTheTVDBTVShows = {
    items: [
      {
        id: 456,
        title: 'Test TV Show',
        mediaType: 'tv' as const,
        year: 2024,
        posterUrl: 'https://artworks.thetvdb.com/banners/series/tvposter.jpg',
        overview: 'A test TV show',
        status: 'Continuing',
        network: 'HBO',
        runtime: 60,
        genres: ['Drama', 'Thriller'],
        cast: ['Actor Two'],
        directors: ['Creator One'],
        rating: 9.0,
      },
    ],
    page: 1,
    totalPages: 5,
    totalResults: 100,
  };

  const mockTorrents = {
    items: [
      {
        id: 'torrent-1',
        infohash: 'abc123',
        title: 'Popular Torrent',
        cleanTitle: 'Popular Torrent',
        mediaType: 'movie' as const,
        year: 2024,
        posterUrl: 'https://example.com/poster.jpg',
        description: 'A popular torrent',
        seeders: 1000,
        leechers: 50,
        totalSize: 5000000000,
        indexedAt: '2024-01-15T00:00:00Z',
      },
    ],
    page: 1,
    totalPages: 3,
    totalResults: 50,
  };

  beforeEach(() => {
    vi.stubEnv('THETVDB_API_KEY', 'test-api-key');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    vi.mocked(fetchTrendingMovies).mockResolvedValue(mockTheTVDBMovies);
    vi.mocked(fetchTrendingTVShows).mockResolvedValue(mockTheTVDBTVShows);
    vi.mocked(fetchPopularContent).mockResolvedValue(mockTorrents);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('GET /api/trending', () => {
    it('should return all sections by default', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('movies');
      expect(data).toHaveProperty('tv');
      expect(data).toHaveProperty('torrents');
    });

    it('should return movies section with TheTVDB data', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      expect(data.movies.items).toHaveLength(1);
      expect(data.movies.items[0].title).toBe('Test Movie');
      expect(data.movies.items[0].mediaType).toBe('movie');
    });

    it('should return TV section with TheTVDB data', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      expect(data.tv.items).toHaveLength(1);
      expect(data.tv.items[0].title).toBe('Test TV Show');
      expect(data.tv.items[0].mediaType).toBe('tv');
    });

    it('should return torrents section with database data', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      expect(data.torrents.items).toHaveLength(1);
      expect(data.torrents.items[0].title).toBe('Popular Torrent');
    });

    it('should filter by section=movies', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?section=movies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('movies');
      expect(data).not.toHaveProperty('tv');
      expect(data).not.toHaveProperty('torrents');
    });

    it('should filter by section=tv', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?section=tv');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('tv');
      expect(data).not.toHaveProperty('movies');
      expect(data).not.toHaveProperty('torrents');
    });

    it('should filter by section=torrents', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?section=torrents');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('torrents');
      expect(data).not.toHaveProperty('movies');
      expect(data).not.toHaveProperty('tv');
    });

    it('should accept page parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?page=2');
      await GET(request);

      expect(fetchTrendingMovies).toHaveBeenCalledWith('test-api-key', 2);
      expect(fetchTrendingTVShows).toHaveBeenCalledWith('test-api-key', 2);
    });

    it('should return 400 for invalid section', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?section=invalid');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid section');
    });

    it('should return 400 for invalid page', async () => {
      const request = new NextRequest('http://localhost:3000/api/trending?page=0');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid page');
    });

    it('should handle TheTVDB API errors gracefully', async () => {
      vi.mocked(fetchTrendingMovies).mockRejectedValue(new Error('TheTVDB API error'));
      vi.mocked(fetchTrendingTVShows).mockRejectedValue(new Error('TheTVDB API error'));

      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      // Should still return 200 with empty sections for failed APIs
      expect(response.status).toBe(200);
      expect(data.movies.items).toHaveLength(0);
      expect(data.movies.error).toBe('TheTVDB API error');
      expect(data.tv.items).toHaveLength(0);
      expect(data.tv.error).toBe('TheTVDB API error');
      // Torrents should still work
      expect(data.torrents.items).toHaveLength(1);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(fetchPopularContent).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/trending');
      const response = await GET(request);
      const data = await response.json();

      // Should still return 200 with empty torrents section
      expect(response.status).toBe(200);
      expect(data.torrents.items).toHaveLength(0);
      expect(data.torrents.error).toBe('Database error');
      // TheTVDB sections should still work
      expect(data.movies.items).toHaveLength(1);
      expect(data.tv.items).toHaveLength(1);
    });

    it('should return error when THETVDB_API_KEY is not configured', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

      const request = new NextRequest('http://localhost:3000/api/trending?section=movies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.movies.items).toHaveLength(0);
      expect(data.movies.error).toBe('THETVDB_API_KEY is not configured');
    });
  });
});
