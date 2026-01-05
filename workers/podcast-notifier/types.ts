/**
 * Podcast Notifier Worker Types
 */

/**
 * Podcast data from database
 */
export interface Podcast {
  id: string;
  feed_url: string;
  title: string;
  description: string | null;
  author: string | null;
  image_url: string | null;
  website_url: string | null;
  language: string | null;
  categories: string[] | null;
  last_episode_date: string | null;
  episode_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Episode data from database
 */
export interface PodcastEpisode {
  id: string;
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
  created_at: string;
}

/**
 * Parsed episode from RSS feed
 */
export interface ParsedEpisode {
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  imageUrl: string | null;
  publishedAt: Date;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

/**
 * Parsed podcast feed
 */
export interface ParsedPodcastFeed {
  podcast: {
    title: string;
    description: string | null;
    author: string | null;
    imageUrl: string | null;
    websiteUrl: string | null;
    language: string | null;
    categories: string[];
  };
  episodes: ParsedEpisode[];
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
 * Push subscription data for sending notifications
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

/**
 * Result of processing a single podcast
 */
export interface PodcastProcessResult {
  podcastId: string;
  podcastTitle: string;
  success: boolean;
  newEpisodesFound: number;
  notificationsSent: number;
  error?: string;
}

/**
 * Worker status
 */
export interface WorkerStatus {
  state: 'idle' | 'running' | 'error';
  lastSuccessfulRun?: number;
  nextRun?: number;
  podcastsProcessed?: number;
  podcastsFailed?: number;
  totalNewEpisodes?: number;
  totalNotificationsSent?: number;
  currentError?: string;
  startedAt?: number;
}
