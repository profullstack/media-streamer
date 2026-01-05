/**
 * Playlist Fetcher Tests
 *
 * Tests for the worker's M3U playlist fetching functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock undici
const mockFetch = vi.fn();
const mockAgentConstructor = vi.fn(() => ({}));
vi.mock('undici', () => ({
  Agent: mockAgentConstructor,
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

// Mock Supabase
const mockSupabaseQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => mockSupabaseQuery),
  })),
}));

// Mock m3u-parser
vi.mock('../../src/lib/iptv/m3u-parser', () => ({
  parseM3U: vi.fn((content: string) => {
    if (content.includes('#EXTINF')) {
      return [
        { id: 'ch1', name: 'Channel 1', url: 'http://example.com/1.m3u8', group: 'Group A' },
        { id: 'ch2', name: 'Channel 2', url: 'http://example.com/2.m3u8', group: 'Group B' },
      ];
    }
    return [];
  }),
  extractGroups: vi.fn((channels: { group?: string }[]) => {
    const groups = new Set<string>();
    channels.forEach(ch => ch.group && groups.add(ch.group));
    return Array.from(groups);
  }),
}));

describe('PlaylistFetcher', () => {
  let fetchAndParsePlaylist: typeof import('./playlist-fetcher').fetchAndParsePlaylist;
  let fetchAndParsePlaylistStreaming: typeof import('./playlist-fetcher').fetchAndParsePlaylistStreaming;
  let fetchActivePlaylists: typeof import('./playlist-fetcher').fetchActivePlaylists;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const module = await import('./playlist-fetcher');
    fetchAndParsePlaylist = module.fetchAndParsePlaylist;
    fetchAndParsePlaylistStreaming = module.fetchAndParsePlaylistStreaming;
    fetchActivePlaylists = module.fetchActivePlaylists;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe('fetchAndParsePlaylist', () => {
    it('successfully parses a valid M3U playlist', async () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="ch1" group-title="Group A",Channel 1
http://example.com/1.m3u8
#EXTINF:-1 tvg-id="ch2" group-title="Group B",Channel 2
http://example.com/2.m3u8`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        text: vi.fn().mockResolvedValue(m3uContent),
      });

      const result = await fetchAndParsePlaylist('http://example.com/playlist.m3u');

      expect(result.success).toBe(true);
      expect(result.channels).toHaveLength(2);
      expect(result.groups).toContain('Group A');
      expect(result.groups).toContain('Group B');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error for empty playlist content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await fetchAndParsePlaylist('http://example.com/empty.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty playlist content');
    });

    it('returns error for invalid M3U format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        text: vi.fn().mockResolvedValue('This is not an M3U file'),
      });

      const result = await fetchAndParsePlaylist('http://example.com/invalid.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid M3U format');
    });

    it('returns error on HTTP failure', async () => {
      // Mock all retry attempts to return 404
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await fetchAndParsePlaylist('http://example.com/missing.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('retries on failure then succeeds', async () => {
      const m3uContent = '#EXTM3U\n#EXTINF:-1,Test\nhttp://test.m3u8';

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: vi.fn().mockReturnValue(null) },
          text: vi.fn().mockResolvedValue(m3uContent),
        });

      const result = await fetchAndParsePlaylist('http://example.com/retry.m3u');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchActivePlaylists', () => {
    it('fetches active playlists from Supabase', async () => {
      const mockPlaylists = [
        { id: '1', name: 'Playlist 1', m3u_url: 'http://example.com/1.m3u', is_active: true },
        { id: '2', name: 'Playlist 2', m3u_url: 'http://example.com/2.m3u', is_active: true },
      ];

      mockSupabaseQuery.eq.mockResolvedValueOnce({ data: mockPlaylists, error: null });

      const result = await fetchActivePlaylists();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Playlist 1');
    });

    it('throws error on Supabase failure', async () => {
      mockSupabaseQuery.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(fetchActivePlaylists()).rejects.toThrow('Failed to fetch playlists');
    });

    it('returns empty array when no playlists exist', async () => {
      mockSupabaseQuery.eq.mockResolvedValueOnce({ data: [], error: null });

      const result = await fetchActivePlaylists();

      expect(result).toEqual([]);
    });
  });

  describe('fetchAndParsePlaylistStreaming', () => {
    // Note: Full streaming tests require complex Web Streams API mocking
    // The streaming functionality is tested via integration tests and the
    // underlying parseM3UStreamingBatched is tested through fetchAndParsePlaylist

    it('returns error on fetch failure after retries', async () => {
      // Mock all 3 retry attempts to fail
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const batches: unknown[] = [];
      const result = await fetchAndParsePlaylistStreaming(
        'http://example.com/fail.m3u',
        async (batch) => {
          batches.push(batch);
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(batches.length).toBe(0);
    });

    it('is exported and callable', () => {
      // Verify the function is exported and has the right signature
      expect(typeof fetchAndParsePlaylistStreaming).toBe('function');
      expect(fetchAndParsePlaylistStreaming.length).toBe(2); // Takes 2 args: url and callback
    });
  });

  describe('SSL Configuration', () => {
    it('should configure Agent with SSL bypass options', async () => {
      // The Agent is created at module load time, so we verify it was called
      // with the expected configuration by checking the mock was called
      // The module was already imported in beforeEach, so we check the call history
      vi.resetModules();
      mockAgentConstructor.mockClear();

      await import('./playlist-fetcher');

      expect(mockAgentConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connect: expect.objectContaining({
            rejectUnauthorized: false,
            minVersion: 'TLSv1',
          }),
        })
      );

      // Also verify checkServerIdentity is a function that returns undefined
      const calls = mockAgentConstructor.mock.calls as unknown as Array<[{ connect: { checkServerIdentity?: () => undefined } }]>;
      const agentConfig = calls[0]?.[0];
      expect(agentConfig?.connect.checkServerIdentity).toBeDefined();
      expect(typeof agentConfig?.connect.checkServerIdentity).toBe('function');
      expect(agentConfig?.connect.checkServerIdentity?.()).toBeUndefined();
    });

    it('should handle SSL certificate errors and return error result', async () => {
      // Simulate SSL certificate error
      const sslError = new Error('unable to verify the first certificate');
      mockFetch.mockRejectedValue(sslError);

      const result = await fetchAndParsePlaylist('https://bad-cert.example.com/playlist.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toContain('unable to verify');
    });

    it('should handle self-signed certificate errors', async () => {
      const selfSignedError = new Error('self signed certificate');
      mockFetch.mockRejectedValue(selfSignedError);

      const result = await fetchAndParsePlaylist('https://self-signed.example.com/playlist.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toContain('self signed');
    });

    it('should handle expired certificate errors', async () => {
      const expiredCertError = new Error('certificate has expired');
      mockFetch.mockRejectedValue(expiredCertError);

      const result = await fetchAndParsePlaylist('https://expired.example.com/playlist.m3u');

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should use insecure agent dispatcher for fetch requests', async () => {
      const m3uContent = '#EXTM3U\n#EXTINF:-1,Test\nhttp://test.m3u8';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        text: vi.fn().mockResolvedValue(m3uContent),
      });

      await fetchAndParsePlaylist('https://example.com/playlist.m3u');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/playlist.m3u',
        expect.objectContaining({
          dispatcher: expect.anything(),
        })
      );
    });
  });
});
