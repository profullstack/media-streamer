/**
 * Trending Service Tests
 *
 * Tests for the trending/popular content service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPopularContent,
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchPopularMusic,
  fetchRecentlyAdded,
  fetchMostSeeded,
  type TrendingItem,
  type TrendingResult,
} from './trending';

// Mock Supabase
const mockSelect = vi.fn();
const mockGte = vi.fn();
const mockNot = vi.fn();
const mockGt = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockIn = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Set up environment variables
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('Trending Service', () => {
  const mockTorrentData = [
    {
      id: 'torrent-1',
      infohash: 'abc123',
      name: 'Popular Movie 2024',
      clean_title: 'Popular Movie',
      content_type: 'movie',
      year: 2024,
      poster_url: 'https://example.com/poster1.jpg',
      description: 'A popular movie',
      seeders: 1000,
      leechers: 50,
      total_size: 5000000000,
      indexed_at: '2024-01-15T00:00:00Z',
    },
    {
      id: 'torrent-2',
      infohash: 'def456',
      name: 'Trending TV Show S01',
      clean_title: 'Trending TV Show',
      content_type: 'tv',
      year: 2024,
      poster_url: 'https://example.com/poster2.jpg',
      description: 'A trending TV show',
      seeders: 800,
      leechers: 30,
      total_size: 10000000000,
      indexed_at: '2024-01-14T00:00:00Z',
    },
    {
      id: 'torrent-3',
      infohash: 'ghi789',
      name: 'Hot Album 2024',
      clean_title: 'Hot Album',
      content_type: 'music',
      year: 2024,
      poster_url: null,
      description: 'A hot music album',
      seeders: 500,
      leechers: 20,
      total_size: 500000000,
      indexed_at: '2024-01-13T00:00:00Z',
    },
  ];

  function setupMockChain(data: unknown[], count: number) {
    // Create a thenable result object that can be awaited
    const thenableResult = {
      data,
      error: null,
      count,
      then: (resolve: (value: { data: unknown[]; error: null; count: number }) => void) => {
        resolve({ data, error: null, count });
        return thenableResult;
      },
    };

    mockSelect.mockReturnValue({
      gte: mockGte,
      not: mockNot,
      order: mockOrder,
    });
    mockGte.mockReturnValue({
      not: mockNot,
      order: mockOrder,
    });
    mockNot.mockReturnValue({
      gt: mockGt,
      order: mockOrder,
    });
    mockGt.mockReturnValue({
      order: mockOrder,
    });
    mockOrder.mockReturnValue({
      range: mockRange,
      in: mockIn,
    });
    mockRange.mockReturnValue({
      ...thenableResult,
      in: mockIn,
    });
    mockIn.mockReturnValue(thenableResult);
  }

  describe('fetchPopularContent', () => {
    it('should fetch popular content from database', async () => {
      setupMockChain(mockTorrentData, 3);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items).toHaveLength(3);
      expect(result.page).toBe(1);
      expect(result.totalResults).toBe(3);
      expect(mockFrom).toHaveBeenCalledWith('torrents');
    });

    it('should transform database rows to TrendingItem format', async () => {
      setupMockChain([mockTorrentData[0]], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0]).toEqual({
        id: 'torrent-1',
        infohash: 'abc123',
        title: 'Popular Movie 2024',
        cleanTitle: 'Popular Movie',
        mediaType: 'movie',
        year: 2024,
        posterUrl: 'https://example.com/poster1.jpg',
        description: 'A popular movie',
        seeders: 1000,
        leechers: 50,
        totalSize: 5000000000,
        indexedAt: '2024-01-15T00:00:00Z',
      });
    });

    it('should handle null poster URLs', async () => {
      setupMockChain([mockTorrentData[2]], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].posterUrl).toBeNull();
    });

    it('should return empty result on database error', async () => {
      mockSelect.mockReturnValue({
        gte: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                  count: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should calculate pagination correctly', async () => {
      setupMockChain(mockTorrentData.slice(0, 2), 50);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.totalPages).toBe(3); // 50 / 20 = 2.5, ceil = 3
    });
  });

  describe('fetchPopularMovies', () => {
    it('should fetch only movies', async () => {
      setupMockChain([mockTorrentData[0]], 1);

      const result = await fetchPopularMovies('week', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].mediaType).toBe('movie');
    });
  });

  describe('fetchPopularTVShows', () => {
    it('should fetch only TV shows', async () => {
      setupMockChain([mockTorrentData[1]], 1);

      const result = await fetchPopularTVShows('week', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].mediaType).toBe('tv');
    });
  });

  describe('fetchPopularMusic', () => {
    it('should fetch only music', async () => {
      setupMockChain([mockTorrentData[2]], 1);

      const result = await fetchPopularMusic('week', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].mediaType).toBe('music');
    });
  });

  describe('fetchRecentlyAdded', () => {
    it('should fetch recently added content', async () => {
      mockSelect.mockReturnValue({
        order: mockOrder,
      });
      mockOrder.mockReturnValue({
        range: mockRange,
        in: mockIn,
      });
      mockRange.mockResolvedValue({
        data: mockTorrentData,
        error: null,
        count: 3,
      });
      mockIn.mockReturnValue({
        order: mockOrder,
        range: mockRange,
      });

      const result = await fetchRecentlyAdded('all', 1, 20);

      expect(result.items).toHaveLength(3);
    });
  });

  describe('fetchMostSeeded', () => {
    it('should fetch most seeded content', async () => {
      mockSelect.mockReturnValue({
        not: mockNot,
      });
      mockNot.mockReturnValue({
        gt: mockGt,
      });
      mockGt.mockReturnValue({
        order: mockOrder,
      });
      mockOrder.mockReturnValue({
        range: mockRange,
        in: mockIn,
      });
      mockRange.mockResolvedValue({
        data: mockTorrentData,
        error: null,
        count: 3,
      });
      mockIn.mockReturnValue({
        order: mockOrder,
        range: mockRange,
      });

      const result = await fetchMostSeeded('all', 1, 20);

      expect(result.items).toHaveLength(3);
    });
  });

  describe('Media type mapping', () => {
    it('should map movie content type correctly', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'movie' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('movie');
    });

    it('should map tv content type correctly', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'tv' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('tv');
    });

    it('should map tvshow content type to tv', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'tvshow' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('tv');
    });

    it('should map series content type to tv', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'series' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('tv');
    });

    it('should map music content type correctly', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'music' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('music');
    });

    it('should map audio content type to music', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'audio' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('music');
    });

    it('should map unknown content type to other', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: 'unknown' }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('other');
    });

    it('should map null content type to other', async () => {
      setupMockChain([{ ...mockTorrentData[0], content_type: null }], 1);

      const result = await fetchPopularContent('all', 'week', 1, 20);

      expect(result.items[0].mediaType).toBe('other');
    });
  });
});
