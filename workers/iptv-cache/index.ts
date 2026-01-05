#!/usr/bin/env npx tsx

/**
 * IPTV Cache Worker
 *
 * Background worker that caches all active IPTV playlists and EPG data
 * in Redis for instant loading. Runs on a configurable refresh interval.
 *
 * Usage:
 *   pnpm iptv-worker          # Production mode
 *   pnpm iptv-worker:dev      # Development mode with watch
 *
 * Environment variables:
 *   - REDIS_URL: Redis connection string (required)
 *   - SUPABASE_URL: Supabase project URL (required)
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (required)
 */

import { config } from 'dotenv';

// Load environment variables
config();

import { REFRESH_INTERVAL_MS, LOG_PREFIX } from './config';
import { RedisStorage } from './redis-storage';
import {
  fetchActivePlaylists,
  fetchAndParsePlaylist,
  createWorkerSupabaseClient,
} from './playlist-fetcher';
import { fetchAndParseEpg, isValidEpgUrl } from './epg-fetcher';
import type { CachedPlaylistMeta, IptvPlaylist } from './types';

/**
 * Maximum time to process a single playlist (10 minutes)
 * This prevents a single slow/hanging playlist from blocking the entire worker
 */
const PLAYLIST_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Worker state
 */
let isRunning = false;
let isShuttingDown = false;
let refreshTimer: NodeJS.Timeout | null = null;
let storage: RedisStorage | null = null;

/**
 * Process a single playlist
 */
async function processPlaylist(
  playlist: IptvPlaylist,
  storage: RedisStorage
): Promise<{ success: boolean; channelCount: number; programCount: number }> {
  console.log(`${LOG_PREFIX} Processing playlist: ${playlist.name} (${playlist.id})`);

  // Fetch and parse M3U
  const playlistResult = await fetchAndParsePlaylist(playlist.m3u_url);

  if (!playlistResult.success || !playlistResult.channels) {
    console.error(
      `${LOG_PREFIX} Failed to fetch playlist ${playlist.name}: ${playlistResult.error}`
    );
    await storage.logError(
      `Playlist ${playlist.name}: ${playlistResult.error}`
    );
    return { success: false, channelCount: 0, programCount: 0 };
  }

  // Build metadata
  const meta: Omit<CachedPlaylistMeta, 'channelCount' | 'groupCount'> = {
    playlistId: playlist.id,
    userId: playlist.user_id,
    name: playlist.name,
    m3uUrl: playlist.m3u_url,
    epgUrl: playlist.epg_url,
    fetchedAt: Date.now(),
    hasEpg: false,
  };

  // Store playlist data
  await storage.storePlaylist(
    playlist.id,
    meta,
    playlistResult.channels,
    playlistResult.groups ?? []
  );

  let programCount = 0;

  // Fetch and parse EPG if available
  if (playlist.epg_url && isValidEpgUrl(playlist.epg_url)) {
    const epgResult = await fetchAndParseEpg(playlist.epg_url);

    if (epgResult.success && epgResult.programs) {
      await storage.storeEpg(
        playlist.id,
        epgResult.channels ?? {},
        epgResult.programs
      );
      programCount = epgResult.programs.length;

      // Update metadata with EPG info
      const updatedMeta: Omit<CachedPlaylistMeta, 'channelCount' | 'groupCount'> = {
        ...meta,
        hasEpg: true,
        epgFetchedAt: Date.now(),
      };

      await storage.storePlaylist(
        playlist.id,
        updatedMeta,
        playlistResult.channels,
        playlistResult.groups ?? []
      );

      console.log(
        `${LOG_PREFIX} Cached EPG: ${programCount} programs for ${playlist.name}`
      );
    } else {
      console.warn(
        `${LOG_PREFIX} Failed to fetch EPG for ${playlist.name}: ${epgResult.error}`
      );
    }
  }

  console.log(
    `${LOG_PREFIX} Cached playlist: ${playlistResult.channels.length} channels, ${playlistResult.groups?.length ?? 0} groups`
  );

  return {
    success: true,
    channelCount: playlistResult.channels.length,
    programCount,
  };
}

/**
 * Main refresh cycle
 */
async function refreshAllPlaylists(): Promise<void> {
  if (isShuttingDown) {
    console.log(`${LOG_PREFIX} Shutdown in progress, skipping refresh`);
    return;
  }

  if (isRunning) {
    console.log(`${LOG_PREFIX} Previous refresh still running, skipping`);
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  console.log(`${LOG_PREFIX} Starting refresh cycle...`);

  try {
    if (!storage) {
      throw new Error('Redis storage not initialized');
    }

    await storage.updateWorkerStatus({
      state: 'running',
      startedAt: startTime,
    });

    // Fetch all active playlists
    const supabase = createWorkerSupabaseClient();
    const playlists = await fetchActivePlaylists(supabase);

    console.log(`${LOG_PREFIX} Found ${playlists.length} active playlists`);

    let successCount = 0;
    let failCount = 0;
    let totalChannels = 0;
    let totalPrograms = 0;

    // Process playlists sequentially to avoid overwhelming providers
    for (const playlist of playlists) {
      if (isShuttingDown) {
        console.log(`${LOG_PREFIX} Shutdown requested, stopping refresh`);
        break;
      }

      try {
        const result = await withTimeout(
          processPlaylist(playlist, storage),
          PLAYLIST_TIMEOUT_MS,
          `Playlist ${playlist.name} timed out after ${PLAYLIST_TIMEOUT_MS / 1000 / 60} minutes`
        );

        if (result.success) {
          successCount++;
          totalChannels += result.channelCount;
          totalPrograms += result.programCount;
        } else {
          failCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`${LOG_PREFIX} Failed to process playlist ${playlist.name}: ${errorMessage}`);
        await storage.logError(`Playlist ${playlist.name}: ${errorMessage}`);
        failCount++;
      }
    }

    const duration = Date.now() - startTime;
    const nextRun = Date.now() + REFRESH_INTERVAL_MS;

    await storage.updateWorkerStatus({
      state: 'idle',
      lastSuccessfulRun: Date.now(),
      nextRun,
      playlistsProcessed: successCount,
      playlistsFailed: failCount,
      totalChannels,
      totalPrograms,
    });

    await storage.updateLastRun();

    console.log(
      `${LOG_PREFIX} Refresh complete: ${successCount}/${playlists.length} playlists, ` +
        `${totalChannels} channels, ${totalPrograms} EPG programs ` +
        `(${Math.round(duration / 1000)}s)`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Refresh failed:`, errorMessage);

    if (storage) {
      await storage.updateWorkerStatus({
        state: 'error',
        currentError: errorMessage,
      });
      await storage.logError(`Refresh cycle: ${errorMessage}`);
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule the next refresh
 */
function scheduleRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(async () => {
    await refreshAllPlaylists();
    scheduleRefresh();
  }, REFRESH_INTERVAL_MS);

  const nextRunTime = new Date(Date.now() + REFRESH_INTERVAL_MS);
  console.log(
    `${LOG_PREFIX} Next refresh scheduled at: ${nextRunTime.toISOString()}`
  );
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`${LOG_PREFIX} Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  // Clear scheduled refresh
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  // Wait for current operation to complete (max 30 seconds)
  const maxWait = 30000;
  const startWait = Date.now();

  while (isRunning && Date.now() - startWait < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Update status
  if (storage) {
    try {
      await storage.updateWorkerStatus({
        state: 'idle',
        currentError: undefined,
      });
      await storage.close();
    } catch {
      // Ignore errors during shutdown
    }
  }

  console.log(`${LOG_PREFIX} Shutdown complete`);
  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} Starting IPTV Cache Worker`);
  console.log(`${LOG_PREFIX} Refresh interval: ${REFRESH_INTERVAL_MS / 1000 / 60} minutes`);

  // Validate environment
  if (!process.env.REDIS_URL) {
    console.error(`${LOG_PREFIX} ERROR: REDIS_URL environment variable is required`);
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      `${LOG_PREFIX} ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`
    );
    process.exit(1);
  }

  // Initialize Redis connection
  try {
    storage = new RedisStorage();
    await storage.connect();
    console.log(`${LOG_PREFIX} Connected to Redis`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to connect to Redis:`, error);
    process.exit(1);
  }

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Run initial refresh
  console.log(`${LOG_PREFIX} Running initial refresh...`);
  await refreshAllPlaylists();

  // Schedule recurring refreshes
  scheduleRefresh();

  console.log(`${LOG_PREFIX} Worker is running. Press Ctrl+C to stop.`);
}

// Start the worker
main().catch((error) => {
  console.error(`${LOG_PREFIX} Fatal error:`, error);
  process.exit(1);
});
