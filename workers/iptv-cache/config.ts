/**
 * IPTV Cache Worker Configuration
 *
 * Configuration constants for the background worker that caches
 * IPTV playlists and EPG data in Redis.
 */

/**
 * Refresh interval in milliseconds (15 minutes)
 */
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Cache TTL in seconds (20 minutes = refresh + 5 min buffer)
 */
export const CACHE_TTL_SECONDS = 20 * 60;

/**
 * Redis key prefixes for worker cache
 * Using separate prefix from existing playlist cache to avoid conflicts
 */
export const REDIS_KEYS = {
  /** Prefix for all worker keys */
  PREFIX: 'iptv:worker:',

  /** Playlist metadata (fetchedAt, channelCount, etc.) */
  playlistMeta: (playlistId: string) => `iptv:worker:playlist:${playlistId}:meta`,

  /** Channels hash (channelId -> JSON) */
  playlistChannels: (playlistId: string) => `iptv:worker:playlist:${playlistId}:channels`,

  /** Groups set */
  playlistGroups: (playlistId: string) => `iptv:worker:playlist:${playlistId}:groups`,

  /** Channels by group (set of channel IDs) */
  playlistGroupChannels: (playlistId: string, group: string) =>
    `iptv:worker:playlist:${playlistId}:group:${encodeURIComponent(group)}`,

  /** EPG programs for a playlist */
  epgPrograms: (playlistId: string) => `iptv:worker:epg:${playlistId}:programs`,

  /** Current program for a channel */
  epgNow: (playlistId: string, channelId: string) =>
    `iptv:worker:epg:${playlistId}:now:${channelId}`,

  /** EPG by channel (sorted set with score = start time) */
  epgByChannel: (playlistId: string, channelId: string) =>
    `iptv:worker:epg:${playlistId}:channel:${channelId}`,

  /** Worker status */
  workerStatus: 'iptv:worker:status',

  /** Last successful run timestamp */
  lastRun: 'iptv:worker:last_run',

  /** Recent errors list */
  errors: 'iptv:worker:errors',
} as const;

/**
 * HTTP fetch configuration
 */
export const FETCH_CONFIG = {
  /** User agent for M3U/EPG requests */
  userAgent: 'Mozilla/5.0 (compatible; BitTorrented-IPTV-Worker/1.0)',

  /** Request timeout in milliseconds */
  timeout: 60_000,

  /** Max retries for failed fetches */
  maxRetries: 3,

  /** Base delay for exponential backoff (ms) */
  retryBaseDelay: 1000,
} as const;

/**
 * EPG parsing configuration
 */
export const EPG_CONFIG = {
  /** Maximum EPG entries to store per playlist */
  maxProgramsPerPlaylist: 50_000,

  /** How far into the future to store EPG (24 hours) */
  maxFutureHours: 24,

  /** How far into the past to store EPG (2 hours for catchup context) */
  maxPastHours: 2,
} as const;

/**
 * Logging configuration
 */
export const LOG_PREFIX = '[IPTV-Worker]';
