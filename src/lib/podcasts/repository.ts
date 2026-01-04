/**
 * Podcast Repository
 * 
 * Server-side repository for managing podcasts, subscriptions, and episodes in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  Podcast,
  PodcastInsert,
  PodcastSubscription,
  PodcastEpisode,
  PodcastEpisodeInsert,
  PodcastListenProgress,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * User subscription with podcast details from RPC function
 */
export interface UserPodcastSubscription {
  subscription_id: string;
  podcast_id: string;
  podcast_title: string;
  podcast_author: string | null;
  podcast_description: string | null;
  podcast_image_url: string | null;
  podcast_feed_url: string;
  podcast_website_url: string | null;
  notify_new_episodes: boolean;
  latest_episode_title: string | null;
  latest_episode_published_at: string | null;
  unlistened_count: number;
  subscribed_at: string;
}

/**
 * User to notify about new episode
 */
export interface UserToNotify {
  user_id: string;
  push_endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

/**
 * Listen progress update data
 */
export interface ListenProgressUpdate {
  user_id: string;
  episode_id: string;
  current_time_seconds: number;
  duration_seconds?: number;
  percentage?: number;
  completed?: boolean;
}

/**
 * Podcast repository interface
 */
export interface PodcastRepository {
  // Podcast operations
  getPodcastByFeedUrl(feedUrl: string): Promise<Podcast | null>;
  getPodcastById(id: string): Promise<Podcast | null>;
  createPodcast(data: PodcastInsert): Promise<Podcast>;
  upsertPodcast(data: PodcastInsert): Promise<Podcast>;
  updatePodcast(id: string, data: Partial<PodcastInsert>): Promise<Podcast>;

  // Subscription operations
  subscribeToPodcast(userId: string, podcastId: string, notifyNewEpisodes?: boolean): Promise<PodcastSubscription>;
  unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void>;
  getUserSubscriptions(userId: string): Promise<UserPodcastSubscription[]>;
  updateSubscriptionNotifications(subscriptionId: string, notifyNewEpisodes: boolean): Promise<PodcastSubscription>;
  isUserSubscribed(userId: string, podcastId: string): Promise<boolean>;

  // Episode operations
  createEpisode(data: PodcastEpisodeInsert): Promise<PodcastEpisode>;
  getEpisodesByPodcast(podcastId: string, limit?: number, offset?: number): Promise<PodcastEpisode[]>;
  getEpisodeByGuid(podcastId: string, guid: string): Promise<PodcastEpisode | null>;

  // Listen progress operations
  updateListenProgress(data: ListenProgressUpdate): Promise<PodcastListenProgress>;
  getListenProgress(userId: string, episodeId: string): Promise<PodcastListenProgress | null>;

  // Notification operations
  getUsersToNotify(podcastId: string, episodeId: string): Promise<UserToNotify[]>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create a podcast repository instance
 */
export function createPodcastRepository(
  client: SupabaseClient<Database>
): PodcastRepository {
  return {
    /**
     * Get podcast by feed URL
     */
    async getPodcastByFeedUrl(feedUrl: string): Promise<Podcast | null> {
      const { data, error } = await client
        .from('podcasts')
        .select('*')
        .eq('feed_url', feedUrl)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get podcast by ID
     */
    async getPodcastById(id: string): Promise<Podcast | null> {
      const { data, error } = await client
        .from('podcasts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Create a new podcast
     */
    async createPodcast(data: PodcastInsert): Promise<Podcast> {
      const { data: podcast, error } = await client
        .from('podcasts')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return podcast;
    },

    /**
     * Upsert podcast by feed_url
     */
    async upsertPodcast(data: PodcastInsert): Promise<Podcast> {
      const { data: podcast, error } = await client
        .from('podcasts')
        .upsert(data, { onConflict: 'feed_url' })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return podcast;
    },

    /**
     * Update podcast
     */
    async updatePodcast(id: string, data: Partial<PodcastInsert>): Promise<Podcast> {
      const { data: podcast, error } = await client
        .from('podcasts')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return podcast;
    },

    /**
     * Subscribe user to podcast
     */
    async subscribeToPodcast(
      userId: string,
      podcastId: string,
      notifyNewEpisodes: boolean = true
    ): Promise<PodcastSubscription> {
      const { data, error } = await client
        .from('podcast_subscriptions')
        .insert({
          user_id: userId,
          podcast_id: podcastId,
          notify_new_episodes: notifyNewEpisodes,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Unsubscribe user from podcast
     */
    async unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void> {
      const { error } = await client
        .from('podcast_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('podcast_id', podcastId);

      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * Get user's podcast subscriptions with details
     * Note: The RPC function returns additional fields (podcast_description, podcast_website_url)
     * that are added in migration 20260104053300_update_podcast_subscriptions_rpc.sql
     */
    async getUserSubscriptions(userId: string): Promise<UserPodcastSubscription[]> {
      const { data, error } = await client.rpc('get_user_podcast_subscriptions', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Cast to UserPodcastSubscription[] - the RPC function returns the correct shape
      // after migration 20260104053300 is applied
      return (data ?? []) as unknown as UserPodcastSubscription[];
    },

    /**
     * Update subscription notification preference
     */
    async updateSubscriptionNotifications(
      subscriptionId: string,
      notifyNewEpisodes: boolean
    ): Promise<PodcastSubscription> {
      const { data, error } = await client
        .from('podcast_subscriptions')
        .update({ notify_new_episodes: notifyNewEpisodes })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Check if user is subscribed to podcast
     */
    async isUserSubscribed(userId: string, podcastId: string): Promise<boolean> {
      const { data, error } = await client
        .from('podcast_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('podcast_id', podcastId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return false;
        }
        throw new Error(error.message);
      }

      return data !== null;
    },

    /**
     * Create a new episode
     */
    async createEpisode(data: PodcastEpisodeInsert): Promise<PodcastEpisode> {
      const { data: episode, error } = await client
        .from('podcast_episodes')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return episode;
    },

    /**
     * Get episodes for a podcast
     */
    async getEpisodesByPodcast(
      podcastId: string,
      limit: number = 20,
      offset: number = 0
    ): Promise<PodcastEpisode[]> {
      const { data, error } = await client
        .from('podcast_episodes')
        .select('*')
        .eq('podcast_id', podcastId)
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },

    /**
     * Get episode by GUID
     */
    async getEpisodeByGuid(podcastId: string, guid: string): Promise<PodcastEpisode | null> {
      const { data, error } = await client
        .from('podcast_episodes')
        .select('*')
        .eq('podcast_id', podcastId)
        .eq('guid', guid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Update or create listen progress
     */
    async updateListenProgress(data: ListenProgressUpdate): Promise<PodcastListenProgress> {
      const { data: progress, error } = await client
        .from('podcast_listen_progress')
        .upsert(
          {
            user_id: data.user_id,
            episode_id: data.episode_id,
            current_time_seconds: data.current_time_seconds,
            duration_seconds: data.duration_seconds,
            percentage: data.percentage ?? 0,
            completed: data.completed ?? false,
            last_listened_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,episode_id' }
        )
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return progress;
    },

    /**
     * Get listen progress for user and episode
     */
    async getListenProgress(userId: string, episodeId: string): Promise<PodcastListenProgress | null> {
      const { data, error } = await client
        .from('podcast_listen_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('episode_id', episodeId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get users to notify about new episode
     */
    async getUsersToNotify(podcastId: string, episodeId: string): Promise<UserToNotify[]> {
      const { data, error } = await client.rpc('get_users_to_notify_new_episode', {
        p_podcast_id: podcastId,
        p_episode_id: episodeId,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: PodcastRepository | null = null;

/**
 * Get the singleton podcast repository instance
 * Uses the server-side Supabase client
 */
export function getPodcastRepository(): PodcastRepository {
  if (!repositoryInstance) {
    repositoryInstance = createPodcastRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetPodcastRepository(): void {
  repositoryInstance = null;
}
