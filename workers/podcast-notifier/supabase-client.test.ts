/**
 * Supabase Client Tests
 *
 * Tests for database operations in the podcast notifier worker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create chainable mock functions
const createChainableMock = () => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const createMethod = (name: string): ReturnType<typeof vi.fn> => {
    return vi.fn(() => chain);
  };

  chain.select = createMethod('select');
  chain.insert = createMethod('insert');
  chain.update = createMethod('update');
  chain.delete = createMethod('delete');
  chain.eq = createMethod('eq');
  chain.in = createMethod('in');
  chain.order = createMethod('order');
  chain.limit = createMethod('limit');
  chain.single = vi.fn();

  return chain;
};

const mockChain = createChainableMock();
const mockFrom = vi.fn(() => mockChain);
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Set environment variables before importing
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import {
  fetchSubscribedPodcasts,
  getLatestEpisode,
  episodeExists,
  createEpisode,
  updatePodcastMetadata,
  getUsersToNotify,
  recordNotification,
  markPushSubscriptionInactive,
} from './supabase-client';

describe('SupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain methods to return the chain
    Object.keys(mockChain).forEach(key => {
      if (key !== 'single') {
        (mockChain[key] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
      }
    });
  });

  describe('fetchSubscribedPodcasts', () => {
    it('should fetch podcasts with notification-enabled subscriptions', async () => {
      // First call returns subscriptions
      mockChain.eq.mockResolvedValueOnce({
        data: [
          { podcast_id: 'podcast-1' },
          { podcast_id: 'podcast-2' },
          { podcast_id: 'podcast-1' }, // Duplicate
        ],
        error: null,
      });

      // Second call returns podcasts
      mockChain.in.mockResolvedValueOnce({
        data: [
          { id: 'podcast-1', title: 'Podcast One', feed_url: 'https://example.com/1.xml' },
          { id: 'podcast-2', title: 'Podcast Two', feed_url: 'https://example.com/2.xml' },
        ],
        error: null,
      });

      const result = await fetchSubscribedPodcasts();

      expect(result).toHaveLength(2);
      expect(mockFrom).toHaveBeenCalledWith('podcast_subscriptions');
      expect(mockFrom).toHaveBeenCalledWith('podcasts');
    });

    it('should return empty array when no subscriptions', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await fetchSubscribedPodcasts();

      expect(result).toEqual([]);
    });

    it('should throw on subscription fetch error', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(fetchSubscribedPodcasts()).rejects.toThrow('Failed to fetch subscriptions');
    });
  });

  describe('getLatestEpisode', () => {
    it('should return the latest episode for a podcast', async () => {
      const mockEpisode = {
        id: 'episode-1',
        title: 'Latest Episode',
        published_at: '2026-01-01T00:00:00Z',
      };

      mockChain.single.mockResolvedValueOnce({
        data: mockEpisode,
        error: null,
      });

      const result = await getLatestEpisode('podcast-123');

      expect(result).toEqual(mockEpisode);
      expect(mockFrom).toHaveBeenCalledWith('podcast_episodes');
    });

    it('should return null when no episodes exist', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await getLatestEpisode('podcast-123');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'OTHER', message: 'Database error' },
      });

      await expect(getLatestEpisode('podcast-123')).rejects.toThrow('Failed to get latest episode');
    });
  });

  describe('episodeExists', () => {
    it('should return true when episode exists', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'episode-123' },
        error: null,
      });

      const result = await episodeExists('podcast-123', 'episode-guid');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('podcast_episodes');
    });

    it('should return false when episode does not exist', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await episodeExists('podcast-123', 'nonexistent-guid');

      expect(result).toBe(false);
    });
  });

  describe('createEpisode', () => {
    it('should create a new episode', async () => {
      const episodeData = {
        podcast_id: 'podcast-123',
        guid: 'new-episode-guid',
        title: 'New Episode',
        description: 'Episode description',
        audio_url: 'https://example.com/audio.mp3',
        duration_seconds: 3600,
        image_url: 'https://example.com/image.jpg',
        published_at: '2026-01-01T00:00:00Z',
        season_number: 1,
        episode_number: 5,
      };

      const mockCreatedEpisode = { id: 'created-episode-id', ...episodeData };

      mockChain.single.mockResolvedValueOnce({
        data: mockCreatedEpisode,
        error: null,
      });

      const result = await createEpisode(episodeData);

      expect(result).toEqual(mockCreatedEpisode);
      expect(mockFrom).toHaveBeenCalledWith('podcast_episodes');
      expect(mockChain.insert).toHaveBeenCalledWith(episodeData);
    });

    it('should throw on create error', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Duplicate key' },
      });

      await expect(createEpisode({
        podcast_id: 'podcast-123',
        guid: 'duplicate-guid',
        title: 'Episode',
        description: null,
        audio_url: 'https://example.com/audio.mp3',
        duration_seconds: null,
        image_url: null,
        published_at: '2026-01-01T00:00:00Z',
        season_number: null,
        episode_number: null,
      })).rejects.toThrow('Failed to create episode');
    });
  });

  describe('updatePodcastMetadata', () => {
    it('should update podcast metadata', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await updatePodcastMetadata('podcast-123', {
        episode_count: 10,
        last_episode_date: '2026-01-01T00:00:00Z',
      });

      expect(mockFrom).toHaveBeenCalledWith('podcasts');
      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          episode_count: 10,
          last_episode_date: '2026-01-01T00:00:00Z',
          updated_at: expect.any(String),
        })
      );
    });

    it('should throw on update error', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(updatePodcastMetadata('podcast-123', { episode_count: 10 }))
        .rejects.toThrow('Failed to update podcast');
    });
  });

  describe('getUsersToNotify', () => {
    it('should call RPC function and return users', async () => {
      const mockUsers = [
        { user_id: 'user-1', push_endpoint: 'endpoint-1', p256dh_key: 'key-1', auth_key: 'auth-1' },
        { user_id: 'user-2', push_endpoint: 'endpoint-2', p256dh_key: 'key-2', auth_key: 'auth-2' },
      ];

      mockRpc.mockResolvedValueOnce({
        data: mockUsers,
        error: null,
      });

      const result = await getUsersToNotify('podcast-123', 'episode-456');

      expect(result).toEqual(mockUsers);
      expect(mockRpc).toHaveBeenCalledWith('get_users_to_notify_new_episode', {
        p_podcast_id: 'podcast-123',
        p_episode_id: 'episode-456',
      });
    });

    it('should return empty array on RPC error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC failed' },
      });

      const result = await getUsersToNotify('podcast-123', 'episode-456');

      expect(result).toEqual([]);
    });
  });

  describe('recordNotification', () => {
    it('should record notification history', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'notification-123' },
        error: null,
      });

      await recordNotification({
        userId: 'user-123',
        notificationType: 'new-episode',
        title: 'New Episode',
        body: 'Episode description',
        podcastId: 'podcast-123',
        episodeId: 'episode-456',
        status: 'sent',
      });

      expect(mockFrom).toHaveBeenCalledWith('notification_history');
      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          notification_type: 'new-episode',
          title: 'New Episode',
          body: 'Episode description',
          podcast_id: 'podcast-123',
          episode_id: 'episode-456',
          status: 'sent',
        })
      );
    });

    it('should handle failed notification recording gracefully', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      // Should not throw
      await recordNotification({
        userId: 'user-123',
        notificationType: 'new-episode',
        title: 'New Episode',
        body: 'Episode description',
        podcastId: 'podcast-123',
        episodeId: 'episode-456',
        status: 'sent',
      });
    });
  });

  describe('markPushSubscriptionInactive', () => {
    it('should mark subscription as inactive', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await markPushSubscriptionInactive('https://push.example.com/user1');

      expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
      expect(mockChain.update).toHaveBeenCalledWith({ is_active: false });
    });

    it('should handle errors gracefully', async () => {
      mockChain.eq.mockResolvedValueOnce({
        data: null,
        error: { message: 'Update failed' },
      });

      // Should not throw
      await markPushSubscriptionInactive('https://push.example.com/user1');
    });
  });
});
