/**
 * Playlist Cache Tests
 *
 * Tests for Redis-based M3U playlist caching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistCache, type CachedPlaylist } from './playlist-cache';
import type { Channel } from './m3u-parser';

// Mock ioredis with lazy connection support
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    quit: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

describe('PlaylistCache', () => {
  let cache: PlaylistCache;
  let mockRedis: {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  const testChannels: Channel[] = [
    { id: '1', name: 'ESPN HD', url: 'http://example.com/espn.m3u8', group: 'Sports' },
    { id: '2', name: 'CNN News', url: 'http://example.com/cnn.m3u8', group: 'News' },
  ];

  const testPlaylist: CachedPlaylist = {
    channels: testChannels,
    groups: ['Sports', 'News'],
    fetchedAt: Date.now(),
    m3uUrl: 'http://example.com/playlist.m3u',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const Redis = (await import('ioredis')).default;
    // Pass explicit Redis URL to enable caching in tests
    cache = new PlaylistCache('redis://localhost:6379');
    mockRedis = new Redis() as unknown as typeof mockRedis;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns cached playlist when found', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testPlaylist));

      const result = await cache.get('playlist-123');

      expect(mockRedis.get).toHaveBeenCalledWith('iptv:playlist:playlist-123');
      expect(result).toEqual(testPlaylist);
    });

    it('returns null when playlist not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cache.get('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await cache.get('playlist-123');

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      mockRedis.get.mockResolvedValueOnce('invalid json');

      const result = await cache.get('playlist-123');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores playlist with default TTL', async () => {
      mockRedis.setex.mockResolvedValueOnce('OK');

      await cache.set('playlist-123', testPlaylist);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'iptv:playlist:playlist-123',
        300, // 5 minutes default
        JSON.stringify(testPlaylist)
      );
    });

    it('stores playlist with custom TTL', async () => {
      mockRedis.setex.mockResolvedValueOnce('OK');

      await cache.set('playlist-123', testPlaylist, 600);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'iptv:playlist:playlist-123',
        600,
        JSON.stringify(testPlaylist)
      );
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should not throw
      await expect(cache.set('playlist-123', testPlaylist)).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes playlist from cache', async () => {
      mockRedis.del.mockResolvedValueOnce(1);

      await cache.delete('playlist-123');

      expect(mockRedis.del).toHaveBeenCalledWith('iptv:playlist:playlist-123');
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should not throw
      await expect(cache.delete('playlist-123')).resolves.toBeUndefined();
    });
  });

  describe('generateKey', () => {
    it('generates consistent key from M3U URL', () => {
      const key1 = PlaylistCache.generateKey('http://example.com/playlist.m3u');
      const key2 = PlaylistCache.generateKey('http://example.com/playlist.m3u');

      expect(key1).toBe(key2);
    });

    it('generates different keys for different URLs', () => {
      const key1 = PlaylistCache.generateKey('http://example.com/playlist1.m3u');
      const key2 = PlaylistCache.generateKey('http://example.com/playlist2.m3u');

      expect(key1).not.toBe(key2);
    });

    it('handles URLs with query parameters', () => {
      const key = PlaylistCache.generateKey('http://example.com/playlist.m3u?token=abc123');

      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });
  });

  describe('clearAll', () => {
    it('clears all playlist cache entries', async () => {
      mockRedis.keys.mockResolvedValueOnce(['iptv:playlist:1', 'iptv:playlist:2']);
      mockRedis.del.mockResolvedValueOnce(2);

      await cache.clearAll();

      expect(mockRedis.keys).toHaveBeenCalledWith('iptv:playlist:*');
      expect(mockRedis.del).toHaveBeenCalledWith('iptv:playlist:1', 'iptv:playlist:2');
    });

    it('handles empty cache gracefully', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);

      await cache.clearAll();

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.keys.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should not throw
      await expect(cache.clearAll()).resolves.toBeUndefined();
    });
  });
});
