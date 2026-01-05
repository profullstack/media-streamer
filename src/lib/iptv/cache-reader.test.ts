/**
 * IPTV Cache Reader Tests
 *
 * Tests for reading IPTV cache data from Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IptvCacheReader, type CachedPlaylistMeta, type EpgProgram } from './cache-reader';
import type { Channel } from './m3u-parser';

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(),
    hgetall: vi.fn(),
    hmget: vi.fn(),
    smembers: vi.fn(),
    mget: vi.fn(),
    zrangebyscore: vi.fn(),
    quit: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

describe('IptvCacheReader', () => {
  let reader: IptvCacheReader;
  let mockRedis: {
    get: ReturnType<typeof vi.fn>;
    hgetall: ReturnType<typeof vi.fn>;
    hmget: ReturnType<typeof vi.fn>;
    smembers: ReturnType<typeof vi.fn>;
    mget: ReturnType<typeof vi.fn>;
    zrangebyscore: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  const testMeta: CachedPlaylistMeta = {
    playlistId: 'test-playlist',
    userId: 'user-123',
    name: 'Test Playlist',
    m3uUrl: 'http://example.com/playlist.m3u',
    epgUrl: 'http://example.com/epg.xml',
    fetchedAt: Date.now(),
    channelCount: 100,
    groupCount: 5,
    hasEpg: true,
  };

  const testChannels: Channel[] = [
    { id: 'ch1', name: 'ESPN HD', url: 'http://example.com/espn.m3u8', group: 'Sports' },
    { id: 'ch2', name: 'CNN News', url: 'http://example.com/cnn.m3u8', group: 'News' },
  ];

  const testProgram: EpgProgram = {
    channelId: 'ch1',
    start: Math.floor(Date.now() / 1000),
    stop: Math.floor(Date.now() / 1000) + 3600,
    title: 'Sports Center',
    description: 'Live sports news',
    category: 'Sports',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const Redis = (await import('ioredis')).default;
    reader = new IptvCacheReader('redis://localhost:6379');
    mockRedis = new Redis() as unknown as typeof mockRedis;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlaylistMeta', () => {
    it('returns metadata when found', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testMeta));

      const result = await reader.getPlaylistMeta('test-playlist');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testMeta);
      expect(result.cached).toBe(true);
    });

    it('returns error when not cached', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await reader.getPlaylistMeta('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not cached');
    });

    it('handles Redis errors', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await reader.getPlaylistMeta('test-playlist');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');
    });
  });

  describe('getPlaylistChannels', () => {
    it('returns channels when found', async () => {
      const channelData: Record<string, string> = {};
      testChannels.forEach(ch => {
        channelData[ch.id] = JSON.stringify(ch);
      });
      mockRedis.hgetall.mockResolvedValueOnce(channelData);

      const result = await reader.getPlaylistChannels('test-playlist');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.cached).toBe(true);
    });

    it('returns error when not cached', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const result = await reader.getPlaylistChannels('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not cached');
    });
  });

  describe('getPlaylistGroups', () => {
    it('returns groups when found', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['Sports', 'News', 'Movies']);

      const result = await reader.getPlaylistGroups('test-playlist');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['Movies', 'News', 'Sports']); // sorted
      expect(result.cached).toBe(true);
    });

    it('returns error when not cached', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const result = await reader.getPlaylistGroups('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not cached');
    });
  });

  describe('getChannelsByGroup', () => {
    it('returns channels for group', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['ch1']);
      mockRedis.hmget.mockResolvedValueOnce([JSON.stringify(testChannels[0])]);

      const result = await reader.getChannelsByGroup('test-playlist', 'Sports');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].name).toBe('ESPN HD');
    });

    it('returns empty array when no channels in group', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const result = await reader.getChannelsByGroup('test-playlist', 'Empty');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('getCurrentProgram', () => {
    it('returns current program when found', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testProgram));

      const result = await reader.getCurrentProgram('test-playlist', 'ch1');

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Sports Center');
      expect(result.cached).toBe(true);
    });

    it('returns error when no EPG data', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await reader.getCurrentProgram('test-playlist', 'ch1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No EPG data');
    });
  });

  describe('getCurrentPrograms', () => {
    it('returns programs for multiple channels', async () => {
      mockRedis.mget.mockResolvedValueOnce([
        JSON.stringify(testProgram),
        null,
      ]);

      const result = await reader.getCurrentPrograms('test-playlist', ['ch1', 'ch2']);

      expect(result.success).toBe(true);
      expect(result.data?.['ch1']?.title).toBe('Sports Center');
      expect(result.data?.['ch2']).toBeNull();
    });

    it('returns empty object for empty channel list', async () => {
      const result = await reader.getCurrentPrograms('test-playlist', []);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe('getChannelPrograms', () => {
    it('returns programs within time range', async () => {
      mockRedis.zrangebyscore.mockResolvedValueOnce([JSON.stringify(testProgram)]);

      const result = await reader.getChannelPrograms('test-playlist', 'ch1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].title).toBe('Sports Center');
    });

    it('supports time range filtering', async () => {
      mockRedis.zrangebyscore.mockResolvedValueOnce([]);

      const from = Math.floor(Date.now() / 1000);
      const to = from + 3600;
      const result = await reader.getChannelPrograms('test-playlist', 'ch1', from, to);

      expect(result.success).toBe(true);
      expect(mockRedis.zrangebyscore).toHaveBeenCalledWith(
        expect.any(String),
        from.toString(),
        to.toString()
      );
    });
  });

  describe('getWorkerStatus', () => {
    it('returns worker status when found', async () => {
      const status = {
        state: 'idle',
        startedAt: Date.now(),
        playlistsProcessed: 5,
        playlistsFailed: 0,
        totalChannels: 500,
        totalPrograms: 10000,
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(status));

      const result = await reader.getWorkerStatus();

      expect(result.success).toBe(true);
      expect(result.data?.state).toBe('idle');
      expect(result.data?.totalChannels).toBe(500);
    });

    it('returns error when no status', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await reader.getWorkerStatus();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No status data');
    });
  });

  describe('getLastRun', () => {
    it('returns timestamp when found', async () => {
      const timestamp = Date.now();
      mockRedis.get.mockResolvedValueOnce(timestamp.toString());

      const result = await reader.getLastRun();

      expect(result).toBe(timestamp);
    });

    it('returns null when not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await reader.getLastRun();

      expect(result).toBeNull();
    });
  });
});
