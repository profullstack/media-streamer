/**
 * Playlist Cache
 * 
 * Redis-based caching for M3U playlists with 5-minute expiration.
 * Server-side only - never expose Redis to the client.
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
 */
export class PlaylistCache {
  private redis: Redis;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
    });
  }

  /**
   * Get a cached playlist by key
   * 
   * @param key - Cache key (use generateKey to create from URL)
   * @returns Cached playlist or null if not found
   */
  async get(key: string): Promise<CachedPlaylist | null> {
    try {
      const data = await this.redis.get(`${KEY_PREFIX}${key}`);
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
    try {
      await this.redis.setex(
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
    try {
      await this.redis.del(`${KEY_PREFIX}${key}`);
    } catch (error) {
      console.error('[PlaylistCache] Error deleting cache:', error);
    }
  }

  /**
   * Clear all playlist cache entries
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('[PlaylistCache] Error clearing cache:', error);
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
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
