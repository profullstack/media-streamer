/**
 * Torrent Search API Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  searchTorrents: vi.fn(),
  searchAllTorrents: vi.fn(),
}));

import { searchTorrents, searchAllTorrents } from '@/lib/supabase';

const mockSearchTorrents = vi.mocked(searchTorrents);
const mockSearchAllTorrents = vi.mocked(searchAllTorrents);

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/search/torrents');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url);
}

describe('Torrent Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/search/torrents', () => {
    it('should return 400 if query is missing', async () => {
      const request = createRequest({});
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 if query is empty', async () => {
      const request = createRequest({ q: '   ' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 for invalid media type', async () => {
      const request = createRequest({ q: 'test', type: 'invalid' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid media type');
    });

    it('should return 400 for invalid limit', async () => {
      const request = createRequest({ q: 'test', limit: 'abc' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid limit. Must be a number.');
    });

    it('should return 400 if limit exceeds maximum', async () => {
      const request = createRequest({ q: 'test', limit: '200' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Limit cannot exceed 100');
    });

    it('should return 400 if limit is less than 1', async () => {
      const request = createRequest({ q: 'test', limit: '0' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Limit must be at least 1');
    });

    it('should return 400 for invalid offset', async () => {
      const request = createRequest({ q: 'test', offset: 'abc' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid offset. Must be a number.');
    });

    it('should return 400 for negative offset', async () => {
      const request = createRequest({ q: 'test', offset: '-1' });
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Offset must be non-negative');
    });

    it('should search torrents successfully', async () => {
      const mockResults = [
        {
          torrent_id: 'torrent-1',
          torrent_name: 'Pennywise - Full Album',
          torrent_clean_title: null,
          torrent_infohash: 'abc123',
          torrent_total_size: 500000000,
          torrent_file_count: 12,
          torrent_seeders: 50,
          torrent_leechers: 10,
          torrent_created_at: '2024-01-01T00:00:00Z',
          torrent_poster_url: null,
          torrent_cover_url: null,
          match_type: 'torrent_name',
          rank: 0.9,
          source: 'user' as const,
        },
      ];

      mockSearchAllTorrents.mockResolvedValue(mockResults);

      const request = createRequest({ q: 'pennywise' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.query).toBe('pennywise');
      expect(data.results).toEqual(mockResults);
      expect(data.pagination.count).toBe(1);
      expect(data.pagination.limit).toBe(50);
      expect(data.pagination.offset).toBe(0);
      expect(data.pagination.hasMore).toBe(false);
      expect(data.filters.source).toBe('all');
    });

    it('should pass media type filter to search (user source)', async () => {
      mockSearchTorrents.mockResolvedValue([]);

      const request = createRequest({ q: 'test', type: 'audio', source: 'user' });
      await GET(request);

      expect(mockSearchTorrents).toHaveBeenCalledWith({
        query: 'test',
        mediaType: 'audio',
        limit: 50,
        offset: 0,
        sortBy: 'relevance',
        sortOrder: 'desc',
      });
    });

    it('should pass pagination parameters to search (user source)', async () => {
      mockSearchTorrents.mockResolvedValue([]);

      const request = createRequest({ q: 'test', limit: '20', offset: '10', source: 'user' });
      await GET(request);

      expect(mockSearchTorrents).toHaveBeenCalledWith({
        query: 'test',
        mediaType: null,
        limit: 20,
        offset: 10,
        sortBy: 'relevance',
        sortOrder: 'desc',
      });
    });

    it('should indicate hasMore when results equal limit', async () => {
      const mockResults = Array(50).fill({
        torrent_id: 'torrent-1',
        torrent_name: 'Test',
        torrent_clean_title: null,
        torrent_infohash: 'abc123',
        torrent_total_size: 100,
        torrent_file_count: 1,
        torrent_seeders: 10,
        torrent_leechers: 5,
        torrent_created_at: '2024-01-01T00:00:00Z',
        torrent_poster_url: null,
        torrent_cover_url: null,
        match_type: 'torrent_name',
        rank: 0.5,
        source: 'user' as const,
      });

      mockSearchAllTorrents.mockResolvedValue(mockResults);

      const request = createRequest({ q: 'test' });
      const response = await GET(request);

      const data = await response.json();
      expect(data.pagination.hasMore).toBe(true);
    });

    it('should handle search errors gracefully', async () => {
      mockSearchAllTorrents.mockRejectedValue(new Error('Database error'));

      const request = createRequest({ q: 'test' });
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Search failed');
    });
  });
});
