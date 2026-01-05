/**
 * IPTV Cache Worker Types
 *
 * Type definitions for the IPTV playlist and EPG caching system.
 */

import type { Channel } from '../../src/lib/iptv/m3u-parser';

/**
 * Re-export Channel type from m3u-parser for convenience
 */
export type { Channel };

/**
 * IPTV playlist from database
 */
export interface IptvPlaylist {
  id: string;
  user_id: string;
  name: string;
  m3u_url: string;
  epg_url: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Cached playlist metadata stored in Redis
 */
export interface CachedPlaylistMeta {
  /** Playlist ID from database */
  playlistId: string;
  /** User ID who owns the playlist */
  userId: string;
  /** Playlist name */
  name: string;
  /** Original M3U URL */
  m3uUrl: string;
  /** EPG URL if available */
  epgUrl: string | null;
  /** When the playlist was last fetched */
  fetchedAt: number;
  /** Total number of channels */
  channelCount: number;
  /** Number of unique groups */
  groupCount: number;
  /** Whether EPG data is available */
  hasEpg: boolean;
  /** EPG fetch timestamp (if available) */
  epgFetchedAt?: number;
  /** Error message if last fetch failed */
  lastError?: string;
}

/**
 * EPG program entry
 */
export interface EpgProgram {
  /** Channel ID (matches tvg-id from M3U) */
  channelId: string;
  /** Program start time (Unix timestamp in seconds) */
  start: number;
  /** Program end time (Unix timestamp in seconds) */
  stop: number;
  /** Program title */
  title: string;
  /** Program description */
  description?: string;
  /** Program category/genre */
  category?: string;
  /** Episode info (e.g., "S01E05") */
  episode?: string;
  /** Program icon/poster URL */
  icon?: string;
}

/**
 * EPG channel info from XMLTV
 */
export interface EpgChannel {
  /** Channel ID from XMLTV */
  id: string;
  /** Display name */
  displayName: string;
  /** Channel icon URL */
  icon?: string;
}

/**
 * Complete EPG data for a playlist
 */
export interface CachedEpgData {
  /** Playlist ID */
  playlistId: string;
  /** When EPG was fetched */
  fetchedAt: number;
  /** Channel info from XMLTV */
  channels: Record<string, EpgChannel>;
  /** Number of programs cached */
  programCount: number;
}

/**
 * Worker status stored in Redis
 */
export interface WorkerStatus {
  /** Current state */
  state: 'idle' | 'running' | 'error';
  /** When the worker started */
  startedAt: number;
  /** Last successful run timestamp */
  lastSuccessfulRun?: number;
  /** Next scheduled run timestamp */
  nextRun?: number;
  /** Number of playlists being processed */
  playlistsProcessed: number;
  /** Number of playlists that failed */
  playlistsFailed: number;
  /** Total channels cached */
  totalChannels: number;
  /** Total EPG programs cached */
  totalPrograms: number;
  /** Current error if any */
  currentError?: string;
}

/**
 * Result from fetching and parsing a playlist
 */
export interface PlaylistFetchResult {
  /** Whether fetch was successful */
  success: boolean;
  /** Parsed channels (if successful) */
  channels?: Channel[];
  /** Unique groups (if successful) */
  groups?: string[];
  /** Error message (if failed) */
  error?: string;
  /** Fetch duration in ms */
  durationMs: number;
}

/**
 * Result from fetching and parsing EPG
 */
export interface EpgFetchResult {
  /** Whether fetch was successful */
  success: boolean;
  /** Parsed programs (if successful) */
  programs?: EpgProgram[];
  /** Channel info (if successful) */
  channels?: Record<string, EpgChannel>;
  /** Error message (if failed) */
  error?: string;
  /** Fetch duration in ms */
  durationMs: number;
}

/**
 * Cache reader response for playlist data
 */
export interface CachedPlaylistResponse {
  /** Playlist metadata */
  meta: CachedPlaylistMeta;
  /** All channels */
  channels: Channel[];
  /** All groups */
  groups: string[];
}

/**
 * Cache reader response for EPG data
 */
export interface CachedEpgResponse {
  /** Playlist ID */
  playlistId: string;
  /** When EPG was last fetched */
  fetchedAt: number;
  /** Programs for requested channels/time range */
  programs: EpgProgram[];
  /** Whether data is from cache */
  cached: boolean;
}

/**
 * Current program response (now playing)
 */
export interface NowPlayingResponse {
  /** Playlist ID */
  playlistId: string;
  /** Current programs keyed by channel ID */
  programs: Record<string, EpgProgram | null>;
  /** When data was fetched */
  fetchedAt: number;
}
