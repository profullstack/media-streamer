/**
 * Podcast Repository Tests
 * 
 * Tests for the server-side podcast repository.
 * Following TDD - tests written first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import {
  createPodcastRepository,
  type PodcastRepository,
} from './repository';

// Mock Supabase client
function createMockClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockRpc = vi.fn();
  const mockUpsert = vi.fn();

  const chainMock = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
    upsert: mockUpsert,
  };

  // Chain methods return the chain mock
  mockSelect.mockReturnValue(chainMock);
  mockInsert.mockReturnValue(chainMock);
  mockUpdate.mockReturnValue(chainMock);
  mockDelete.mockReturnValue(chainMock);
  mockEq.mockReturnValue(chainMock);
  mockUpsert.mockReturnValue(chainMock);

  const mockFrom = vi.fn().mockReturnValue(chainMock);

  return {
    from: mockFrom,
    rpc: mockRpc,
    _mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      single: mockSingle,
      rpc: mockRpc,
      upsert: mockUpsert,
    },
  } as unknown as SupabaseClient<Database> & {
    _mocks: {
      from: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      rpc: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
}

describe('PodcastRepository', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repository: PodcastRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repository = createPodcastRepository(mockClient);
  });

  describe('getPodcastByFeedUrl', () => {
    it('should return podcast when found', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        feed_url: 'https://example.com/feed.xml',
        title: 'Test Podcast',
        author: 'Test Author',
        description: 'A test podcast',
        image_url: 'https://example.com/image.jpg',
        episode_count: 10,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockPodcast, error: null });

      const result = await repository.getPodcastByFeedUrl('https://example.com/feed.xml');

      expect(result).toEqual(mockPodcast);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcasts');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('feed_url', 'https://example.com/feed.xml');
    });

    it('should return null when podcast not found', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await repository.getPodcastByFeedUrl('https://nonexistent.com/feed.xml');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'INTERNAL', message: 'Database error' },
      });

      await expect(repository.getPodcastByFeedUrl('https://example.com/feed.xml'))
        .rejects.toThrow('Database error');
    });
  });

  describe('createPodcast', () => {
    it('should create a new podcast', async () => {
      const podcastData = {
        feed_url: 'https://example.com/feed.xml',
        title: 'New Podcast',
        author: 'Author Name',
        description: 'Description',
        image_url: 'https://example.com/image.jpg',
      };

      const mockCreatedPodcast = {
        id: 'podcast-456',
        ...podcastData,
        episode_count: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockCreatedPodcast, error: null });

      const result = await repository.createPodcast(podcastData);

      expect(result).toEqual(mockCreatedPodcast);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcasts');
      expect(mockClient._mocks.insert).toHaveBeenCalledWith(podcastData);
    });

    it('should throw error on creation failure', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { message: 'Duplicate feed_url' },
      });

      await expect(repository.createPodcast({
        feed_url: 'https://example.com/feed.xml',
        title: 'Test',
      })).rejects.toThrow('Duplicate feed_url');
    });
  });

  describe('upsertPodcast', () => {
    it('should upsert podcast by feed_url', async () => {
      const podcastData = {
        feed_url: 'https://example.com/feed.xml',
        title: 'Updated Podcast',
        author: 'Updated Author',
      };

      const mockUpsertedPodcast = {
        id: 'podcast-789',
        ...podcastData,
        episode_count: 5,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockUpsertedPodcast, error: null });

      const result = await repository.upsertPodcast(podcastData);

      expect(result).toEqual(mockUpsertedPodcast);
      expect(mockClient._mocks.upsert).toHaveBeenCalledWith(podcastData, {
        onConflict: 'feed_url',
      });
    });
  });

  describe('subscribeToPodcast', () => {
    it('should create a subscription', async () => {
      const userId = 'user-123';
      const podcastId = 'podcast-456';

      const mockSubscription = {
        id: 'sub-789',
        user_id: userId,
        podcast_id: podcastId,
        notify_new_episodes: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockSubscription, error: null });

      const result = await repository.subscribeToPodcast(userId, podcastId);

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcast_subscriptions');
      expect(mockClient._mocks.insert).toHaveBeenCalledWith({
        user_id: userId,
        podcast_id: podcastId,
        notify_new_episodes: true,
      });
    });

    it('should allow disabling notifications on subscribe', async () => {
      const userId = 'user-123';
      const podcastId = 'podcast-456';

      const mockSubscription = {
        id: 'sub-789',
        user_id: userId,
        podcast_id: podcastId,
        notify_new_episodes: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockSubscription, error: null });

      const result = await repository.subscribeToPodcast(userId, podcastId, false);

      expect(result.notify_new_episodes).toBe(false);
      expect(mockClient._mocks.insert).toHaveBeenCalledWith({
        user_id: userId,
        podcast_id: podcastId,
        notify_new_episodes: false,
      });
    });
  });

  describe('unsubscribeFromPodcast', () => {
    it('should delete a subscription', async () => {
      const userId = 'user-123';
      const podcastId = 'podcast-456';

      // Create a mock that supports chained .eq().eq() calls
      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      mockClient._mocks.from.mockReturnValue({ delete: deleteMock });

      await repository.unsubscribeFromPodcast(userId, podcastId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcast_subscriptions');
      expect(deleteMock).toHaveBeenCalled();
      expect(firstEq).toHaveBeenCalledWith('user_id', userId);
      expect(secondEq).toHaveBeenCalledWith('podcast_id', podcastId);
    });

    it('should throw error on deletion failure', async () => {
      // Create a mock that supports chained .eq().eq() calls with error
      const secondEq = vi.fn().mockResolvedValue({
        error: { message: 'Deletion failed' },
      });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      mockClient._mocks.from.mockReturnValue({ delete: deleteMock });

      await expect(repository.unsubscribeFromPodcast('user-123', 'podcast-456'))
        .rejects.toThrow('Deletion failed');
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions via RPC', async () => {
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
        {
          subscription_id: 'sub-2',
          podcast_id: 'podcast-2',
          podcast_title: 'Podcast Two',
          podcast_author: 'Author Two',
          podcast_image_url: 'https://example.com/2.jpg',
          podcast_feed_url: 'https://example.com/2.xml',
          notify_new_episodes: false,
          latest_episode_title: null,
          latest_episode_published_at: null,
          unlistened_count: 0,
          subscribed_at: '2025-11-01T00:00:00Z',
        },
      ];

      mockClient._mocks.rpc.mockResolvedValue({ data: mockSubscriptions, error: null });

      const result = await repository.getUserSubscriptions(userId);

      expect(result).toEqual(mockSubscriptions);
      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('get_user_podcast_subscriptions', {
        p_user_id: userId,
      });
    });

    it('should return empty array when no subscriptions', async () => {
      mockClient._mocks.rpc.mockResolvedValue({ data: [], error: null });

      const result = await repository.getUserSubscriptions('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('updateSubscriptionNotifications', () => {
    it('should update notification preference', async () => {
      const subscriptionId = 'sub-123';
      const notifyNewEpisodes = false;

      const mockUpdatedSubscription = {
        id: subscriptionId,
        user_id: 'user-123',
        podcast_id: 'podcast-456',
        notify_new_episodes: notifyNewEpisodes,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockUpdatedSubscription, error: null });

      const result = await repository.updateSubscriptionNotifications(subscriptionId, notifyNewEpisodes);

      expect(result.notify_new_episodes).toBe(false);
      expect(mockClient._mocks.update).toHaveBeenCalledWith({ notify_new_episodes: notifyNewEpisodes });
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('id', subscriptionId);
    });
  });

  describe('createEpisode', () => {
    it('should create a new episode', async () => {
      const episodeData = {
        podcast_id: 'podcast-123',
        guid: 'episode-guid-123',
        title: 'Episode Title',
        description: 'Episode description',
        audio_url: 'https://example.com/episode.mp3',
        duration_seconds: 3600,
        published_at: '2026-01-01T00:00:00Z',
      };

      const mockCreatedEpisode = {
        id: 'episode-456',
        ...episodeData,
        created_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockCreatedEpisode, error: null });

      const result = await repository.createEpisode(episodeData);

      expect(result).toEqual(mockCreatedEpisode);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcast_episodes');
      expect(mockClient._mocks.insert).toHaveBeenCalledWith(episodeData);
    });
  });

  describe('getEpisodesByPodcast', () => {
    it('should return episodes for a podcast', async () => {
      const podcastId = 'podcast-123';
      const mockEpisodes = [
        {
          id: 'episode-1',
          podcast_id: podcastId,
          guid: 'guid-1',
          title: 'Episode 1',
          audio_url: 'https://example.com/1.mp3',
          published_at: '2026-01-02T00:00:00Z',
        },
        {
          id: 'episode-2',
          podcast_id: podcastId,
          guid: 'guid-2',
          title: 'Episode 2',
          audio_url: 'https://example.com/2.mp3',
          published_at: '2026-01-01T00:00:00Z',
        },
      ];

      // Mock the order method
      const mockOrder = vi.fn().mockReturnValue({
        range: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null }),
      });
      mockClient._mocks.eq.mockReturnValue({ order: mockOrder });

      const result = await repository.getEpisodesByPodcast(podcastId);

      expect(result).toEqual(mockEpisodes);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcast_episodes');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('podcast_id', podcastId);
    });

    it('should support pagination', async () => {
      const podcastId = 'podcast-123';
      const mockEpisodes = [{ id: 'episode-3' }];

      const mockRange = vi.fn().mockResolvedValue({ data: mockEpisodes, error: null });
      const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
      mockClient._mocks.eq.mockReturnValue({ order: mockOrder });

      const result = await repository.getEpisodesByPodcast(podcastId, 10, 20);

      expect(result).toEqual(mockEpisodes);
      expect(mockRange).toHaveBeenCalledWith(20, 29);
    });
  });

  describe('updateListenProgress', () => {
    it('should upsert listen progress', async () => {
      const progressData = {
        user_id: 'user-123',
        episode_id: 'episode-456',
        current_time_seconds: 1800,
        duration_seconds: 3600,
        percentage: 50,
        completed: false,
      };

      const mockProgress = {
        id: 'progress-789',
        ...progressData,
        last_listened_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockProgress, error: null });

      const result = await repository.updateListenProgress(progressData);

      expect(result).toEqual(mockProgress);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('podcast_listen_progress');
      expect(mockClient._mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining(progressData),
        { onConflict: 'user_id,episode_id' }
      );
    });
  });

  describe('getListenProgress', () => {
    it('should return listen progress for user and episode', async () => {
      const mockProgress = {
        id: 'progress-123',
        user_id: 'user-123',
        episode_id: 'episode-456',
        current_time_seconds: 1800,
        duration_seconds: 3600,
        percentage: 50,
        completed: false,
        last_listened_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockProgress, error: null });

      const result = await repository.getListenProgress('user-123', 'episode-456');

      expect(result).toEqual(mockProgress);
    });

    it('should return null when no progress exists', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await repository.getListenProgress('user-123', 'episode-456');

      expect(result).toBeNull();
    });
  });

  describe('getUsersToNotify', () => {
    it('should return users to notify for new episode', async () => {
      const podcastId = 'podcast-123';
      const episodeId = 'episode-456';
      const mockUsers = [
        {
          user_id: 'user-1',
          push_endpoint: 'https://push.example.com/1',
          p256dh_key: 'key1',
          auth_key: 'auth1',
        },
        {
          user_id: 'user-2',
          push_endpoint: 'https://push.example.com/2',
          p256dh_key: 'key2',
          auth_key: 'auth2',
        },
      ];

      mockClient._mocks.rpc.mockResolvedValue({ data: mockUsers, error: null });

      const result = await repository.getUsersToNotify(podcastId, episodeId);

      expect(result).toEqual(mockUsers);
      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('get_users_to_notify_new_episode', {
        p_podcast_id: podcastId,
        p_episode_id: episodeId,
      });
    });
  });

  describe('isUserSubscribed', () => {
    it('should return true when user is subscribed', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: { id: 'sub-123' },
        error: null,
      });

      const result = await repository.isUserSubscribed('user-123', 'podcast-456');

      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await repository.isUserSubscribed('user-123', 'podcast-456');

      expect(result).toBe(false);
    });
  });
});
