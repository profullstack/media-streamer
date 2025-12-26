import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-123', email: 'test@example.com' })),
}));

// Mock subscription
const mockSubscriptionRepository = {
  getSubscription: vi.fn().mockResolvedValue({
    id: 'sub-123',
    user_id: 'user-123',
    tier: 'premium',
    status: 'active',
    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_expires_at: null,
  }),
};

vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: vi.fn(() => mockSubscriptionRepository),
}));

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  searchFiles: vi.fn(),
}));

import { GET } from './route';
import { searchFiles } from '@/lib/supabase';

const mockSearchFiles = vi.mocked(searchFiles);

describe('Search API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/search', () => {
    it('should return search results for valid query', async () => {
      const mockResults = [
        {
          file_id: 'file-1',
          file_name: 'aphex_twin_xtal.flac',
          file_path: '/Aphex Twin/Selected Ambient Works/Xtal.flac',
          file_size: 50000000,
          file_media_category: 'audio',
          file_index: 0,
          torrent_id: 'torrent-1',
          torrent_name: 'Music Archive',
          torrent_infohash: 'abc123',
          rank: 0.9,
        },
        {
          file_id: 'file-2',
          file_name: 'aphex_twin_ageispolis.flac',
          file_path: '/Aphex Twin/Selected Ambient Works/Ageispolis.flac',
          file_size: 45000000,
          file_media_category: 'audio',
          file_index: 1,
          torrent_id: 'torrent-1',
          torrent_name: 'Music Archive',
          torrent_infohash: 'abc123',
          rank: 0.85,
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=Aphex+Twin');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].file_name).toBe('aphex_twin_xtal.flac');
      expect(data.query).toBe('Aphex Twin');
    });

    it('should filter by media type', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&type=audio');
      await GET(request);

      expect(mockSearchFiles).toHaveBeenCalledWith({
        query: 'test',
        mediaType: 'audio',
        torrentId: null,
        limit: 50,
        offset: 0,
      });
    });

    it('should filter by torrent ID', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&torrent=torrent-123');
      await GET(request);

      expect(mockSearchFiles).toHaveBeenCalledWith({
        query: 'test',
        mediaType: null,
        torrentId: 'torrent-123',
        limit: 50,
        offset: 0,
      });
    });

    it('should support pagination', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=20&offset=40');
      await GET(request);

      expect(mockSearchFiles).toHaveBeenCalledWith({
        query: 'test',
        mediaType: null,
        torrentId: null,
        limit: 20,
        offset: 40,
      });
    });

    it('should return 400 for missing query parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 for empty query', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 for invalid media type', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&type=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid media type');
    });

    it('should return 400 for invalid limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid limit');
    });

    it('should return 400 for limit exceeding maximum', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=500');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Limit cannot exceed 100');
    });

    it('should return 400 for negative offset', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&offset=-10');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Offset must be non-negative');
    });

    it('should handle database errors gracefully', async () => {
      mockSearchFiles.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Search failed');
    });

    it('should include pagination metadata in response', async () => {
      const mockResults = Array.from({ length: 20 }, (_, i) => ({
        file_id: `file-${i}`,
        file_name: `file${i}.mp3`,
        file_path: `/music/file${i}.mp3`,
        file_size: 1000000,
        file_media_category: 'audio',
        file_index: i,
        torrent_id: 'torrent-1',
        torrent_name: 'Music',
        torrent_infohash: 'abc123',
        rank: 0.9 - i * 0.01,
      }));

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=20&offset=40');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination).toEqual({
        limit: 20,
        offset: 40,
        count: 20,
        hasMore: true,
      });
    });

    it('should set hasMore to false when results are less than limit', async () => {
      const mockResults = [
        {
          file_id: 'file-1',
          file_name: 'file.mp3',
          file_path: '/music/file.mp3',
          file_size: 1000000,
          file_media_category: 'audio',
          file_index: 0,
          torrent_id: 'torrent-1',
          torrent_name: 'Music',
          torrent_infohash: 'abc123',
          rank: 0.9,
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=50');
      const response = await GET(request);
      const data = await response.json();

      expect(data.pagination.hasMore).toBe(false);
    });
  });

  describe('PRD Addendum: SQL injection prevention tests', () => {
    it('should safely handle SQL injection attempts in query parameter', async () => {
      mockSearchFiles.mockResolvedValue([]);

      // Classic SQL injection attempt
      const request = new NextRequest("http://localhost:3000/api/search?q='; DROP TABLE torrents; --");
      const response = await GET(request);

      expect(response.status).toBe(200);
      // The query should be passed as-is to the parameterized query function
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "'; DROP TABLE torrents; --",
        })
      );
    });

    it('should safely handle SQL injection with UNION SELECT', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=' UNION SELECT * FROM users --");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "' UNION SELECT * FROM users --",
        })
      );
    });

    it('should safely handle SQL injection with OR 1=1', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=' OR '1'='1");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "' OR '1'='1",
        })
      );
    });

    it('should safely handle SQL injection with comment syntax', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=test/**/OR/**/1=1");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "test/**/OR/**/1=1",
        })
      );
    });

    it('should safely handle SQL injection with hex encoding', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=0x27");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "0x27",
        })
      );
    });

    it('should safely handle SQL injection in torrent ID parameter', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=test&torrent='; DELETE FROM torrents; --");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          torrentId: "'; DELETE FROM torrents; --",
        })
      );
    });

    it('should safely handle SQL injection in media type parameter', async () => {
      // Invalid media type should be rejected before reaching the database
      const request = new NextRequest("http://localhost:3000/api/search?q=test&type=audio'; DROP TABLE--");
      const response = await GET(request);

      expect(response.status).toBe(400);
      expect(mockSearchFiles).not.toHaveBeenCalled();
    });

    it('should safely handle special characters in query', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const request = new NextRequest(`http://localhost:3000/api/search?q=${encodeURIComponent(specialChars)}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: specialChars,
        })
      );
    });

    it('should safely handle unicode characters in query', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const unicodeQuery = "日本語 Ελληνικά العربية";
      const request = new NextRequest(`http://localhost:3000/api/search?q=${encodeURIComponent(unicodeQuery)}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: unicodeQuery,
        })
      );
    });

    it('should safely handle null byte injection', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/search?q=test%00admin");
      const response = await GET(request);

      expect(response.status).toBe(200);
      // The null byte should be preserved and passed to the parameterized query
      expect(mockSearchFiles).toHaveBeenCalled();
    });

    it('should safely handle very long query strings', async () => {
      mockSearchFiles.mockResolvedValue([]);

      // 10,000 character query
      const longQuery = 'a'.repeat(10000);
      const request = new NextRequest(`http://localhost:3000/api/search?q=${longQuery}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          query: longQuery,
        })
      );
    });
  });

  describe('PRD Addendum: Large dataset query performance tests', () => {
    it('should handle response with maximum allowed results', async () => {
      // Generate 100 results (max limit)
      const mockResults = Array.from({ length: 100 }, (_, i) => ({
        file_id: `file-${i}`,
        file_name: `file${i}.mp3`,
        file_path: `/music/file${i}.mp3`,
        file_size: 1000000 + i,
        file_media_category: 'audio',
        file_index: i,
        torrent_id: `torrent-${Math.floor(i / 10)}`,
        torrent_name: `Album ${Math.floor(i / 10)}`,
        torrent_infohash: `hash${Math.floor(i / 10)}`,
        rank: 1 - i * 0.001,
      }));

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=100');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(100);
      expect(data.pagination.count).toBe(100);
      expect(data.pagination.hasMore).toBe(true);
    });

    it('should handle pagination through large result sets', async () => {
      mockSearchFiles.mockResolvedValue([]);

      // Simulate paginating through results
      const offsets = [0, 100, 200, 500, 1000, 10000];
      
      for (const offset of offsets) {
        const request = new NextRequest(`http://localhost:3000/api/search?q=test&limit=100&offset=${offset}`);
        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(mockSearchFiles).toHaveBeenCalledWith(
          expect.objectContaining({
            offset,
            limit: 100,
          })
        );
      }
    });

    it('should handle results from multiple torrents', async () => {
      // Results spread across many different torrents
      const mockResults = Array.from({ length: 50 }, (_, i) => ({
        file_id: `file-${i}`,
        file_name: `track${i}.flac`,
        file_path: `/Artist ${i}/Album/track${i}.flac`,
        file_size: 50000000 + i * 1000,
        file_media_category: 'audio',
        file_index: 0,
        torrent_id: `torrent-${i}`, // Each file from different torrent
        torrent_name: `Artist ${i} Discography`,
        torrent_infohash: `hash${i.toString().padStart(40, '0')}`,
        rank: 0.9 - i * 0.01,
      }));

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=track');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(50);
      
      // Verify results are from different torrents
      const uniqueTorrents = new Set(data.results.map((r: { torrent_id: string }) => r.torrent_id));
      expect(uniqueTorrents.size).toBe(50);
    });

    it('should handle results with varying file sizes', async () => {
      const mockResults = [
        {
          file_id: 'tiny',
          file_name: 'tiny.txt',
          file_path: '/tiny.txt',
          file_size: 100, // 100 bytes
          file_media_category: 'document',
          file_index: 0,
          torrent_id: 'torrent-1',
          torrent_name: 'Mixed',
          torrent_infohash: 'hash1',
          rank: 0.9,
        },
        {
          file_id: 'huge',
          file_name: 'huge.mkv',
          file_path: '/huge.mkv',
          file_size: 50 * 1024 * 1024 * 1024, // 50 GB
          file_media_category: 'video',
          file_index: 1,
          torrent_id: 'torrent-1',
          torrent_name: 'Mixed',
          torrent_infohash: 'hash1',
          rank: 0.8,
        },
        {
          file_id: 'massive',
          file_name: 'archive.bin',
          file_path: '/archive.bin',
          file_size: 300 * 1024 * 1024 * 1024 * 1024, // 300 TB
          file_media_category: 'other',
          file_index: 2,
          torrent_id: 'torrent-2',
          torrent_name: 'Archive',
          torrent_infohash: 'hash2',
          rank: 0.7,
        },
      ];

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=file');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].file_size).toBe(100);
      expect(data.results[1].file_size).toBe(50 * 1024 * 1024 * 1024);
      expect(data.results[2].file_size).toBe(300 * 1024 * 1024 * 1024 * 1024);
    });

    it('should handle empty results gracefully', async () => {
      mockSearchFiles.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/search?q=nonexistent_query_xyz123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(0);
      expect(data.pagination.count).toBe(0);
      expect(data.pagination.hasMore).toBe(false);
    });

    it('should handle results with deeply nested paths', async () => {
      const deepPath = Array.from({ length: 50 }, (_, i) => `folder${i}`).join('/');
      
      const mockResults = [{
        file_id: 'deep',
        file_name: 'deep_file.mp3',
        file_path: `/${deepPath}/deep_file.mp3`,
        file_size: 5000000,
        file_media_category: 'audio',
        file_index: 0,
        torrent_id: 'torrent-1',
        torrent_name: 'Deep Archive',
        torrent_infohash: 'hash1',
        rank: 0.9,
      }];

      mockSearchFiles.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/search?q=deep');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].file_path).toContain('folder49');
    });
  });
});
