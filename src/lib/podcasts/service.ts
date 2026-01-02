/**
 * Podcast Service
 *
 * Server-side service for podcast operations including search, RSS parsing,
 * and subscription management.
 */

import type {
  PodcastRepository,
  UserPodcastSubscription,
} from './repository';
import type {
  Podcast,
  PodcastEpisode,
  PodcastListenProgress,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Podcast search result from external API
 */
export interface PodcastSearchResult {
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  websiteUrl: string | null;
}

/**
 * Subscribed podcast response - matches frontend SubscribedPodcast interface
 * This is returned after subscribing to a podcast
 */
export interface SubscribedPodcastResponse {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  website: string | null;
  subscribedAt: string;
  notificationsEnabled: boolean;
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
 * Listen progress update input
 */
export interface ListenProgressInput {
  userId: string;
  episodeId: string;
  currentTimeSeconds: number;
  durationSeconds?: number;
}

/**
 * Podcast service interface
 */
export interface PodcastService {
  searchPodcasts(query: string): Promise<PodcastSearchResult[]>;
  parseFeed(feedUrl: string): Promise<ParsedPodcastFeed | null>;
  subscribeToPodcast(userId: string, feedUrl: string, notifyNewEpisodes?: boolean): Promise<SubscribedPodcastResponse | null>;
  unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void>;
  getUserSubscriptions(userId: string): Promise<UserPodcastSubscription[]>;
  refreshPodcastFeed(podcastId: string): Promise<PodcastEpisode[]>;
  updateListenProgress(data: ListenProgressInput): Promise<PodcastListenProgress>;
  getEpisodes(podcastId: string, limit?: number, offset?: number): Promise<PodcastEpisode[]>;
  getPodcastById(podcastId: string): Promise<Podcast | null>;
}

// ============================================================================
// Constants
// ============================================================================

const CASTOS_API_URL = 'https://castos.com/wp-admin/admin-ajax.php';
const COMPLETION_THRESHOLD = 0.95; // 95% = completed

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse duration string to seconds
 * Supports formats: "3600", "45:30", "1:30:45"
 */
function parseDuration(duration: string | null): number | null {
  if (!duration) return null;

  // If it's just a number, return it as seconds
  const numericDuration = parseInt(duration, 10);
  if (!isNaN(numericDuration) && duration.match(/^\d+$/)) {
    return numericDuration;
  }

  // Parse HH:MM:SS or MM:SS format
  const parts = duration.split(':').map(p => parseInt(p, 10));
  
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }

  return null;
}

/**
 * Sanitize search query to prevent XSS
 */
function sanitizeQuery(query: string): string {
  return query
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>"'&]/g, '') // Remove special characters
    .trim()
    .slice(0, 200); // Limit length
}

/**
 * Parse RSS feed XML
 */
function parseRssFeed(xml: string): ParsedPodcastFeed | null {
  try {
    // Use DOMParser-like parsing for Node.js
    // We'll use regex-based parsing for simplicity and Node.js compatibility
    
    const getTagContent = (xml: string, tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
      const match = xml.match(regex);
      return match ? match[1].trim() : null;
    };

    const getAttributeValue = (xml: string, tag: string, attr: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["'][^>]*>`, 'i');
      const match = xml.match(regex);
      return match ? match[1] : null;
    };

    // Extract channel info
    const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
    if (!channelMatch) return null;
    const channelXml = channelMatch[1];

    // Get podcast metadata
    const title = getTagContent(channelXml, 'title');
    if (!title) return null;

    const description = getTagContent(channelXml, 'description') || 
                       getTagContent(channelXml, 'itunes:summary');
    const author = getTagContent(channelXml, 'itunes:author') ||
                  getTagContent(channelXml, 'author');
    const imageUrl = getAttributeValue(channelXml, 'itunes:image', 'href') ||
                    getTagContent(channelXml, 'image>url');
    const websiteUrl = getTagContent(channelXml, 'link');
    const language = getTagContent(channelXml, 'language');

    // Extract categories
    const categories: string[] = [];
    const categoryMatches = channelXml.matchAll(/<itunes:category[^>]*text=["']([^"']*)["'][^>]*>/gi);
    for (const match of categoryMatches) {
      categories.push(match[1]);
    }

    // Extract episodes
    const episodes: ParsedEpisode[] = [];
    const itemMatches = channelXml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    
    for (const itemMatch of itemMatches) {
      const itemXml = itemMatch[1];
      
      const episodeTitle = getTagContent(itemXml, 'title');
      const guid = getTagContent(itemXml, 'guid') || getTagContent(itemXml, 'link');
      const audioUrl = getAttributeValue(itemXml, 'enclosure', 'url');
      const pubDateStr = getTagContent(itemXml, 'pubDate');
      
      if (!episodeTitle || !guid || !audioUrl) continue;

      const episodeDescription = getTagContent(itemXml, 'description') ||
                                getTagContent(itemXml, 'itunes:summary');
      const durationStr = getTagContent(itemXml, 'itunes:duration');
      const episodeImageUrl = getAttributeValue(itemXml, 'itunes:image', 'href');
      const seasonStr = getTagContent(itemXml, 'itunes:season');
      const episodeStr = getTagContent(itemXml, 'itunes:episode');

      const publishedAt = pubDateStr ? new Date(pubDateStr) : new Date();

      episodes.push({
        guid,
        title: episodeTitle,
        description: episodeDescription,
        audioUrl,
        durationSeconds: parseDuration(durationStr),
        imageUrl: episodeImageUrl,
        publishedAt,
        seasonNumber: seasonStr ? parseInt(seasonStr, 10) : null,
        episodeNumber: episodeStr ? parseInt(episodeStr, 10) : null,
      });
    }

    return {
      podcast: {
        title,
        description,
        author,
        imageUrl,
        websiteUrl,
        language,
        categories,
      },
      episodes,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a podcast service instance
 */
export function createPodcastService(repository: PodcastRepository): PodcastService {
  return {
    /**
     * Search podcasts using Castos API
     */
    async searchPodcasts(query: string): Promise<PodcastSearchResult[]> {
      const sanitizedQuery = sanitizeQuery(query);
      if (!sanitizedQuery) return [];

      try {
        const formData = new FormData();
        formData.append('search', sanitizedQuery);
        formData.append('action', 'feed_url_lookup_search');

        const response = await fetch(CASTOS_API_URL, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': '*/*',
            'User-Agent': 'podcast-search/1.0',
            'Referer': 'https://castos.com/tools/find-podcast-rss-feed/',
            'Origin': 'https://castos.com',
          },
        });

        if (!response.ok) {
          return [];
        }

        const data = await response.json() as {
          success: boolean;
          data: Array<{
            title: string;
            author?: string;
            description?: string;
            image?: string;
            url?: string;
            feed_url?: string;
            feedUrl?: string;
            website?: string;
          }>;
        };

        if (!data.success || !Array.isArray(data.data)) {
          return [];
        }

        // Filter out results without a valid feed URL and map to our format
        // Castos API returns 'url' field for the RSS feed URL
        return data.data
          .filter(item => {
            const feedUrl = item.url ?? item.feed_url ?? item.feedUrl;
            return typeof feedUrl === 'string' && feedUrl.length > 0;
          })
          .map(item => ({
            title: item.title,
            author: item.author ?? null,
            description: item.description ?? null,
            imageUrl: item.image ?? null,
            feedUrl: (item.url ?? item.feed_url ?? item.feedUrl) as string,
            websiteUrl: item.website ?? null,
          }));
      } catch {
        return [];
      }
    },

    /**
     * Parse RSS feed from URL
     */
    async parseFeed(feedUrl: string): Promise<ParsedPodcastFeed | null> {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'Accept': 'application/rss+xml, application/xml, text/xml',
            'User-Agent': 'podcast-parser/1.0',
          },
        });

        if (!response.ok) {
          return null;
        }

        const xml = await response.text();
        return parseRssFeed(xml);
      } catch {
        return null;
      }
    },

    /**
     * Subscribe user to podcast by feed URL
     * Returns full podcast details for the frontend
     */
    async subscribeToPodcast(
      userId: string,
      feedUrl: string,
      notifyNewEpisodes: boolean = true
    ): Promise<SubscribedPodcastResponse | null> {
      // Check if podcast already exists
      let podcast = await repository.getPodcastByFeedUrl(feedUrl);

      if (!podcast) {
        // Parse the feed to get podcast info
        const parsedFeed = await this.parseFeed(feedUrl);
        if (!parsedFeed) {
          return null;
        }

        // Create the podcast
        podcast = await repository.upsertPodcast({
          feed_url: feedUrl,
          title: parsedFeed.podcast.title,
          description: parsedFeed.podcast.description,
          author: parsedFeed.podcast.author,
          image_url: parsedFeed.podcast.imageUrl,
          website_url: parsedFeed.podcast.websiteUrl,
          language: parsedFeed.podcast.language,
          categories: parsedFeed.podcast.categories,
          episode_count: parsedFeed.episodes.length,
          last_episode_date: parsedFeed.episodes[0]?.publishedAt.toISOString() ?? null,
        });

        // Create episodes
        for (const episode of parsedFeed.episodes) {
          await repository.createEpisode({
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
        }
      }

      // Subscribe user to podcast
      const subscription = await repository.subscribeToPodcast(userId, podcast.id, notifyNewEpisodes);

      // Return full podcast details in the format expected by the frontend
      return {
        id: podcast.id,
        title: podcast.title,
        author: podcast.author ?? null,
        description: podcast.description ?? null,
        imageUrl: podcast.image_url ?? null,
        feedUrl: podcast.feed_url,
        website: podcast.website_url ?? null,
        subscribedAt: subscription.created_at,
        notificationsEnabled: subscription.notify_new_episodes,
      };
    },

    /**
     * Unsubscribe user from podcast
     */
    async unsubscribeFromPodcast(userId: string, podcastId: string): Promise<void> {
      await repository.unsubscribeFromPodcast(userId, podcastId);
    },

    /**
     * Get user's podcast subscriptions
     */
    async getUserSubscriptions(userId: string): Promise<UserPodcastSubscription[]> {
      return repository.getUserSubscriptions(userId);
    },

    /**
     * Refresh podcast feed and return new episodes
     */
    async refreshPodcastFeed(podcastId: string): Promise<PodcastEpisode[]> {
      const podcast = await repository.getPodcastById(podcastId);
      if (!podcast) {
        return [];
      }

      const parsedFeed = await this.parseFeed(podcast.feed_url);
      if (!parsedFeed) {
        return [];
      }

      const newEpisodes: PodcastEpisode[] = [];

      // Check each episode and create if new
      for (const episode of parsedFeed.episodes) {
        const existingEpisode = await repository.getEpisodeByGuid(podcastId, episode.guid);
        
        if (!existingEpisode) {
          const createdEpisode = await repository.createEpisode({
            podcast_id: podcastId,
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
        }
      }

      // Update podcast metadata
      if (newEpisodes.length > 0 || parsedFeed.episodes.length > 0) {
        await repository.updatePodcast(podcastId, {
          episode_count: parsedFeed.episodes.length,
          last_episode_date: parsedFeed.episodes[0]?.publishedAt.toISOString() ?? null,
        });
      }

      return newEpisodes;
    },

    /**
     * Update listen progress for an episode
     */
    async updateListenProgress(data: ListenProgressInput): Promise<PodcastListenProgress> {
      const percentage = data.durationSeconds 
        ? (data.currentTimeSeconds / data.durationSeconds) * 100 
        : 0;
      
      const completed = percentage >= COMPLETION_THRESHOLD * 100;

      return repository.updateListenProgress({
        user_id: data.userId,
        episode_id: data.episodeId,
        current_time_seconds: data.currentTimeSeconds,
        duration_seconds: data.durationSeconds,
        percentage,
        completed,
      });
    },

    /**
     * Get episodes for a podcast
     */
    async getEpisodes(
      podcastId: string,
      limit: number = 20,
      offset: number = 0
    ): Promise<PodcastEpisode[]> {
      return repository.getEpisodesByPodcast(podcastId, limit, offset);
    },

    /**
     * Get podcast by ID
     */
    async getPodcastById(podcastId: string): Promise<Podcast | null> {
      return repository.getPodcastById(podcastId);
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getPodcastRepository } from './repository';

let serviceInstance: PodcastService | null = null;

/**
 * Get the singleton podcast service instance
 */
export function getPodcastService(): PodcastService {
  if (!serviceInstance) {
    serviceInstance = createPodcastService(getPodcastRepository());
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetPodcastService(): void {
  serviceInstance = null;
}
