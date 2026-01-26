/**
 * Notification Sender Tests
 *
 * Tests for push notification sending functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Podcast, PodcastEpisode, UserToNotify } from './types';

// Mock web-push before importing the module
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Mock supabase-client
vi.mock('./supabase-client', () => ({
  recordNotification: vi.fn(),
  markPushSubscriptionInactive: vi.fn(),
}));

// Set environment variables before importing
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

import { sendNewEpisodeNotifications } from './notification-sender';
import webPush from 'web-push';
import { recordNotification, markPushSubscriptionInactive } from './supabase-client';

describe('NotificationSender', () => {
  const mockPodcast: Podcast = {
    id: 'podcast-123',
    feed_url: 'https://example.com/feed.xml',
    title: 'Test Podcast',
    description: 'A test podcast',
    author: 'Test Author',
    image_url: 'https://example.com/image.jpg',
    website_url: 'https://example.com',
    language: 'en',
    categories: ['Technology'],
    last_episode_date: '2026-01-01T00:00:00Z',
    episode_count: 10,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockEpisode: PodcastEpisode = {
    id: 'episode-456',
    podcast_id: 'podcast-123',
    guid: 'episode-guid-456',
    title: 'Test Episode Title',
    description: 'Test episode description',
    audio_url: 'https://example.com/episode.mp3',
    duration_seconds: 3600,
    image_url: 'https://example.com/episode.jpg',
    published_at: '2026-01-01T12:00:00Z',
    season_number: 1,
    episode_number: 5,
    created_at: '2026-01-01T12:00:00Z',
  };

  const mockUsers: UserToNotify[] = [
    {
      user_id: 'user-1',
      push_endpoint: 'https://push.example.com/user1',
      p256dh_key: 'p256dh-key-1',
      auth_key: 'auth-key-1',
    },
    {
      user_id: 'user-2',
      push_endpoint: 'https://push.example.com/user2',
      p256dh_key: 'p256dh-key-2',
      auth_key: 'auth-key-2',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('sendNewEpisodeNotifications', () => {
    it('should return zero counts when no users to notify', async () => {
      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, []);

      expect(result).toEqual({ sent: 0, failed: 0 });
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send notifications to all users successfully', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, mockUsers);

      expect(result).toEqual({ sent: 2, failed: 0 });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(recordNotification).toHaveBeenCalledTimes(2);
    });

    it('should send notification with correct payload structure', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      expect(webPush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/user1',
          keys: {
            p256dh: 'p256dh-key-1',
            auth: 'auth-key-1',
          },
        },
        expect.stringContaining('"title":"New Episode: Test Podcast"'),
        expect.objectContaining({
          TTL: 86400, // 24 hours
        })
      );
    });

    it('should include episode info in notification body', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      const call = vi.mocked(webPush.sendNotification).mock.calls[0];
      const payload = JSON.parse(call[1] as string);

      expect(payload.title).toBe('New Episode: Test Podcast');
      expect(payload.body).toBe('Test Episode Title');
      // Uses episode image when available, falls back to podcast image
      expect(payload.icon).toBe('https://example.com/episode.jpg');
      expect(payload.tag).toBe('podcast-podcast-123-episode-456');
      expect(payload.data).toMatchObject({
        type: 'new-episode',
        podcastId: 'podcast-123',
        episodeId: 'episode-456',
        action: 'play-episode',
      });
    });

    it('should truncate long episode titles in notification body', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const longEpisode: PodcastEpisode = {
        ...mockEpisode,
        title: 'A'.repeat(150), // Very long title
      };

      await sendNewEpisodeNotifications(mockPodcast, longEpisode, [mockUsers[0]]);

      const call = vi.mocked(webPush.sendNotification).mock.calls[0];
      const payload = JSON.parse(call[1] as string);

      expect(payload.body.length).toBeLessThanOrEqual(100);
      expect(payload.body).toMatch(/\.\.\.$/);
    });

    it('should record successful notifications', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      expect(recordNotification).toHaveBeenCalledWith({
        userId: 'user-1',
        notificationType: 'new-episode',
        title: 'New Episode: Test Podcast',
        body: 'Test Episode Title',
        podcastId: 'podcast-123',
        episodeId: 'episode-456',
        status: 'sent',
      });
    });

    it('should handle failed notifications', async () => {
      vi.mocked(webPush.sendNotification).mockRejectedValue(new Error('Push failed'));
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, mockUsers);

      expect(result).toEqual({ sent: 0, failed: 2 });
      expect(recordNotification).toHaveBeenCalledTimes(2);
      expect(recordNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Push failed',
        })
      );
    });

    it('should mark expired subscriptions as inactive (410 Gone)', async () => {
      const expiredError = new Error('Push subscription expired') as Error & { statusCode: number };
      expiredError.statusCode = 410;

      vi.mocked(webPush.sendNotification).mockRejectedValue(expiredError);
      vi.mocked(markPushSubscriptionInactive).mockResolvedValue(undefined);

      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      expect(result).toEqual({ sent: 0, failed: 1 });
      expect(markPushSubscriptionInactive).toHaveBeenCalledWith('https://push.example.com/user1');
      // Should not record notification for expired subscriptions
      expect(recordNotification).not.toHaveBeenCalled();
    });

    it('should mark not found subscriptions as inactive (404)', async () => {
      const notFoundError = new Error('Subscription not found') as Error & { statusCode: number };
      notFoundError.statusCode = 404;

      vi.mocked(webPush.sendNotification).mockRejectedValue(notFoundError);
      vi.mocked(markPushSubscriptionInactive).mockResolvedValue(undefined);

      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      expect(result).toEqual({ sent: 0, failed: 1 });
      expect(markPushSubscriptionInactive).toHaveBeenCalledWith('https://push.example.com/user1');
    });

    it('should handle mixed success and failure', async () => {
      vi.mocked(webPush.sendNotification)
        .mockResolvedValueOnce({} as never) // First succeeds
        .mockRejectedValueOnce(new Error('Push failed')); // Second fails
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const result = await sendNewEpisodeNotifications(mockPodcast, mockEpisode, mockUsers);

      expect(result).toEqual({ sent: 1, failed: 1 });
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(recordNotification).toHaveBeenCalledTimes(2);
    });

    it('should send with correct TTL value', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      expect(webPush.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({
          TTL: 86400, // 24 hours
        })
      );
    });

    it('should include action buttons in notification', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      await sendNewEpisodeNotifications(mockPodcast, mockEpisode, [mockUsers[0]]);

      const call = vi.mocked(webPush.sendNotification).mock.calls[0];
      const payload = JSON.parse(call[1] as string);

      expect(payload.actions).toEqual([
        { action: 'play', title: 'Play Now' },
        { action: 'later', title: 'Later' },
      ]);
    });

    it('should handle podcast without image (uses episode image)', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const podcastWithoutImage: Podcast = {
        ...mockPodcast,
        image_url: null,
      };

      await sendNewEpisodeNotifications(podcastWithoutImage, mockEpisode, [mockUsers[0]]);

      const call = vi.mocked(webPush.sendNotification).mock.calls[0];
      const payload = JSON.parse(call[1] as string);

      // Should use episode image when podcast has no image
      expect(payload.icon).toBe('https://example.com/episode.jpg');
    });

    it('should handle both podcast and episode without image', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);
      vi.mocked(recordNotification).mockResolvedValue(undefined);

      const podcastWithoutImage: Podcast = {
        ...mockPodcast,
        image_url: null,
      };

      const episodeWithoutImage: PodcastEpisode = {
        ...mockEpisode,
        image_url: null,
      };

      await sendNewEpisodeNotifications(podcastWithoutImage, episodeWithoutImage, [mockUsers[0]]);

      const call = vi.mocked(webPush.sendNotification).mock.calls[0];
      const payload = JSON.parse(call[1] as string);

      expect(payload.icon).toBeUndefined();
    });
  });
});
