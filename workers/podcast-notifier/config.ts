/**
 * Podcast Notifier Worker Configuration
 *
 * Configuration constants for the background worker that checks podcast feeds
 * for new episodes and sends push notifications to subscribed users.
 */

/**
 * Refresh interval in milliseconds (60 minutes)
 */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * HTTP fetch configuration
 */
export const FETCH_CONFIG = {
  /** User agent for RSS feed requests */
  userAgent: 'BitTorrented-Podcast-Worker/1.0',

  /** Request timeout in milliseconds */
  timeout: 30_000,

  /** Max retries for failed fetches */
  maxRetries: 3,

  /** Base delay for exponential backoff (ms) */
  retryBaseDelay: 1000,
} as const;

/**
 * Processing configuration
 */
export const PROCESSING_CONFIG = {
  /** Number of podcasts to process in parallel */
  batchSize: 10,

  /** Max episodes to store per podcast (oldest beyond this are ignored) */
  maxEpisodesPerPodcast: 500,

  /** Delay between notification sends to avoid rate limiting (ms) */
  notificationDelay: 100,
} as const;

/**
 * Logging prefix
 */
export const LOG_PREFIX = '[Podcast-Notifier]';
