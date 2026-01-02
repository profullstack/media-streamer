/**
 * Playlist Cache
 *
 * Redis-based caching for M3U playlists with 5-minute expiration.
 * Server-side only - never expose Redis to the client.
 *
 * Requires Redis to be running. Set REDIS_URL environment variable
 * or ensure Redis is available at localhost:6379.
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';
import type { Channel } from './m3u-parser';

/**
 * Cached playlist data structure
 */
export interface CachedPlaylist {
  /** Parsed channels from the M3U file */
  channels: Channel[];
  /** Unique groups extracted from channels */
  groups: string[];
  /** Timestamp when the playlist was fetched */
  fetchedAt: number;
  /** Original M3U URL */
  m3uUrl: string;
}

/**
 * Default cache TTL in seconds (5 minutes)
 */
const DEFAULT_TTL = 300;

/**
 * Redis key prefix for playlist cache
 */
const KEY_PREFIX = 'iptv:playlist:';

/**
 * Playlist cache service using Redis
 *
 * Uses lazy connection initialization to avoid errors during module load.
 */
export class PlaylistCache {
  private redis: Redis | null = null;
  private redisUrl: string;
  private isConnected = false;
  private connectionError: Error | null = null;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  }

  /**
   * Initialize Redis connection lazily
   */
  private async ensureConnection(): Promise<Redis | null> {
    if (this.redis && this.isConnected) {
      return this.redis;
    }

    if (this.connectionError) {
      // Don't retry if we already failed
      return null;
    }

    if (!this.redis) {
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 1) {
            return null; // Stop retrying after 1 attempt
          }
          return 100;
        },
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      // Handle connection errors
      this.redis.on('error', (err) => {
        if (!this.connectionError) {
          console.warn('[PlaylistCache] Redis connection error - caching disabled:', err.message);
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
      console.warn('[PlaylistCache] Failed to connect to Redis - caching disabled:', this.connectionError.message);
      return null;
    }
  }

  /**
   * Get a cached playlist by key
   *
   * @param key - Cache key (use generateKey to create from URL)
   * @returns Cached playlist or null if not found or Redis unavailable
   */
  async get(key: string): Promise<CachedPlaylist | null> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return null;
    }

    try {
      const data = await redis.get(`${KEY_PREFIX}${key}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as CachedPlaylist;
    } catch (error) {
      console.error('[PlaylistCache] Error getting cache:', error);
      return null;
    }
  }

  /**
   * Store a playlist in cache
   *
   * @param key - Cache key (use generateKey to create from URL)
   * @param playlist - Playlist data to cache
   * @param ttl - Time to live in seconds (default: 5 minutes)
   */
  async set(key: string, playlist: CachedPlaylist, ttl: number = DEFAULT_TTL): Promise<void> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return;
    }

    try {
      await redis.setex(
        `${KEY_PREFIX}${key}`,
        ttl,
        JSON.stringify(playlist)
      );
    } catch (error) {
      console.error('[PlaylistCache] Error setting cache:', error);
    }
  }

  /**
   * Delete a cached playlist
   *
   * @param key - Cache key to delete
   */
  async delete(key: string): Promise<void> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return;
    }

    try {
      await redis.del(`${KEY_PREFIX}${key}`);
    } catch (error) {
      console.error('[PlaylistCache] Error deleting cache:', error);
    }
  }

  /**
   * Clear all playlist cache entries
   */
  async clearAll(): Promise<void> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return;
    }

    try {
      const keys = await redis.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('[PlaylistCache] Error clearing cache:', error);
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Generate a cache key from an M3U URL
   *
   * @param m3uUrl - The M3U playlist URL
   * @returns A consistent cache key
   */
  static generateKey(m3uUrl: string): string {
    return createHash('sha256').update(m3uUrl).digest('hex').substring(0, 16);
  }
}

/**
 * Singleton instance for the playlist cache
 */
let cacheInstance: PlaylistCache | null = null;

/**
 * Get the playlist cache singleton
 *
 * @returns PlaylistCache instance
 */
export function getPlaylistCache(): PlaylistCache {
  if (!cacheInstance) {
    cacheInstance = new PlaylistCache();
  }
  return cacheInstance;
}
