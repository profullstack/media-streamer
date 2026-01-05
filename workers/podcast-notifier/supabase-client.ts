/**
 * Supabase Client for Podcast Notifier Worker
 *
 * Database operations for fetching podcasts with subscriptions,
 * episodes, and users to notify.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/supabase/types';
import type { Podcast, PodcastEpisode, UserToNotify } from './types';
import { LOG_PREFIX } from './config';

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Create a Supabase client for the worker
 */
export function createWorkerSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get or create the Supabase client singleton
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    supabaseClient = createWorkerSupabaseClient();
  }
  return supabaseClient;
}

/**
 * Fetch all podcasts that have at least one subscription with notifications enabled
 */
export async function fetchSubscribedPodcasts(): Promise<Podcast[]> {
  const client = getSupabaseClient();

  // Get unique podcast IDs that have subscribers with notifications enabled
  const { data: subscriptions, error: subError } = await client
    .from('podcast_subscriptions')
    .select('podcast_id')
    .eq('notify_new_episodes', true);

  if (subError) {
    throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return [];
  }

  // Get unique podcast IDs
  const podcastIds = [...new Set(subscriptions.map(s => s.podcast_id))];

  // Fetch the podcasts
  const { data: podcasts, error: podcastError } = await client
    .from('podcasts')
    .select('*')
    .in('id', podcastIds);

  if (podcastError) {
    throw new Error(`Failed to fetch podcasts: ${podcastError.message}`);
  }

  return (podcasts ?? []) as Podcast[];
}

/**
 * Get the latest episode for a podcast from the database
 */
export async function getLatestEpisode(podcastId: string): Promise<PodcastEpisode | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('podcast_episodes')
    .select('*')
    .eq('podcast_id', podcastId)
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get latest episode: ${error.message}`);
  }

  return data as PodcastEpisode;
}

/**
 * Check if an episode with the given GUID already exists
 */
export async function episodeExists(podcastId: string, guid: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('podcast_episodes')
    .select('id')
    .eq('podcast_id', podcastId)
    .eq('guid', guid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return false;
    }
    throw new Error(`Failed to check episode existence: ${error.message}`);
  }

  return data !== null;
}

/**
 * Create a new episode in the database
 */
export async function createEpisode(episodeData: {
  podcast_id: string;
  guid: string;
  title: string;
  description: string | null;
  audio_url: string;
  duration_seconds: number | null;
  image_url: string | null;
  published_at: string;
  season_number: number | null;
  episode_number: number | null;
}): Promise<PodcastEpisode> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('podcast_episodes')
    .insert(episodeData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create episode: ${error.message}`);
  }

  return data as PodcastEpisode;
}

/**
 * Update podcast metadata after refresh
 */
export async function updatePodcastMetadata(
  podcastId: string,
  data: {
    episode_count?: number;
    last_episode_date?: string | null;
  }
): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client
    .from('podcasts')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', podcastId);

  if (error) {
    throw new Error(`Failed to update podcast: ${error.message}`);
  }
}

/**
 * Get users to notify about a new episode
 * Uses the RPC function that checks:
 * - User has subscription to this podcast
 * - User has notify_new_episodes = true
 * - User has active push subscriptions
 * - User hasn't already been notified about this episode
 */
export async function getUsersToNotify(
  podcastId: string,
  episodeId: string
): Promise<UserToNotify[]> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc('get_users_to_notify_new_episode', {
    p_podcast_id: podcastId,
    p_episode_id: episodeId,
  });

  if (error) {
    console.error(`${LOG_PREFIX} Failed to get users to notify:`, error.message);
    return [];
  }

  return (data ?? []) as UserToNotify[];
}

/**
 * Record a notification in the history table
 */
export async function recordNotification(data: {
  userId: string;
  notificationType: string;
  title: string;
  body: string;
  podcastId: string;
  episodeId: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
}): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.from('notification_history').insert({
    user_id: data.userId,
    notification_type: data.notificationType,
    title: data.title,
    body: data.body,
    podcast_id: data.podcastId,
    episode_id: data.episodeId,
    status: data.status,
    error_message: data.errorMessage ?? null,
    sent_at: data.status === 'sent' ? new Date().toISOString() : null,
  });

  if (error) {
    console.error(`${LOG_PREFIX} Failed to record notification:`, error.message);
  }
}

/**
 * Mark a push subscription as inactive (for expired/invalid subscriptions)
 */
export async function markPushSubscriptionInactive(endpoint: string): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint);

  if (error) {
    console.error(`${LOG_PREFIX} Failed to mark subscription inactive:`, error.message);
  }
}
