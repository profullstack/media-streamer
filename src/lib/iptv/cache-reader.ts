/**
 * IPTV Cache Reader
 *
 * Reads cached playlist and EPG data from Redis that was
 * populated by the IPTV cache worker.
 *
 * This is used by API routes for fast reads.
 */

import Redis from 'ioredis';
import type { Channel } from './m3u-parser';

/**
 * Redis key prefixes (must match worker config)
 */
const REDIS_KEYS = {
  playlistMeta: (playlistId: string) => `iptv:worker:playlist:${playlistId}:meta`,
  playlistChannels: (playlistId: string) => `iptv:worker:playlist:${playlistId}:channels`,
  playlistGroups: (playlistId: string) => `iptv:worker:playlist:${playlistId}:groups`,
  playlistGroupChannels: (playlistId: string, group: string) =>
    `iptv:worker:playlist:${playlistId}:group:${encodeURIComponent(group)}`,
  epgNow: (playlistId: string, channelId: string) =>
    `iptv:worker:epg:${playlistId}:now:${channelId}`,
  epgByChannel: (playlistId: string, channelId: string) =>
    `iptv:worker:epg:${playlistId}:channel:${channelId}`,
  workerStatus: 'iptv:worker:status',
  lastRun: 'iptv:worker:last_run',
};

/**
 * Cached playlist metadata
 */
export interface CachedPlaylistMeta {
  playlistId: string;
  userId: string;
  name: string;
  m3uUrl: string;
  epgUrl: string | null;
  fetchedAt: number;
  channelCount: number;
  groupCount: number;
  hasEpg: boolean;
  epgFetchedAt?: number;
  lastError?: string;
}

/**
 * EPG program entry
 */
export interface EpgProgram {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  description?: string;
  category?: string;
  episode?: string;
  icon?: string;
}

/**
 * Worker status
 */
export interface WorkerStatus {
  state: 'idle' | 'running' | 'error';
  startedAt: number;
  lastSuccessfulRun?: number;
  nextRun?: number;
  playlistsProcessed: number;
  playlistsFailed: number;
  totalChannels: number;
  totalPrograms: number;
  currentError?: string;
}

/**
 * Cache read result
 */
export interface CacheReadResult<T> {
  success: boolean;
  data?: T;
  cached: boolean;
  fetchedAt?: number;
  error?: string;
}

/**
 * IPTV Cache Reader class
 */
export class IptvCacheReader {
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
   * Get playlist metadata
   */
  async getPlaylistMeta(playlistId: string): Promise<CacheReadResult<CachedPlaylistMeta>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const data = await redis.get(REDIS_KEYS.playlistMeta(playlistId));
      if (!data) {
        return { success: false, cached: false, error: 'Not cached' };
      }

      const meta = JSON.parse(data) as CachedPlaylistMeta;
      return {
        success: true,
        data: meta,
        cached: true,
        fetchedAt: meta.fetchedAt,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all channels for a playlist
   */
  async getPlaylistChannels(playlistId: string): Promise<CacheReadResult<Channel[]>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const data = await redis.hgetall(REDIS_KEYS.playlistChannels(playlistId));
      if (!data || Object.keys(data).length === 0) {
        return { success: false, cached: false, error: 'Not cached' };
      }

      const channels = Object.values(data).map((json) => JSON.parse(json) as Channel);
      return {
        success: true,
        data: channels,
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get groups for a playlist
   */
  async getPlaylistGroups(playlistId: string): Promise<CacheReadResult<string[]>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const groups = await redis.smembers(REDIS_KEYS.playlistGroups(playlistId));
      if (groups.length === 0) {
        return { success: false, cached: false, error: 'Not cached' };
      }

      return {
        success: true,
        data: groups.sort(),
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get channels by group
   */
  async getChannelsByGroup(
    playlistId: string,
    group: string
  ): Promise<CacheReadResult<Channel[]>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const channelIds = await redis.smembers(
        REDIS_KEYS.playlistGroupChannels(playlistId, group)
      );
      if (channelIds.length === 0) {
        return { success: true, data: [], cached: true };
      }

      const channelData = await redis.hmget(
        REDIS_KEYS.playlistChannels(playlistId),
        ...channelIds
      );

      const channels = channelData
        .filter((data): data is string => data !== null)
        .map((json) => JSON.parse(json) as Channel);

      return {
        success: true,
        data: channels,
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current program (now playing) for a channel
   */
  async getCurrentProgram(
    playlistId: string,
    channelId: string
  ): Promise<CacheReadResult<EpgProgram>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const data = await redis.get(REDIS_KEYS.epgNow(playlistId, channelId));
      if (!data) {
        return { success: false, cached: false, error: 'No EPG data' };
      }

      return {
        success: true,
        data: JSON.parse(data) as EpgProgram,
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current programs for multiple channels
   */
  async getCurrentPrograms(
    playlistId: string,
    channelIds: string[]
  ): Promise<CacheReadResult<Record<string, EpgProgram | null>>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    if (channelIds.length === 0) {
      return { success: true, data: {}, cached: true };
    }

    try {
      const keys = channelIds.map((id) => REDIS_KEYS.epgNow(playlistId, id));
      const data = await redis.mget(...keys);

      const result: Record<string, EpgProgram | null> = {};
      for (let i = 0; i < channelIds.length; i++) {
        const item = data[i];
        result[channelIds[i]] = item ? (JSON.parse(item) as EpgProgram) : null;
      }

      return {
        success: true,
        data: result,
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get programs for a channel within a time range
   */
  async getChannelPrograms(
    playlistId: string,
    channelId: string,
    fromTime?: number,
    toTime?: number
  ): Promise<CacheReadResult<EpgProgram[]>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const key = REDIS_KEYS.epgByChannel(playlistId, channelId);
      const min = fromTime?.toString() ?? '-inf';
      const max = toTime?.toString() ?? '+inf';

      const data = await redis.zrangebyscore(key, min, max);

      return {
        success: true,
        data: data.map((json) => JSON.parse(json) as EpgProgram),
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(): Promise<CacheReadResult<WorkerStatus>> {
    const redis = await this.ensureConnection();
    if (!redis) {
      return { success: false, cached: false, error: 'Redis not available' };
    }

    try {
      const data = await redis.get(REDIS_KEYS.workerStatus);
      if (!data) {
        return { success: false, cached: false, error: 'No status data' };
      }

      return {
        success: true,
        data: JSON.parse(data) as WorkerStatus,
        cached: true,
      };
    } catch (error) {
      return {
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get last run timestamp
   */
  async getLastRun(): Promise<number | null> {
    const redis = await this.ensureConnection();
    if (!redis) return null;

    try {
      const data = await redis.get(REDIS_KEYS.lastRun);
      return data ? parseInt(data, 10) : null;
    } catch {
      return null;
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
let readerInstance: IptvCacheReader | null = null;

/**
 * Get the cache reader singleton
 */
export function getIptvCacheReader(): IptvCacheReader {
  if (!readerInstance) {
    readerInstance = new IptvCacheReader();
  }
  return readerInstance;
}
