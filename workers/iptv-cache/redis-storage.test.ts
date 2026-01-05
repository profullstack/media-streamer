/**
 * Redis Storage Tests
 *
 * Tests for the worker's Redis storage operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Channel } from '../../src/lib/iptv/m3u-parser';
import type { CachedPlaylistMeta, EpgProgram } from './types';

// Mock ioredis
const mockPipeline = {
  setex: vi.fn().mockReturnThis(),
  del: vi.fn().mockReturnThis(),
  hset: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  sadd: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  rpush: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn().mockResolvedValue('OK'),
  hgetall: vi.fn(),
  hget: vi.fn(),
  hmget: vi.fn(),
  smembers: vi.fn(),
  mget: vi.fn(),
  zrangebyscore: vi.fn(),
  keys: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  lrange: vi.fn(),
  quit: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  pipeline: vi.fn(() => mockPipeline),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}));

describe('RedisStorage', () => {
  let RedisStorage: typeof import('./redis-storage').RedisStorage;
  let storage: import('./redis-storage').RedisStorage;

  const testChannels: Channel[] = [
    { id: 'ch1', name: 'ESPN HD', url: 'http://example.com/espn.m3u8', group: 'Sports' },
    { id: 'ch2', name: 'CNN News', url: 'http://example.com/cnn.m3u8', group: 'News' },
  ];

  const testMeta: Omit<CachedPlaylistMeta, 'channelCount' | 'groupCount'> = {
    playlistId: 'test-playlist',
    userId: 'user-123',
    name: 'Test Playlist',
    m3uUrl: 'http://example.com/playlist.m3u',
    epgUrl: 'http://example.com/epg.xml',
    fetchedAt: Date.now(),
    hasEpg: true,
  };

  const testPrograms: EpgProgram[] = [
    {
      channelId: 'ch1',
      start: Math.floor(Date.now() / 1000),
      stop: Math.floor(Date.now() / 1000) + 3600,
      title: 'Sports Center',
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset all mock implementations
    Object.keys(mockRedis).forEach(key => {
      if (typeof mockRedis[key as keyof typeof mockRedis] === 'function') {
        (mockRedis[key as keyof typeof mockRedis] as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mockRedis.connect.mockResolvedValue(undefined);
    mockRedis.on.mockImplementation(() => mockRedis);
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    // Reset pipeline mocks
    Object.keys(mockPipeline).forEach(key => {
      const fn = mockPipeline[key as keyof typeof mockPipeline];
      if (typeof fn === 'function') {
        fn.mockReset();
        if (key !== 'exec') {
          fn.mockReturnThis();
        } else {
          fn.mockResolvedValue([]);
        }
      }
    });

    // Dynamic import to get fresh module
    const module = await import('./redis-storage');
    RedisStorage = module.RedisStorage;

    // Set REDIS_URL for the test
    process.env.REDIS_URL = 'redis://localhost:6379';
    storage = new RedisStorage('redis://localhost:6379');
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
  });

  describe('storePlaylist', () => {
    it('stores playlist with channels and groups', async () => {
      await storage.storePlaylist('test-playlist', testMeta, testChannels, ['Sports', 'News']);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.setex).toHaveBeenCalled();
      expect(mockPipeline.hset).toHaveBeenCalled();
      expect(mockPipeline.sadd).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('Streaming Storage', () => {
    describe('beginPlaylistStream', () => {
      it('clears existing data and sets initial metadata', async () => {
        mockRedis.del.mockResolvedValue(1);

        await storage.beginPlaylistStream('test-playlist', testMeta);

        // Should delete existing channel and group keys
        expect(mockRedis.del).toHaveBeenCalledWith('iptv:worker:playlist:test-playlist:channels');
        expect(mockRedis.del).toHaveBeenCalledWith('iptv:worker:playlist:test-playlist:groups');
      });
    });

    describe('storeChannelBatch', () => {
      it('stores a batch of channels to Redis', async () => {
        await storage.storeChannelBatch('test-playlist', testChannels, 0);

        expect(mockRedis.pipeline).toHaveBeenCalled();
        expect(mockPipeline.hset).toHaveBeenCalled();
        expect(mockPipeline.sadd).toHaveBeenCalled();
        expect(mockPipeline.exec).toHaveBeenCalled();
      });

      it('stores channels grouped by their group field', async () => {
        await storage.storeChannelBatch('test-playlist', testChannels, 0);

        // Should add channel IDs to group sets
        expect(mockPipeline.sadd).toHaveBeenCalled();
      });

      it('handles empty batch gracefully', async () => {
        await storage.storeChannelBatch('test-playlist', [], 0);

        // Should not call pipeline for empty batch
        expect(mockPipeline.hset).not.toHaveBeenCalled();
      });

      it('logs progress for every 10th batch', async () => {
        const consoleSpy = vi.spyOn(console, 'log');

        // Batch 10 should log
        await storage.storeChannelBatch('test-playlist', testChannels, 10);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Stored batch 10')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('finalizePlaylistStream', () => {
      it('updates metadata with final counts', async () => {
        await storage.finalizePlaylistStream('test-playlist', testMeta, 1000, ['Sports', 'News']);

        expect(mockRedis.pipeline).toHaveBeenCalled();
        expect(mockPipeline.setex).toHaveBeenCalled();
        expect(mockPipeline.expire).toHaveBeenCalled();
        expect(mockPipeline.exec).toHaveBeenCalled();
      });

      it('sets TTL on all group keys', async () => {
        await storage.finalizePlaylistStream('test-playlist', testMeta, 100, ['Sports', 'News', 'Movies']);

        // Should set expire on channels key, groups key, and each group channel key
        expect(mockPipeline.expire).toHaveBeenCalled();
      });

      it('logs completion message with channel count', async () => {
        const consoleSpy = vi.spyOn(console, 'log');

        await storage.finalizePlaylistStream('test-playlist', testMeta, 1200000, ['Sports']);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('1,200,000 channels')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('Full streaming flow', () => {
      it('can store playlist in streaming mode', async () => {
        mockRedis.del.mockResolvedValue(1);

        // Begin stream
        await storage.beginPlaylistStream('test-playlist', testMeta);

        // Store batches
        await storage.storeChannelBatch('test-playlist', [testChannels[0]], 0);
        await storage.storeChannelBatch('test-playlist', [testChannels[1]], 1);

        // Finalize
        await storage.finalizePlaylistStream('test-playlist', testMeta, 2, ['Sports', 'News']);

        // Verify the flow completed
        expect(mockRedis.del).toHaveBeenCalled();
        expect(mockPipeline.hset).toHaveBeenCalled();
        expect(mockPipeline.setex).toHaveBeenCalled();
        expect(mockPipeline.expire).toHaveBeenCalled();
      });
    });
  });

  describe('getPlaylistMeta', () => {
    it('returns metadata when found', async () => {
      const fullMeta = { ...testMeta, channelCount: 2, groupCount: 2 };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(fullMeta));

      const result = await storage.getPlaylistMeta('test-playlist');

      expect(result).toEqual(fullMeta);
    });

    it('returns null when not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await storage.getPlaylistMeta('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getPlaylistChannels', () => {
    it('returns channels when found', async () => {
      const channelData: Record<string, string> = {};
      testChannels.forEach(ch => {
        channelData[ch.id] = JSON.stringify(ch);
      });
      mockRedis.hgetall.mockResolvedValueOnce(channelData);

      const result = await storage.getPlaylistChannels('test-playlist');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('ESPN HD');
    });

    it('returns empty array when not found', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const result = await storage.getPlaylistChannels('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getChannel', () => {
    it('returns channel when found', async () => {
      mockRedis.hget.mockResolvedValueOnce(JSON.stringify(testChannels[0]));

      const result = await storage.getChannel('test-playlist', 'ch1');

      expect(result?.name).toBe('ESPN HD');
    });

    it('returns null when not found', async () => {
      mockRedis.hget.mockResolvedValueOnce(null);

      const result = await storage.getChannel('test-playlist', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getPlaylistGroups', () => {
    it('returns groups when found', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['Sports', 'News']);

      const result = await storage.getPlaylistGroups('test-playlist');

      expect(result).toContain('Sports');
      expect(result).toContain('News');
    });
  });

  describe('getChannelsByGroup', () => {
    it('returns channels in group', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['ch1']);
      mockRedis.hmget.mockResolvedValueOnce([JSON.stringify(testChannels[0])]);

      const result = await storage.getChannelsByGroup('test-playlist', 'Sports');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ESPN HD');
    });

    it('returns empty array when no channels', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const result = await storage.getChannelsByGroup('test-playlist', 'Empty');

      expect(result).toEqual([]);
    });
  });

  describe('storeEpg', () => {
    it('stores EPG programs', async () => {
      await storage.storeEpg('test-playlist', {}, testPrograms);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('getCurrentProgram', () => {
    it('returns current program when found', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testPrograms[0]));

      const result = await storage.getCurrentProgram('test-playlist', 'ch1');

      expect(result?.title).toBe('Sports Center');
    });

    it('returns null when not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await storage.getCurrentProgram('test-playlist', 'ch1');

      expect(result).toBeNull();
    });
  });

  describe('getChannelPrograms', () => {
    it('returns programs in time range', async () => {
      mockRedis.zrangebyscore.mockResolvedValueOnce([JSON.stringify(testPrograms[0])]);

      const result = await storage.getChannelPrograms('test-playlist', 'ch1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Sports Center');
    });
  });

  describe('getCurrentPrograms', () => {
    it('returns programs for multiple channels', async () => {
      mockRedis.mget.mockResolvedValueOnce([JSON.stringify(testPrograms[0]), null]);

      const result = await storage.getCurrentPrograms('test-playlist', ['ch1', 'ch2']);

      expect(result['ch1']?.title).toBe('Sports Center');
      expect(result['ch2']).toBeNull();
    });

    it('returns empty object for empty list', async () => {
      const result = await storage.getCurrentPrograms('test-playlist', []);

      expect(result).toEqual({});
    });
  });

  describe('updateWorkerStatus', () => {
    it('updates status', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.set.mockResolvedValueOnce('OK');

      await storage.updateWorkerStatus({ state: 'running' });

      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('getWorkerStatus', () => {
    it('returns status when found', async () => {
      const status = {
        state: 'idle',
        startedAt: Date.now(),
        playlistsProcessed: 5,
        playlistsFailed: 0,
        totalChannels: 100,
        totalPrograms: 1000,
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(status));

      const result = await storage.getWorkerStatus();

      expect(result?.state).toBe('idle');
    });

    it('returns null when not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await storage.getWorkerStatus();

      expect(result).toBeNull();
    });
  });

  describe('updateLastRun', () => {
    it('updates last run timestamp', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      await storage.updateLastRun();

      expect(mockRedis.set).toHaveBeenCalledWith(
        'iptv:worker:last_run',
        expect.any(String)
      );
    });
  });

  describe('getLastRun', () => {
    it('returns timestamp when found', async () => {
      const timestamp = Date.now();
      mockRedis.get.mockResolvedValueOnce(timestamp.toString());

      const result = await storage.getLastRun();

      expect(result).toBe(timestamp);
    });

    it('returns null when not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await storage.getLastRun();

      expect(result).toBeNull();
    });
  });

  describe('logError', () => {
    it('logs error to list', async () => {
      mockRedis.lpush.mockResolvedValueOnce(1);
      mockRedis.ltrim.mockResolvedValueOnce('OK');

      await storage.logError('Test error');

      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalledWith('iptv:worker:errors', 0, 99);
    });
  });

  describe('getRecentErrors', () => {
    it('returns recent errors', async () => {
      const errors = [
        { timestamp: Date.now(), message: 'Error 1' },
        { timestamp: Date.now(), message: 'Error 2' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(errors.map(e => JSON.stringify(e)));

      const result = await storage.getRecentErrors(10);

      expect(result).toHaveLength(2);
      expect(result[0].message).toBe('Error 1');
    });
  });

  describe('isPlaylistCached', () => {
    it('returns true when cached', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);

      const result = await storage.isPlaylistCached('test-playlist');

      expect(result).toBe(true);
    });

    it('returns false when not cached', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);

      const result = await storage.isPlaylistCached('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getCachedPlaylistIds', () => {
    it('returns list of cached playlist IDs', async () => {
      mockRedis.keys.mockResolvedValueOnce([
        'iptv:worker:playlist:abc:meta',
        'iptv:worker:playlist:xyz:meta',
      ]);

      const result = await storage.getCachedPlaylistIds();

      expect(result).toContain('abc');
      expect(result).toContain('xyz');
    });
  });

  describe('clearAll', () => {
    it('clears all worker cache', async () => {
      mockRedis.keys.mockResolvedValueOnce(['iptv:worker:key1', 'iptv:worker:key2']);
      mockRedis.del.mockResolvedValueOnce(2);

      await storage.clearAll();

      expect(mockRedis.keys).toHaveBeenCalledWith('iptv:worker:*');
      expect(mockRedis.del).toHaveBeenCalledWith('iptv:worker:key1', 'iptv:worker:key2');
    });

    it('handles empty cache', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);

      await storage.clearAll();

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
