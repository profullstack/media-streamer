/**
 * Redis Storage for IPTV Cache Worker
 *
 * Handles all Redis operations for storing and managing
 * cached playlist and EPG data.
 */

import Redis from 'ioredis';
import { REDIS_KEYS, CACHE_TTL_SECONDS, LOG_PREFIX } from './config';
import type {
  Channel,
  CachedPlaylistMeta,
  EpgProgram,
  EpgChannel,
  WorkerStatus,
} from './types';

/**
 * Redis storage manager for the IPTV cache worker
 */
export class RedisStorage {
  private redis: Redis;
  private isConnected = false;

  constructor(redisUrl?: string) {
    const url = redisUrl ?? process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is required');
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          console.error(`${LOG_PREFIX} Redis connection failed after 5 retries`);
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      this.isConnected = true;
      console.log(`${LOG_PREFIX} Connected to Redis`);
    });

    this.redis.on('error', (err) => {
      console.error(`${LOG_PREFIX} Redis error:`, err.message);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.redis.connect();
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  /**
   * Check if connected to Redis
   */
  isReady(): boolean {
    return this.isConnected;
  }

  // ============================================================================
  // Playlist Storage
  // ============================================================================

  /**
   * Store a complete playlist with channels and groups
   */
  async storePlaylist(
    playlistId: string,
    meta: Omit<CachedPlaylistMeta, 'channelCount' | 'groupCount'>,
    channels: Channel[],
    groups: string[]
  ): Promise<void> {
    const pipeline = this.redis.pipeline();

    // Store metadata
    const fullMeta: CachedPlaylistMeta = {
      ...meta,
      channelCount: channels.length,
      groupCount: groups.length,
    };
    pipeline.setex(
      REDIS_KEYS.playlistMeta(playlistId),
      CACHE_TTL_SECONDS,
      JSON.stringify(fullMeta)
    );

    // Store channels as hash
    const channelsKey = REDIS_KEYS.playlistChannels(playlistId);
    pipeline.del(channelsKey);
    if (channels.length > 0) {
      const channelData: Record<string, string> = {};
      for (const channel of channels) {
        channelData[channel.id] = JSON.stringify(channel);
      }
      pipeline.hset(channelsKey, channelData);
      pipeline.expire(channelsKey, CACHE_TTL_SECONDS);
    }

    // Store groups as set
    const groupsKey = REDIS_KEYS.playlistGroups(playlistId);
    pipeline.del(groupsKey);
    if (groups.length > 0) {
      pipeline.sadd(groupsKey, ...groups);
      pipeline.expire(groupsKey, CACHE_TTL_SECONDS);
    }

    // Store channel IDs by group for efficient filtering
    const groupChannels = new Map<string, string[]>();
    for (const channel of channels) {
      if (channel.group) {
        const existing = groupChannels.get(channel.group) ?? [];
        existing.push(channel.id);
        groupChannels.set(channel.group, existing);
      }
    }

    for (const [group, channelIds] of groupChannels) {
      const groupKey = REDIS_KEYS.playlistGroupChannels(playlistId, group);
      pipeline.del(groupKey);
      pipeline.sadd(groupKey, ...channelIds);
      pipeline.expire(groupKey, CACHE_TTL_SECONDS);
    }

    await pipeline.exec();
  }

  /**
   * Get playlist metadata
   */
  async getPlaylistMeta(playlistId: string): Promise<CachedPlaylistMeta | null> {
    const data = await this.redis.get(REDIS_KEYS.playlistMeta(playlistId));
    if (!data) return null;
    return JSON.parse(data) as CachedPlaylistMeta;
  }

  /**
   * Get all channels for a playlist
   */
  async getPlaylistChannels(playlistId: string): Promise<Channel[]> {
    const data = await this.redis.hgetall(REDIS_KEYS.playlistChannels(playlistId));
    if (!data || Object.keys(data).length === 0) return [];
    return Object.values(data).map((json) => JSON.parse(json) as Channel);
  }

  /**
   * Get a specific channel by ID
   */
  async getChannel(playlistId: string, channelId: string): Promise<Channel | null> {
    const data = await this.redis.hget(
      REDIS_KEYS.playlistChannels(playlistId),
      channelId
    );
    if (!data) return null;
    return JSON.parse(data) as Channel;
  }

  /**
   * Get all groups for a playlist
   */
  async getPlaylistGroups(playlistId: string): Promise<string[]> {
    return this.redis.smembers(REDIS_KEYS.playlistGroups(playlistId));
  }

  /**
   * Get channels by group
   */
  async getChannelsByGroup(playlistId: string, group: string): Promise<Channel[]> {
    const channelIds = await this.redis.smembers(
      REDIS_KEYS.playlistGroupChannels(playlistId, group)
    );
    if (channelIds.length === 0) return [];

    const channelsKey = REDIS_KEYS.playlistChannels(playlistId);
    const channelData = await this.redis.hmget(channelsKey, ...channelIds);

    return channelData
      .filter((data): data is string => data !== null)
      .map((json) => JSON.parse(json) as Channel);
  }

  // ============================================================================
  // EPG Storage
  // ============================================================================

  /**
   * Store EPG data for a playlist
   */
  async storeEpg(
    playlistId: string,
    channels: Record<string, EpgChannel>,
    programs: EpgProgram[]
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    const now = Math.floor(Date.now() / 1000);

    // Group programs by channel
    const programsByChannel = new Map<string, EpgProgram[]>();
    for (const program of programs) {
      const existing = programsByChannel.get(program.channelId) ?? [];
      existing.push(program);
      programsByChannel.set(program.channelId, existing);
    }

    // Store programs by channel as sorted sets (score = start time)
    for (const [channelId, channelPrograms] of programsByChannel) {
      const key = REDIS_KEYS.epgByChannel(playlistId, channelId);
      pipeline.del(key);

      const members: (string | number)[] = [];
      for (const program of channelPrograms) {
        members.push(program.start, JSON.stringify(program));
      }
      if (members.length > 0) {
        pipeline.zadd(key, ...members);
        pipeline.expire(key, CACHE_TTL_SECONDS);
      }

      // Store current program (now playing)
      const currentProgram = channelPrograms.find(
        (p) => p.start <= now && p.stop > now
      );
      if (currentProgram) {
        pipeline.setex(
          REDIS_KEYS.epgNow(playlistId, channelId),
          CACHE_TTL_SECONDS,
          JSON.stringify(currentProgram)
        );
      }
    }

    // Store all programs as a list for bulk access
    const allProgramsKey = REDIS_KEYS.epgPrograms(playlistId);
    pipeline.del(allProgramsKey);
    if (programs.length > 0) {
      pipeline.rpush(allProgramsKey, ...programs.map((p) => JSON.stringify(p)));
      pipeline.expire(allProgramsKey, CACHE_TTL_SECONDS);
    }

    await pipeline.exec();
  }

  /**
   * Get current program (now playing) for a channel
   */
  async getCurrentProgram(
    playlistId: string,
    channelId: string
  ): Promise<EpgProgram | null> {
    const data = await this.redis.get(REDIS_KEYS.epgNow(playlistId, channelId));
    if (!data) return null;
    return JSON.parse(data) as EpgProgram;
  }

  /**
   * Get programs for a channel within a time range
   */
  async getChannelPrograms(
    playlistId: string,
    channelId: string,
    fromTime?: number,
    toTime?: number
  ): Promise<EpgProgram[]> {
    const key = REDIS_KEYS.epgByChannel(playlistId, channelId);
    const min = fromTime?.toString() ?? '-inf';
    const max = toTime?.toString() ?? '+inf';

    const data = await this.redis.zrangebyscore(key, min, max);
    return data.map((json) => JSON.parse(json) as EpgProgram);
  }

  /**
   * Get current programs for multiple channels
   */
  async getCurrentPrograms(
    playlistId: string,
    channelIds: string[]
  ): Promise<Record<string, EpgProgram | null>> {
    if (channelIds.length === 0) return {};

    const keys = channelIds.map((id) => REDIS_KEYS.epgNow(playlistId, id));
    const data = await this.redis.mget(...keys);

    const result: Record<string, EpgProgram | null> = {};
    for (let i = 0; i < channelIds.length; i++) {
      const item = data[i];
      result[channelIds[i]] = item ? (JSON.parse(item) as EpgProgram) : null;
    }
    return result;
  }

  // ============================================================================
  // Worker Status
  // ============================================================================

  /**
   * Update worker status
   */
  async updateWorkerStatus(status: Partial<WorkerStatus>): Promise<void> {
    const existing = await this.getWorkerStatus();
    const updated: WorkerStatus = {
      state: 'idle',
      startedAt: Date.now(),
      playlistsProcessed: 0,
      playlistsFailed: 0,
      totalChannels: 0,
      totalPrograms: 0,
      ...existing,
      ...status,
    };
    await this.redis.set(REDIS_KEYS.workerStatus, JSON.stringify(updated));
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(): Promise<WorkerStatus | null> {
    const data = await this.redis.get(REDIS_KEYS.workerStatus);
    if (!data) return null;
    return JSON.parse(data) as WorkerStatus;
  }

  /**
   * Update last successful run timestamp
   */
  async updateLastRun(): Promise<void> {
    await this.redis.set(REDIS_KEYS.lastRun, Date.now().toString());
  }

  /**
   * Get last successful run timestamp
   */
  async getLastRun(): Promise<number | null> {
    const data = await this.redis.get(REDIS_KEYS.lastRun);
    return data ? parseInt(data, 10) : null;
  }

  /**
   * Log an error (keeps last 100 errors)
   */
  async logError(error: string): Promise<void> {
    const errorEntry = JSON.stringify({
      timestamp: Date.now(),
      message: error,
    });
    await this.redis.lpush(REDIS_KEYS.errors, errorEntry);
    await this.redis.ltrim(REDIS_KEYS.errors, 0, 99);
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(limit = 10): Promise<Array<{ timestamp: number; message: string }>> {
    const data = await this.redis.lrange(REDIS_KEYS.errors, 0, limit - 1);
    return data.map((json) => JSON.parse(json));
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Check if a playlist is cached
   */
  async isPlaylistCached(playlistId: string): Promise<boolean> {
    const exists = await this.redis.exists(REDIS_KEYS.playlistMeta(playlistId));
    return exists === 1;
  }

  /**
   * Get all cached playlist IDs
   */
  async getCachedPlaylistIds(): Promise<string[]> {
    const pattern = 'iptv:worker:playlist:*:meta';
    const keys = await this.redis.keys(pattern);
    return keys.map((key) => {
      const match = key.match(/iptv:worker:playlist:([^:]+):meta/);
      return match ? match[1] : '';
    }).filter(Boolean);
  }

  /**
   * Clear all worker cache data
   */
  async clearAll(): Promise<void> {
    const pattern = `${REDIS_KEYS.PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Singleton instance
 */
let storageInstance: RedisStorage | null = null;

/**
 * Get the Redis storage singleton
 */
export function getRedisStorage(): RedisStorage {
  if (!storageInstance) {
    storageInstance = new RedisStorage();
  }
  return storageInstance;
}
