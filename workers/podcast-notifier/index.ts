#!/usr/bin/env npx tsx

/**
 * Podcast Notifier Worker
 *
 * Background worker that checks podcast RSS feeds for new episodes
 * and sends push notifications to subscribed users.
 *
 * Usage:
 *   pnpm podcast-worker          # Production mode
 *   pnpm podcast-worker:dev      # Development mode with watch
 *
 * Environment variables:
 *   - SUPABASE_URL: Supabase project URL (required)
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (required)
 *   - VAPID_PUBLIC_KEY: VAPID public key for web push (required)
 *   - VAPID_PRIVATE_KEY: VAPID private key for web push (required)
 *   - VAPID_SUBJECT: VAPID subject (optional, defaults to mailto:admin@example.com)
 */

import { config } from 'dotenv';

// Load environment variables
config();

import { REFRESH_INTERVAL_MS, PROCESSING_CONFIG, LOG_PREFIX } from './config';
import {
  fetchSubscribedPodcasts,
  episodeExists,
  createEpisode,
  updatePodcastMetadata,
  getUsersToNotify,
} from './supabase-client';
import { fetchPodcastFeed } from './podcast-fetcher';
import { sendNewEpisodeNotifications } from './notification-sender';
import type { Podcast, PodcastEpisode, PodcastProcessResult } from './types';

/**
 * Worker state
 */
let isRunning = false;
let isShuttingDown = false;
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Process a single podcast - check for new episodes and notify users
 */
async function processPodcast(podcast: Podcast): Promise<PodcastProcessResult> {
  const result: PodcastProcessResult = {
    podcastId: podcast.id,
    podcastTitle: podcast.title,
    success: false,
    newEpisodesFound: 0,
    notificationsSent: 0,
  };

  try {
    console.log(`${LOG_PREFIX} Checking podcast: ${podcast.title}`);

    // Fetch and parse the RSS feed
    const parsedFeed = await fetchPodcastFeed(podcast.feed_url);

    if (!parsedFeed) {
      result.error = 'Failed to fetch or parse feed';
      return result;
    }

    // Check each episode from newest to oldest
    const newEpisodes: PodcastEpisode[] = [];

    for (const episode of parsedFeed.episodes) {
      // Check if episode already exists in database
      const exists = await episodeExists(podcast.id, episode.guid);

      if (exists) {
        // Stop checking older episodes once we hit a known one
        break;
      }

      // Create new episode in database
      try {
        const createdEpisode = await createEpisode({
          podcast_id: podcast.id,
          guid: episode.guid,
          title: episode.title,
          description: episode.description,
          audio_url: episode.audioUrl,
          duration_seconds: episode.durationSeconds,
          image_url: episode.imageUrl,
          published_at: episode.publishedAt.toISOString(),
          season_number: episode.seasonNumber,
          episode_number: episode.episodeNumber,
        });
        newEpisodes.push(createdEpisode);
        console.log(`${LOG_PREFIX} New episode found: "${episode.title}"`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to create episode "${episode.title}":`, error);
      }
    }

    result.newEpisodesFound = newEpisodes.length;

    // Update podcast metadata
    if (newEpisodes.length > 0 || parsedFeed.episodes.length > 0) {
      await updatePodcastMetadata(podcast.id, {
        episode_count: parsedFeed.episodes.length,
        last_episode_date: parsedFeed.episodes[0]?.publishedAt.toISOString() ?? null,
      });
    }

    // Send notifications for new episodes
    for (const episode of newEpisodes) {
      // Get users to notify (with active push subscriptions and notifications enabled)
      const usersToNotify = await getUsersToNotify(podcast.id, episode.id);

      if (usersToNotify.length > 0) {
        console.log(
          `${LOG_PREFIX} Notifying ${usersToNotify.length} users about "${episode.title}"`
        );

        const { sent, failed } = await sendNewEpisodeNotifications(
          podcast,
          episode,
          usersToNotify
        );

        result.notificationsSent += sent;

        if (sent > 0) {
          console.log(
            `${LOG_PREFIX} Sent ${sent} notifications for "${episode.title}"` +
              (failed > 0 ? ` (${failed} failed)` : '')
          );
        }
      }
    }

    result.success = true;

    if (newEpisodes.length > 0) {
      console.log(
        `${LOG_PREFIX} Processed ${podcast.title}: ${newEpisodes.length} new episodes, ` +
          `${result.notificationsSent} notifications sent`
      );
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Error processing ${podcast.title}:`, result.error);
    return result;
  }
}

/**
 * Process podcasts in batches
 */
async function processPodcastBatch(podcasts: Podcast[]): Promise<PodcastProcessResult[]> {
  const results: PodcastProcessResult[] = [];

  // Process in batches
  for (let i = 0; i < podcasts.length; i += PROCESSING_CONFIG.batchSize) {
    if (isShuttingDown) {
      console.log(`${LOG_PREFIX} Shutdown requested, stopping batch processing`);
      break;
    }

    const batch = podcasts.slice(i, i + PROCESSING_CONFIG.batchSize);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((podcast) => processPodcast(podcast))
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Main refresh cycle
 */
async function refreshAllPodcasts(): Promise<void> {
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
    // Fetch all podcasts with subscribers who have notifications enabled
    const podcasts = await fetchSubscribedPodcasts();

    if (podcasts.length === 0) {
      console.log(`${LOG_PREFIX} No podcasts with notification-enabled subscriptions found`);
      return;
    }

    console.log(`${LOG_PREFIX} Found ${podcasts.length} podcasts to check`);

    // Process all podcasts
    const results = await processPodcastBatch(podcasts);

    // Summarize results
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const totalNewEpisodes = results.reduce((sum, r) => sum + r.newEpisodesFound, 0);
    const totalNotifications = results.reduce((sum, r) => sum + r.notificationsSent, 0);
    const duration = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX} Refresh complete: ` +
        `${successCount}/${podcasts.length} podcasts, ` +
        `${totalNewEpisodes} new episodes, ` +
        `${totalNotifications} notifications sent ` +
        `(${Math.round(duration / 1000)}s)`
    );

    if (failCount > 0) {
      console.log(`${LOG_PREFIX} ${failCount} podcasts failed to process`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Refresh failed:`, errorMessage);
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
    await refreshAllPodcasts();
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

  console.log(`${LOG_PREFIX} Shutdown complete`);
  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} Starting Podcast Notifier Worker`);
  console.log(`${LOG_PREFIX} Refresh interval: ${REFRESH_INTERVAL_MS / 1000 / 60} minutes`);

  // Validate environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      `${LOG_PREFIX} ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`
    );
    process.exit(1);
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error(
      `${LOG_PREFIX} ERROR: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required`
    );
    process.exit(1);
  }

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Run initial refresh
  console.log(`${LOG_PREFIX} Running initial refresh...`);
  await refreshAllPodcasts();

  // Schedule recurring refreshes
  scheduleRefresh();

  console.log(`${LOG_PREFIX} Worker is running. Press Ctrl+C to stop.`);
}

// Start the worker
main().catch((error) => {
  console.error(`${LOG_PREFIX} Fatal error:`, error);
  process.exit(1);
});
