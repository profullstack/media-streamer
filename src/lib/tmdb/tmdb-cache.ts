/**
 * TMDB Response Cache
 *
 * Redis-backed cache for TMDB API responses.
 * TTL tiers:
 * - List endpoints (upcoming/now_playing/on_the_air): 6 hours
 * - Detail/credits lookups: 24 hours
 * - Aggregated API responses: 30 minutes
 */

import Redis from 'ioredis';
import crypto from 'crypto';

export const CACHE_TTL = {
  LIST: 6 * 60 * 60,       // 6 hours
  DETAIL: 24 * 60 * 60,    // 24 hours
  RESPONSE: 30 * 60,       // 30 minutes
  SEARCH: 15 * 60,         // 15 minutes
} as const;

const KEY_PREFIX = 'tmdb:';

function getCacheKey(namespace: string, identifier: string): string {
  const hash = crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  return `${KEY_PREFIX}${namespace}:${hash}`;
}

/**
 * TMDB Redis Cache
 */
export class TMDBCache {
  private redis: Redis | null = null;
  private redisUrl: string | null;
  private isConnected = false;
  private connectionError: Error | null = null;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl ?? process.env.REDIS_URL ?? null;
  }

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

  async get<T>(namespace: string, identifier: string): Promise<T | null> {
    const redis = await this.ensureConnection();
    if (!redis) return null;

    try {
      const key = getCacheKey(namespace, identifier);
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error('[TMDBCache] Error getting cached data:', error);
      return null;
    }
  }

  async set<T>(namespace: string, identifier: string, data: T, ttlSeconds: number): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) return false;

    try {
      const key = getCacheKey(namespace, identifier);
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('[TMDBCache] Error caching data:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }
}

let cacheInstance: TMDBCache | null = null;

export function getTMDBCache(): TMDBCache {
  if (!cacheInstance) {
    cacheInstance = new TMDBCache();
  }
  return cacheInstance;
}
