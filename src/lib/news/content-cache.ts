/**
 * News Article Content Cache
 *
 * Caches extracted article content (via Readability) in Redis
 * to avoid repeated fetching and extraction.
 *
 * TTL: 24 hours (longer than summaries since content doesn't change)
 */

import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Extracted article content structure
 */
export interface ArticleContent {
  title: string;
  byline: string | null;
  content: string; // HTML content from Readability
  textContent: string; // Plain text content
  excerpt: string | null;
  siteName: string | null;
  length: number;
  extractedAt: number;
  fetchMethod: 'fetch' | 'puppeteer';
}

/**
 * Cached content with metadata
 */
interface CachedContent {
  data: ArticleContent;
  cachedAt: number;
  url: string;
}

/**
 * Cache TTL in seconds (24 hours)
 */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Redis key prefix for article content
 */
const KEY_PREFIX = 'news:content:';

/**
 * Generate a cache key from a URL
 */
function getCacheKey(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `${KEY_PREFIX}${hash}`;
}

/**
 * News Article Content Cache class
 */
export class NewsContentCache {
  private redis: Redis | null = null;
  private redisUrl: string | null;
  private isConnected = false;
  private connectionError: Error | null = null;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl ?? process.env.REDIS_URL ?? null;
  }

  /**
   * Initialize Redis connection lazily
   */
  private async ensureConnection(): Promise<Redis | null> {
    if (!this.redisUrl) {
      return null;
    }

    if (this.redis && this.isConnected) {
      return this.redis;
    }

    if (this.connectionError) {
      return null;
    }

    if (!this.redis) {
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 1) return null;
          return 100;
        },
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redis.on('error', (err) => {
        if (!this.connectionError) {
          this.connectionError = err;
          this.isConnected = false;
        }
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.connectionError = null;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
      });
    }

    try {
      await this.redis.connect();
      this.isConnected = true;
      return this.redis;
    } catch (error) {
      this.connectionError = error instanceof Error ? error : new Error(String(error));
      return null;
    }
  }

  /**
   * Check if cache is available
   */
  async isAvailable(): Promise<boolean> {
    const redis = await this.ensureConnection();
    return redis !== null;
  }

  /**
   * Get cached content for a URL
   */
  async get(url: string): Promise<ArticleContent | null> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return null;
    }

    try {
      const key = getCacheKey(url);
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      const cached = JSON.parse(data) as CachedContent;
      return cached.data;
    } catch (error) {
      console.error('[NewsContentCache] Error getting cached content:', error);
      return null;
    }
  }

  /**
   * Store content in cache
   */
  async set(url: string, content: ArticleContent): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return false;
    }

    try {
      const key = getCacheKey(url);
      const cached: CachedContent = {
        data: content,
        cachedAt: Date.now(),
        url,
      };

      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(cached));
      return true;
    } catch (error) {
      console.error('[NewsContentCache] Error caching content:', error);
      return false;
    }
  }

  /**
   * Delete cached content
   */
  async delete(url: string): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return false;
    }

    try {
      const key = getCacheKey(url);
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('[NewsContentCache] Error deleting cached content:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }
}

/**
 * Singleton instance
 */
let cacheInstance: NewsContentCache | null = null;

/**
 * Get the news content cache singleton
 */
export function getNewsContentCache(): NewsContentCache {
  if (!cacheInstance) {
    cacheInstance = new NewsContentCache();
  }
  return cacheInstance;
}
