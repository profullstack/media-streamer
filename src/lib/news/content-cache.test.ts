/**
 * News Content Cache Tests
 *
 * Tests for Redis-based article content caching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsContentCache, type ArticleContent } from './content-cache';

// Mock ioredis with lazy connection support
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    quit: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

describe('NewsContentCache', () => {
  let cache: NewsContentCache;
  let mockRedis: {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  const testContent: ArticleContent = {
    title: 'Test Article Title',
    byline: 'John Doe',
    content: '<p>This is the article content in HTML.</p>',
    textContent: 'This is the article content in plain text.',
    excerpt: 'A brief excerpt of the article.',
    siteName: 'Test News Site',
    length: 42,
    extractedAt: Date.now(),
    fetchMethod: 'fetch',
  };

  const testUrl = 'https://example.com/article/test-article';

  beforeEach(async () => {
    vi.clearAllMocks();
    const Redis = (await import('ioredis')).default;
    // Pass explicit Redis URL to enable caching in tests
    cache = new NewsContentCache('redis://localhost:6379');
    mockRedis = new Redis() as unknown as typeof mockRedis;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns cached content when found', async () => {
      const cachedData = {
        data: testContent,
        cachedAt: Date.now(),
        url: testUrl,
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await cache.get(testUrl);

      expect(mockRedis.get).toHaveBeenCalled();
      expect(result).toEqual(testContent);
    });

    it('returns null when content not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cache.get(testUrl);

      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await cache.get(testUrl);

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      mockRedis.get.mockResolvedValueOnce('invalid json {{{');

      const result = await cache.get(testUrl);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores content with 24-hour TTL', async () => {
      mockRedis.setex.mockResolvedValueOnce('OK');

      const result = await cache.set(testUrl, testContent);

      expect(mockRedis.setex).toHaveBeenCalled();
      const [, ttl] = mockRedis.setex.mock.calls[0];
      expect(ttl).toBe(24 * 60 * 60); // 24 hours in seconds
      expect(result).toBe(true);
    });

    it('stores content with URL in cache entry', async () => {
      mockRedis.setex.mockResolvedValueOnce('OK');

      await cache.set(testUrl, testContent);

      const [, , jsonString] = mockRedis.setex.mock.calls[0];
      const stored = JSON.parse(jsonString);
      expect(stored.url).toBe(testUrl);
      expect(stored.data).toEqual(testContent);
      expect(stored.cachedAt).toBeDefined();
    });

    it('returns false on Redis error', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await cache.set(testUrl, testContent);

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes content from cache', async () => {
      mockRedis.del.mockResolvedValueOnce(1);

      const result = await cache.delete(testUrl);

      expect(mockRedis.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false on Redis error', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await cache.delete(testUrl);

      expect(result).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('returns true when Redis is connected', async () => {
      const result = await cache.isAvailable();

      expect(result).toBe(true);
    });
  });

  describe('close', () => {
    it('closes Redis connection when connected', async () => {
      // Trigger a connection first by calling a method
      mockRedis.get.mockResolvedValueOnce(null);
      await cache.get(testUrl);

      mockRedis.quit.mockResolvedValueOnce('OK');
      await cache.close();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('cache key generation', () => {
    it('generates consistent keys for same URL', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.get(testUrl);
      await cache.get(testUrl);

      const key1 = mockRedis.get.mock.calls[0][0];
      const key2 = mockRedis.get.mock.calls[1][0];
      expect(key1).toBe(key2);
    });

    it('generates different keys for different URLs', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.get('https://example.com/article/1');
      await cache.get('https://example.com/article/2');

      const key1 = mockRedis.get.mock.calls[0][0];
      const key2 = mockRedis.get.mock.calls[1][0];
      expect(key1).not.toBe(key2);
    });

    it('uses news:content: prefix for keys', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.get(testUrl);

      const key = mockRedis.get.mock.calls[0][0];
      expect(key).toMatch(/^news:content:/);
    });
  });

  describe('with no Redis URL', () => {
    it('returns null for get when Redis is not configured', async () => {
      const cacheNoRedis = new NewsContentCache(undefined);
      // Override the redisUrl to simulate no Redis
      (cacheNoRedis as unknown as { redisUrl: null }).redisUrl = null;

      const result = await cacheNoRedis.get(testUrl);

      expect(result).toBeNull();
    });

    it('returns false for set when Redis is not configured', async () => {
      const cacheNoRedis = new NewsContentCache(undefined);
      (cacheNoRedis as unknown as { redisUrl: null }).redisUrl = null;

      const result = await cacheNoRedis.set(testUrl, testContent);

      expect(result).toBe(false);
    });
  });
});
