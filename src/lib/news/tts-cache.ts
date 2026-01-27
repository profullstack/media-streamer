/**
 * News TTS Audio Cache
 *
 * Caches ElevenLabs-generated audio for news summaries in Redis.
 * Uses SHA256 hash of article URL as key to ensure unique, reproducible keys.
 *
 * TTL: 8 hours (same as summary cache)
 */

import Redis from 'ioredis';
import crypto from 'crypto';

/**
 * Cached audio with metadata
 */
interface CachedAudio {
  /** Base64 encoded audio data */
  data: string;
  /** MIME type */
  mimeType: string;
  /** Cache timestamp */
  cachedAt: number;
  /** Original URL */
  url: string;
}

/**
 * Cache TTL in seconds (8 hours - same as summary cache)
 */
const CACHE_TTL_SECONDS = 8 * 60 * 60;

/**
 * Redis key prefix for TTS audio
 */
const KEY_PREFIX = 'news:tts:';

/**
 * Generate a cache key from a URL
 */
function getCacheKey(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  return `${KEY_PREFIX}${hash}`;
}

/**
 * Get the hash portion of the cache key (for URL routing)
 */
export function getAudioHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

/**
 * News TTS Cache class
 */
export class NewsTTSCache {
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
   * Check if audio exists for a URL
   */
  async has(url: string): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return false;
    }

    try {
      const key = getCacheKey(url);
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('[NewsTTSCache] Error checking cache:', error);
      return false;
    }
  }

  /**
   * Get cached audio for a URL
   */
  async get(url: string): Promise<Buffer | null> {
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

      const cached = JSON.parse(data) as CachedAudio;
      return Buffer.from(cached.data, 'base64');
    } catch (error) {
      console.error('[NewsTTSCache] Error getting cached audio:', error);
      return null;
    }
  }

  /**
   * Get cached audio by hash
   */
  async getByHash(hash: string): Promise<Buffer | null> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return null;
    }

    try {
      const key = `${KEY_PREFIX}${hash}`;
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      const cached = JSON.parse(data) as CachedAudio;
      return Buffer.from(cached.data, 'base64');
    } catch (error) {
      console.error('[NewsTTSCache] Error getting cached audio by hash:', error);
      return null;
    }
  }

  /**
   * Store audio in cache
   */
  async set(url: string, audioData: Buffer, mimeType = 'audio/mpeg'): Promise<boolean> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return false;
    }

    try {
      const key = getCacheKey(url);
      const cached: CachedAudio = {
        data: audioData.toString('base64'),
        mimeType,
        cachedAt: Date.now(),
        url,
      };

      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(cached));
      console.log('[NewsTTSCache] Cached audio for:', url, 'size:', audioData.length, 'bytes');
      return true;
    } catch (error) {
      console.error('[NewsTTSCache] Error caching audio:', error);
      return false;
    }
  }

  /**
   * Delete cached audio
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
      console.error('[NewsTTSCache] Error deleting cached audio:', error);
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
let cacheInstance: NewsTTSCache | null = null;

/**
 * Get the news TTS cache singleton
 */
export function getNewsTTSCache(): NewsTTSCache {
  if (!cacheInstance) {
    cacheInstance = new NewsTTSCache();
  }
  return cacheInstance;
}

/**
 * Get the relative URL path for serving cached audio
 */
export function getAudioUrl(url: string): string {
  const hash = getAudioHash(url);
  return `/api/news/tts/audio/${hash}`;
}
