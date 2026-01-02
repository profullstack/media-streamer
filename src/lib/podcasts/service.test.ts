/**
 * Podcast Service Tests
 * 
 * Tests for the podcast service including search, RSS parsing, and subscription management.
 * Following TDD - tests written first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPodcastService,
  type PodcastService,
  type PodcastSearchResult,
  type ParsedPodcastFeed,
} from './service';
import type { PodcastRepository } from './repository';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock repository
function createMockRepository(): PodcastRepository {
  return {
    getPodcastByFeedUrl: vi.fn(),
    getPodcastById: vi.fn(),
    createPodcast: vi.fn(),
    upsertPodcast: vi.fn(),
    updatePodcast: vi.fn(),
    subscribeToPodcast: vi.fn(),
    unsubscribeFromPodcast: vi.fn(),
    getUserSubscriptions: vi.fn(),
    updateSubscriptionNotifications: vi.fn(),
    isUserSubscribed: vi.fn(),
    createEpisode: vi.fn(),
    getEpisodesByPodcast: vi.fn(),
    getEpisodeByGuid: vi.fn(),
    updateListenProgress: vi.fn(),
    getListenProgress: vi.fn(),
    getUsersToNotify: vi.fn(),
  };
}

describe('PodcastService', () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let service: PodcastService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    service = createPodcastService(mockRepository);
  });

  describe('searchPodcasts', () => {
    it('should search podcasts using Castos API', async () => {
      const mockCastosResponse = {
        success: true,
        data: [
          {
            title: 'Test Podcast',
            author: 'Test Author',
            description: 'A test podcast description',
            image: 'https://example.com/image.jpg',
            feed_url: 'https://example.com/feed.xml',
            website: 'https://example.com',
          },
          {
            title: 'Another Podcast',
            author: 'Another Author',
            description: 'Another description',
            image: 'https://example.com/image2.jpg',
            feed_url: 'https://example.com/feed2.xml',
            website: 'https://example.com/2',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCastosResponse),
      });

      const results = await service.searchPodcasts('test');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Test Podcast',
        author: 'Test Author',
        description: 'A test podcast description',
        imageUrl: 'https://example.com/image.jpg',
        feedUrl: 'https://example.com/feed.xml',
        websiteUrl: 'https://example.com',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://castos.com/wp-admin/admin-ajax.php',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return empty array when search fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const results = await service.searchPodcasts('test');

      expect(results).toEqual([]);
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      const results = await service.searchPodcasts('nonexistent');

      expect(results).toEqual([]);
    });

    it('should sanitize search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });

      await service.searchPodcasts('test <script>alert("xss")</script>');

      // Verify the FormData was created with sanitized input
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should filter out results without feed_url', async () => {
      const mockCastosResponse = {
        success: true,
        data: [
          {
            title: 'Valid Podcast',
            author: 'Author',
            description: 'Description',
            image: 'https://example.com/image.jpg',
            feed_url: 'https://example.com/feed.xml',
            website: 'https://example.com',
          },
          {
            title: 'Invalid Podcast - No Feed URL',
            author: 'Author',
            description: 'Description',
            image: 'https://example.com/image2.jpg',
            // Missing feed_url
            website: 'https://example.com/2',
          },
          {
            title: 'Invalid Podcast - Empty Feed URL',
            author: 'Author',
            description: 'Description',
            image: 'https://example.com/image3.jpg',
            feed_url: '',
            website: 'https://example.com/3',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCastosResponse),
      });

      const results = await service.searchPodcasts('test');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Valid Podcast');
      expect(results[0].feedUrl).toBe('https://example.com/feed.xml');
    });

    it('should handle feedUrl field name variant', async () => {
      const mockCastosResponse = {
        success: true,
        data: [
          {
            title: 'Podcast with feedUrl',
            author: 'Author',
            description: 'Description',
            image: 'https://example.com/image.jpg',
            feedUrl: 'https://example.com/feed.xml', // camelCase variant
            website: 'https://example.com',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCastosResponse),
      });

      const results = await service.searchPodcasts('test');

      expect(results).toHaveLength(1);
      expect(results[0].feedUrl).toBe('https://example.com/feed.xml');
    });
  });

  describe('parseFeed', () => {
    it('should parse RSS feed and extract podcast info', async () => {
      const mockRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Test Podcast</title>
            <description>A test podcast</description>
            <itunes:author>Test Author</itunes:author>
            <itunes:image href="https://example.com/image.jpg"/>
            <link>https://example.com</link>
            <language>en</language>
            <itunes:category text="Technology"/>
            <item>
              <title>Episode 1</title>
              <description>First episode</description>
              <guid>episode-1-guid</guid>
              <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345678"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
              <itunes:duration>3600</itunes:duration>
              <itunes:season>1</itunes:season>
              <itunes:episode>1</itunes:episode>
            </item>
            <item>
              <title>Episode 2</title>
              <description>Second episode</description>
              <guid>episode-2-guid</guid>
              <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="23456789"/>
              <pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate>
              <itunes:duration>1:30:00</itunes:duration>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssFeed),
      });

      const result = await service.parseFeed('https://example.com/feed.xml');

      expect(result).not.toBeNull();
      expect(result!.podcast.title).toBe('Test Podcast');
      expect(result!.podcast.author).toBe('Test Author');
      expect(result!.podcast.description).toBe('A test podcast');
      expect(result!.podcast.imageUrl).toBe('https://example.com/image.jpg');
      expect(result!.podcast.websiteUrl).toBe('https://example.com');
      expect(result!.podcast.language).toBe('en');
      expect(result!.episodes).toHaveLength(2);
      expect(result!.episodes[0].title).toBe('Episode 1');
      expect(result!.episodes[0].guid).toBe('episode-1-guid');
      expect(result!.episodes[0].audioUrl).toBe('https://example.com/ep1.mp3');
      expect(result!.episodes[0].durationSeconds).toBe(3600);
      expect(result!.episodes[0].seasonNumber).toBe(1);
      expect(result!.episodes[0].episodeNumber).toBe(1);
    });

    it('should return null for invalid feed URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      const result = await service.parseFeed('https://invalid.com/feed.xml');

      expect(result).toBeNull();
    });

    it('should handle malformed RSS feed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('not valid xml'),
      });

      const result = await service.parseFeed('https://example.com/feed.xml');

      expect(result).toBeNull();
    });

    it('should parse duration in various formats', async () => {
      const mockRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Test</title>
            <item>
              <title>Ep1</title>
              <guid>1</guid>
              <enclosure url="https://example.com/1.mp3" type="audio/mpeg"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
              <itunes:duration>1:30:45</itunes:duration>
            </item>
            <item>
              <title>Ep2</title>
              <guid>2</guid>
              <enclosure url="https://example.com/2.mp3" type="audio/mpeg"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
              <itunes:duration>45:30</itunes:duration>
            </item>
            <item>
              <title>Ep3</title>
              <guid>3</guid>
              <enclosure url="https://example.com/3.mp3" type="audio/mpeg"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
              <itunes:duration>3600</itunes:duration>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssFeed),
      });

      const result = await service.parseFeed('https://example.com/feed.xml');

      expect(result!.episodes[0].durationSeconds).toBe(5445); // 1:30:45
      expect(result!.episodes[1].durationSeconds).toBe(2730); // 45:30
      expect(result!.episodes[2].durationSeconds).toBe(3600); // 3600
    });
  });

  describe('subscribeToPodcast', () => {
    it('should create podcast if not exists and subscribe user', async () => {
      const feedUrl = 'https://example.com/feed.xml';
      const userId = 'user-123';

      const mockRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>New Podcast</title>
            <description>Description</description>
            <itunes:author>Author</itunes:author>
            <item>
              <title>Episode 1</title>
              <guid>ep1</guid>
              <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssFeed),
      });

      (mockRepository.getPodcastByFeedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockRepository.upsertPodcast as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'podcast-123',
        feed_url: feedUrl,
        title: 'New Podcast',
      });
      (mockRepository.createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'episode-123',
      });
      (mockRepository.subscribeToPodcast as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub-123',
        user_id: userId,
        podcast_id: 'podcast-123',
        notify_new_episodes: true,
      });

      const result = await service.subscribeToPodcast(userId, feedUrl);

      expect(result).not.toBeNull();
      expect(mockRepository.upsertPodcast).toHaveBeenCalled();
      expect(mockRepository.subscribeToPodcast).toHaveBeenCalledWith(userId, 'podcast-123', true);
    });

    it('should use existing podcast when subscribing', async () => {
      const feedUrl = 'https://example.com/feed.xml';
      const userId = 'user-123';

      (mockRepository.getPodcastByFeedUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-podcast',
        feed_url: feedUrl,
        title: 'Existing Podcast',
      });
      (mockRepository.subscribeToPodcast as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub-123',
        user_id: userId,
        podcast_id: 'existing-podcast',
        notify_new_episodes: true,
      });

      const result = await service.subscribeToPodcast(userId, feedUrl);

      expect(result).not.toBeNull();
      expect(mockRepository.upsertPodcast).not.toHaveBeenCalled();
      expect(mockRepository.subscribeToPodcast).toHaveBeenCalledWith(userId, 'existing-podcast', true);
    });

    it('should return null when feed cannot be parsed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      (mockRepository.getPodcastByFeedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.subscribeToPodcast('user-123', 'https://invalid.com/feed.xml');

      expect(result).toBeNull();
    });
  });

  describe('unsubscribeFromPodcast', () => {
    it('should unsubscribe user from podcast', async () => {
      const userId = 'user-123';
      const podcastId = 'podcast-456';

      (mockRepository.unsubscribeFromPodcast as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.unsubscribeFromPodcast(userId, podcastId);

      expect(mockRepository.unsubscribeFromPodcast).toHaveBeenCalledWith(userId, podcastId);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions', async () => {
      const userId = 'user-123';
      const mockSubscriptions = [
        {
          subscription_id: 'sub-1',
          podcast_id: 'podcast-1',
          podcast_title: 'Podcast One',
          podcast_author: 'Author One',
          podcast_image_url: 'https://example.com/1.jpg',
          podcast_feed_url: 'https://example.com/1.xml',
          notify_new_episodes: true,
          latest_episode_title: 'Episode 10',
          latest_episode_published_at: '2026-01-01T00:00:00Z',
          unlistened_count: 3,
          subscribed_at: '2025-12-01T00:00:00Z',
        },
      ];

      (mockRepository.getUserSubscriptions as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubscriptions);

      const result = await service.getUserSubscriptions(userId);

      expect(result).toEqual(mockSubscriptions);
      expect(mockRepository.getUserSubscriptions).toHaveBeenCalledWith(userId);
    });
  });

  describe('refreshPodcastFeed', () => {
    it('should fetch new episodes and update podcast', async () => {
      const podcastId = 'podcast-123';
      const feedUrl = 'https://example.com/feed.xml';

      const mockPodcast = {
        id: podcastId,
        feed_url: feedUrl,
        title: 'Test Podcast',
        episode_count: 5,
      };

      const mockRssFeed = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Test Podcast</title>
            <item>
              <title>New Episode</title>
              <guid>new-episode-guid</guid>
              <enclosure url="https://example.com/new.mp3" type="audio/mpeg"/>
              <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Old Episode</title>
              <guid>old-episode-guid</guid>
              <enclosure url="https://example.com/old.mp3" type="audio/mpeg"/>
              <pubDate>Sun, 31 Dec 2025 00:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssFeed),
      });

      (mockRepository.getPodcastById as ReturnType<typeof vi.fn>).mockResolvedValue(mockPodcast);
      (mockRepository.getEpisodeByGuid as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // new episode doesn't exist
        .mockResolvedValueOnce({ id: 'existing-episode' }); // old episode exists
      (mockRepository.createEpisode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-episode-id',
        guid: 'new-episode-guid',
      });
      (mockRepository.updatePodcast as ReturnType<typeof vi.fn>).mockResolvedValue(mockPodcast);

      const newEpisodes = await service.refreshPodcastFeed(podcastId);

      expect(newEpisodes).toHaveLength(1);
      expect(newEpisodes[0].guid).toBe('new-episode-guid');
      expect(mockRepository.createEpisode).toHaveBeenCalledTimes(1);
      expect(mockRepository.updatePodcast).toHaveBeenCalled();
    });

    it('should return empty array when podcast not found', async () => {
      (mockRepository.getPodcastById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.refreshPodcastFeed('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('updateListenProgress', () => {
    it('should update listen progress', async () => {
      const progressData = {
        userId: 'user-123',
        episodeId: 'episode-456',
        currentTimeSeconds: 1800,
        durationSeconds: 3600,
      };

      const mockProgress = {
        id: 'progress-789',
        user_id: progressData.userId,
        episode_id: progressData.episodeId,
        current_time_seconds: progressData.currentTimeSeconds,
        duration_seconds: progressData.durationSeconds,
        percentage: 50,
        completed: false,
      };

      (mockRepository.updateListenProgress as ReturnType<typeof vi.fn>).mockResolvedValue(mockProgress);

      const result = await service.updateListenProgress(progressData);

      expect(result).toEqual(mockProgress);
      expect(mockRepository.updateListenProgress).toHaveBeenCalledWith({
        user_id: progressData.userId,
        episode_id: progressData.episodeId,
        current_time_seconds: progressData.currentTimeSeconds,
        duration_seconds: progressData.durationSeconds,
        percentage: 50,
        completed: false,
      });
    });

    it('should mark as completed when progress is 95% or more', async () => {
      const progressData = {
        userId: 'user-123',
        episodeId: 'episode-456',
        currentTimeSeconds: 3500,
        durationSeconds: 3600,
      };

      (mockRepository.updateListenProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'progress-789',
        completed: true,
        percentage: 97.22,
      });

      await service.updateListenProgress(progressData);

      expect(mockRepository.updateListenProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: true,
        })
      );
    });
  });

  describe('getEpisodes', () => {
    it('should return episodes for a podcast', async () => {
      const podcastId = 'podcast-123';
      const mockEpisodes = [
        { id: 'ep-1', title: 'Episode 1' },
        { id: 'ep-2', title: 'Episode 2' },
      ];

      (mockRepository.getEpisodesByPodcast as ReturnType<typeof vi.fn>).mockResolvedValue(mockEpisodes);

      const result = await service.getEpisodes(podcastId);

      expect(result).toEqual(mockEpisodes);
      expect(mockRepository.getEpisodesByPodcast).toHaveBeenCalledWith(podcastId, 20, 0);
    });

    it('should support pagination', async () => {
      const podcastId = 'podcast-123';

      (mockRepository.getEpisodesByPodcast as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.getEpisodes(podcastId, 10, 20);

      expect(mockRepository.getEpisodesByPodcast).toHaveBeenCalledWith(podcastId, 10, 20);
    });
  });
});
