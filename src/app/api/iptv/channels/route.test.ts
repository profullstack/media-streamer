/**
 * IPTV Channels API Route Tests
 * 
 * Tests for the server-side channel search API with Redis caching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Create mock cache instance
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

// Mock the iptv library before importing the route
vi.mock('@/lib/iptv', () => ({
  parseM3U: vi.fn(),
  searchChannels: vi.fn(),
  extractGroups: vi.fn(),
  getProxiedUrl: vi.fn((url: string) => 
    url.startsWith('http://') ? `/api/iptv-proxy?url=${encodeURIComponent(url)}` : url
  ),
  getPlaylistCache: vi.fn(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
  })),
  PlaylistCache: {
    generateKey: vi.fn((url: string) => `key_${url}`),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks are set up
const { GET } = await import('./route');
const { parseM3U, searchChannels, extractGroups } = await import('@/lib/iptv');

describe('IPTV Channels API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/iptv/channels', () => {
    it('returns 400 when m3uUrl is missing', async () => {
      const request = new NextRequest('http://localhost/api/iptv/channels');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toContain('m3uUrl');
    });

    it('returns 400 for invalid m3uUrl', async () => {
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=not-a-url');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid');
    });

    it('returns cached channels when available', async () => {
      const cachedChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
      ];
      mockCacheGet.mockResolvedValue({
        channels: cachedChannels,
        groups: ['Sports'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue(cachedChannels);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(1);
      expect(data.cached).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches and parses M3U when not cached', async () => {
      mockCacheGet.mockResolvedValue(null);
      
      const mockChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
        { id: '2', name: 'CNN News', url: 'https://example.com/cnn.m3u8', group: 'News' },
      ];
      vi.mocked(parseM3U).mockReturnValue(mockChannels);
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      vi.mocked(extractGroups).mockReturnValue(['Sports', 'News']);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('#EXTM3U\n#EXTINF:-1,ESPN HD\nhttp://example.com/espn.m3u8'),
      });
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(2);
      expect(data.groups).toEqual(['Sports', 'News']);
      expect(data.cached).toBe(false);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('filters channels by search query', async () => {
      const allChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
        { id: '2', name: 'CNN News', url: 'https://example.com/cnn.m3u8', group: 'News' },
      ];
      mockCacheGet.mockResolvedValue({
        channels: allChannels,
        groups: ['Sports', 'News'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue([
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
      ]);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u&q=espn');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(1);
      expect(searchChannels).toHaveBeenCalledWith(allChannels, 'espn', undefined);
    });

    it('filters channels by group', async () => {
      const allChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
        { id: '2', name: 'CNN News', url: 'https://example.com/cnn.m3u8', group: 'News' },
      ];
      mockCacheGet.mockResolvedValue({
        channels: allChannels,
        groups: ['Sports', 'News'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue([
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
      ]);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u&group=Sports');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(searchChannels).toHaveBeenCalledWith(allChannels, '', 'Sports');
    });

    it('supports pagination with limit and offset', async () => {
      const allChannels = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        url: `https://example.com/ch${i}.m3u8`,
        group: 'General',
      }));
      mockCacheGet.mockResolvedValue({
        channels: allChannels,
        groups: ['General'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue(allChannels);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u&limit=10&offset=20');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(10);
      expect(data.total).toBe(100);
      expect(data.offset).toBe(20);
      expect(data.limit).toBe(10);
    });

    it('returns 502 when upstream fetch fails', async () => {
      mockCacheGet.mockResolvedValue(null);
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(502);
      expect(data.error).toContain('fetch');
    });

    it('proxies HTTP URLs in channel responses', async () => {
      const mockChannels = [
        { id: '1', name: 'ESPN HD', url: 'http://example.com/espn.m3u8', group: 'Sports' },
        { id: '2', name: 'CNN News', url: 'https://example.com/cnn.m3u8', group: 'News' },
      ];
      mockCacheGet.mockResolvedValue({
        channels: mockChannels,
        groups: ['Sports', 'News'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // HTTP URL should be proxied
      expect(data.channels[0].url).toContain('/api/iptv-proxy');
      // HTTPS URL should remain unchanged
      expect(data.channels[1].url).toBe('https://example.com/cnn.m3u8');
    });

    it('enforces maximum limit', async () => {
      const allChannels = Array.from({ length: 500 }, (_, i) => ({
        id: String(i),
        name: `Channel ${i}`,
        url: `https://example.com/ch${i}.m3u8`,
        group: 'General',
      }));
      mockCacheGet.mockResolvedValue({
        channels: allChannels,
        groups: ['General'],
        fetchedAt: Date.now(),
        m3uUrl: 'http://example.com/playlist.m3u',
      });
      vi.mocked(searchChannels).mockReturnValue(allChannels);
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=http://example.com/playlist.m3u&limit=1000');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // Should be capped at MAX_LIMIT (200)
      expect(data.channels.length).toBeLessThanOrEqual(200);
      expect(data.limit).toBeLessThanOrEqual(200);
    });
  });
});
