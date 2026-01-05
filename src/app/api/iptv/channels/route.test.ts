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

// Mock undici fetch
const mockFetch = vi.fn();
vi.mock('undici', () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  fetch: mockFetch,
}));

// Mock cache reader for worker cache
const mockGetPlaylistMeta = vi.fn();
const mockGetPlaylistChannels = vi.fn();
const mockGetPlaylistGroups = vi.fn();
const mockGetChannelsByGroup = vi.fn();

vi.mock('@/lib/iptv/cache-reader', () => ({
  getIptvCacheReader: vi.fn(() => ({
    getPlaylistMeta: mockGetPlaylistMeta,
    getPlaylistChannels: mockGetPlaylistChannels,
    getPlaylistGroups: mockGetPlaylistGroups,
    getChannelsByGroup: mockGetChannelsByGroup,
  })),
}));

// Mock supabase for database fallback
const mockSupabaseFrom = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

// Mock the iptv library before importing the route
vi.mock('@/lib/iptv', () => ({
  parseM3U: vi.fn(),
  searchChannels: vi.fn(),
  extractGroups: vi.fn(),
  getProxiedUrl: vi.fn(function(url: string) {
    return url.startsWith('http://') ? `/api/iptv-proxy?url=${encodeURIComponent(url)}` : url;
  }),
  getPlaylistCache: vi.fn(function() {
    return {
      get: mockCacheGet,
      set: mockCacheSet,
    };
  }),
  PlaylistCache: {
    generateKey: vi.fn(function(url: string) { return `key_${url}`; }),
  },
}));

// Import after mocks are set up
const { GET } = await import('./route');
const { parseM3U, searchChannels, extractGroups } = await import('@/lib/iptv');

describe('IPTV Channels API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: worker cache returns no data
    mockGetPlaylistChannels.mockResolvedValue({ success: false, cached: false });
    mockGetPlaylistGroups.mockResolvedValue({ success: false, cached: false });
    mockGetPlaylistMeta.mockResolvedValue({ success: false, cached: false });
    mockGetChannelsByGroup.mockResolvedValue({ success: false, cached: false });

    // Setup supabase mock chain
    mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect });
    mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq });
    mockSupabaseEq.mockReturnValue({ single: mockSupabaseSingle });
    mockSupabaseSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
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

    it('handles SSL certificate errors by ignoring invalid certs', async () => {
      mockCacheGet.mockResolvedValue(null);
      
      const mockChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
      ];
      vi.mocked(parseM3U).mockReturnValue(mockChannels);
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      vi.mocked(extractGroups).mockReturnValue(['Sports']);
      
      // Simulate successful fetch (the implementation should use rejectUnauthorized: false)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('#EXTM3U\n#EXTINF:-1,ESPN HD\nhttps://example.com/espn.m3u8'),
      });
      
      const request = new NextRequest('http://localhost/api/iptv/channels?m3uUrl=https://chimptv.xyz/get.php');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(1);
      // Verify fetch was called - the actual SSL bypass is in the implementation
      expect(mockFetch).toHaveBeenCalled();
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

  describe('playlistId fallback when cache is empty', () => {
    it('fetches m3uUrl from cache metadata when worker cache has no channels', async () => {
      const playlistId = 'test-playlist-123';
      const m3uUrl = 'http://example.com/playlist.m3u';

      // Worker cache has no channels but metadata is available
      mockGetPlaylistChannels.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistGroups.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistMeta.mockResolvedValue({
        success: true,
        cached: true,
        data: {
          playlistId,
          m3uUrl,
          fetchedAt: Date.now(),
        },
      });

      // Request cache also empty, so it will fetch
      mockCacheGet.mockResolvedValue(null);

      const mockChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
      ];
      vi.mocked(parseM3U).mockReturnValue(mockChannels);
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      vi.mocked(extractGroups).mockReturnValue(['Sports']);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('#EXTM3U\n#EXTINF:-1,ESPN HD\nhttps://example.com/espn.m3u8'),
      });

      const request = new NextRequest(`http://localhost/api/iptv/channels?playlistId=${playlistId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        m3uUrl,
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
    });

    it('fetches m3uUrl from database when cache metadata is unavailable', async () => {
      const playlistId = 'test-playlist-456';
      const m3uUrl = 'http://example.com/db-playlist.m3u';

      // Worker cache completely empty
      mockGetPlaylistChannels.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistGroups.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistMeta.mockResolvedValue({ success: false, cached: false });

      // Database returns the playlist with m3u_url
      mockSupabaseSingle.mockResolvedValue({
        data: { m3u_url: m3uUrl },
        error: null,
      });

      // Request cache also empty, so it will fetch
      mockCacheGet.mockResolvedValue(null);

      const mockChannels = [
        { id: '1', name: 'CNN News', url: 'https://example.com/cnn.m3u8', group: 'News' },
      ];
      vi.mocked(parseM3U).mockReturnValue(mockChannels);
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      vi.mocked(extractGroups).mockReturnValue(['News']);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('#EXTM3U\n#EXTINF:-1,CNN News\nhttps://example.com/cnn.m3u8'),
      });

      const request = new NextRequest(`http://localhost/api/iptv/channels?playlistId=${playlistId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(1);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('iptv_playlists');
      expect(mockFetch).toHaveBeenCalledWith(
        m3uUrl,
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
    });

    it('returns 404 with specific error when playlist not found in cache or database', async () => {
      const playlistId = 'nonexistent-playlist';

      // Worker cache completely empty
      mockGetPlaylistChannels.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistGroups.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistMeta.mockResolvedValue({ success: false, cached: false });

      // Database also returns no playlist
      mockSupabaseSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      const request = new NextRequest(`http://localhost/api/iptv/channels?playlistId=${playlistId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Playlist not found in cache or database');
    });

    it('serves from worker cache when channels are available', async () => {
      const playlistId = 'cached-playlist';
      const mockChannels = [
        { id: '1', name: 'ESPN HD', url: 'https://example.com/espn.m3u8', group: 'Sports' },
        { id: '2', name: 'FOX Sports', url: 'https://example.com/fox.m3u8', group: 'Sports' },
      ];

      // Worker cache has channels
      mockGetPlaylistChannels.mockResolvedValue({
        success: true,
        cached: true,
        data: mockChannels,
      });
      mockGetPlaylistGroups.mockResolvedValue({
        success: true,
        cached: true,
        data: ['Sports'],
      });
      mockGetPlaylistMeta.mockResolvedValue({
        success: true,
        cached: true,
        data: {
          playlistId,
          m3uUrl: 'http://example.com/playlist.m3u',
          fetchedAt: Date.now(),
        },
      });

      vi.mocked(searchChannels).mockReturnValue(mockChannels);

      const request = new NextRequest(`http://localhost/api/iptv/channels?playlistId=${playlistId}`);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.channels).toHaveLength(2);
      expect(data.workerCached).toBe(true);
      // Should NOT call database or fetch
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses m3uUrl from query param even when playlistId cache is empty', async () => {
      const playlistId = 'test-playlist';
      const m3uUrl = 'http://example.com/explicit-url.m3u';

      // Worker cache empty
      mockGetPlaylistChannels.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistGroups.mockResolvedValue({ success: false, cached: false });
      mockGetPlaylistMeta.mockResolvedValue({ success: false, cached: false });

      // Request cache also empty
      mockCacheGet.mockResolvedValue(null);

      const mockChannels = [
        { id: '1', name: 'Test Channel', url: 'https://example.com/test.m3u8', group: 'Test' },
      ];
      vi.mocked(parseM3U).mockReturnValue(mockChannels);
      vi.mocked(searchChannels).mockReturnValue(mockChannels);
      vi.mocked(extractGroups).mockReturnValue(['Test']);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('#EXTM3U\n#EXTINF:-1,Test Channel\nhttps://example.com/test.m3u8'),
      });

      // Pass both playlistId and m3uUrl
      const request = new NextRequest(
        `http://localhost/api/iptv/channels?playlistId=${playlistId}&m3uUrl=${encodeURIComponent(m3uUrl)}`
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should use the explicit m3uUrl without falling back to database
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        m3uUrl,
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
    });
  });
});
