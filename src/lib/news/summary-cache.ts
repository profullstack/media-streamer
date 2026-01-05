/**
 * News Summary Cache
 *
 * Caches AI-generated article summaries in Redis to avoid
 * incurring AI costs on every view.
 *
 * TTL: 8 hours
 */

import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Article summary data structure
 */
export interface ArticleSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  images: string[];
  publishedDate: string | null;
  author: string | null;
  source: string | null;
}

/**
 * Cached summary with metadata
 */
interface CachedSummary {
  data: ArticleSummary;
  cachedAt: number;
  url: string;
}

/**
 * Cache TTL in seconds (8 hours)
 */
const CACHE_TTL_SECONDS = 8 * 60 * 60;

/**
 * Redis key prefix for news summaries
 */
const KEY_PREFIX = 'news:summary:';

/**
 * Generate a cache key from a URL
 */
function getCacheKey(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `${KEY_PREFIX}${hash}`;
}

/**
 * News Summary Cache class
 */
export class NewsSummaryCache {
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
   * Get a cached summary for a URL
   */
  async get(url: string): Promise<ArticleSummary | null> {
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

      const cached = JSON.parse(data) as CachedSummary;
      return cached.data;
    } catch (error) {
      console.error('[NewsSummaryCache] Error getting cached summary:', error);
      return null;
    }
  }

  /**
   * Store a summary in cache
   */
  async set(url: string, summary: ArticleSummary): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return false;
    }

    try {
      const key = getCacheKey(url);
      const cached: CachedSummary = {
        data: summary,
        cachedAt: Date.now(),
        url,
      };

      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(cached));
      return true;
    } catch (error) {
      console.error('[NewsSummaryCache] Error caching summary:', error);
      return false;
    }
  }

  /**
   * Delete a cached summary
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
      console.error('[NewsSummaryCache] Error deleting cached summary:', error);
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
let cacheInstance: NewsSummaryCache | null = null;

/**
 * Get the news summary cache singleton
 */
export function getNewsSummaryCache(): NewsSummaryCache {
  if (!cacheInstance) {
    cacheInstance = new NewsSummaryCache();
  }
  return cacheInstance;
}
