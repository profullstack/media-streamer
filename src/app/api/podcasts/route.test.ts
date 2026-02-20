/**
 * Podcast API Route Tests
 * 
 * Tests for podcast search and subscription endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the podcast service
vi.mock('@/lib/podcasts', () => ({
  getPodcastService: vi.fn(),
}));

// Mock the supabase client
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

// Mock profiles
vi.mock('@/lib/profiles', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));

import { GET, POST, DELETE } from './route';
import { getPodcastService } from '@/lib/podcasts';
import { createServerClient } from '@/lib/supabase';

describe('Podcast API Routes', () => {
  const mockService = {
    searchPodcasts: vi.fn(),
    subscribeToPodcast: vi.fn(),
    unsubscribeFromPodcast: vi.fn(),
    getUserSubscriptions: vi.fn(),
    getEpisodes: vi.fn(),
    getPodcastById: vi.fn(),
    updateListenProgress: vi.fn(),
    refreshPodcastFeed: vi.fn(),
    parseFeed: vi.fn(),
  };

  const mockSupabase = {
    auth: {
      setSession: vi.fn(),
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getPodcastService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);
  });

  function createRequest(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): NextRequest {
    const requestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    };

    return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit);
  }

  function mockAuthenticatedUser(userId: string): void {
    mockSupabase.auth.setSession.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  }

  function mockUnauthenticated(): void {
    mockSupabase.auth.setSession.mockResolvedValue({ error: { message: 'Invalid session' } });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });
  }

  describe('GET /api/podcasts', () => {
    it('should search podcasts when query parameter is provided', async () => {
      const mockResults = [
        {
          title: 'Test Podcast',
          author: 'Test Author',
          description: 'A test podcast',
          imageUrl: 'https://example.com/image.jpg',
          feedUrl: 'https://example.com/feed.xml',
          websiteUrl: 'https://example.com',
        },
      ];

      mockService.searchPodcasts.mockResolvedValue(mockResults);

      const request = createRequest('GET', 'http://localhost:3000/api/podcasts?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual(mockResults);
      expect(mockService.searchPodcasts).toHaveBeenCalledWith('test');
    });

    it('should return user subscriptions when no query parameter', async () => {
      mockAuthenticatedUser('user-123');

      const mockSubscriptions = [
        {
          subscription_id: 'sub-1',
          podcast_id: 'podcast-1',
          podcast_title: 'Podcast One',
          podcast_author: 'Author One',
          podcast_description: 'A great podcast',
          podcast_image_url: 'https://example.com/image.jpg',
          podcast_feed_url: 'https://example.com/feed.xml',
          podcast_website_url: 'https://example.com',
          notify_new_episodes: true,
          subscribed_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockService.getUserSubscriptions.mockResolvedValue(mockSubscriptions);

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should transform snake_case to camelCase for frontend
      expect(data.subscriptions).toEqual([
        {
          id: 'podcast-1',
          title: 'Podcast One',
          author: 'Author One',
          description: 'A great podcast',
          imageUrl: 'https://example.com/image.jpg',
          feedUrl: 'https://example.com/feed.xml',
          website: 'https://example.com',
          subscribedAt: '2026-01-01T00:00:00.000Z',
          notificationsEnabled: true,
        },
      ]);
    });

    it('should handle subscriptions with null optional fields', async () => {
      mockAuthenticatedUser('user-123');

      const mockSubscriptions = [
        {
          subscription_id: 'sub-1',
          podcast_id: 'podcast-1',
          podcast_title: 'Podcast One',
          podcast_author: null,
          podcast_description: null,
          podcast_image_url: null,
          podcast_feed_url: 'https://example.com/feed.xml',
          podcast_website_url: null,
          notify_new_episodes: false,
          subscribed_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockService.getUserSubscriptions.mockResolvedValue(mockSubscriptions);

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscriptions).toEqual([
        {
          id: 'podcast-1',
          title: 'Podcast One',
          author: null,
          description: null,
          imageUrl: null,
          feedUrl: 'https://example.com/feed.xml',
          website: null,
          subscribedAt: '2026-01-01T00:00:00.000Z',
          notificationsEnabled: false,
        },
      ]);
    });

    it('should return 401 when getting subscriptions without auth', async () => {
      mockUnauthenticated();

      const request = createRequest('GET', 'http://localhost:3000/api/podcasts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return empty results for empty search query', async () => {
      mockService.searchPodcasts.mockResolvedValue([]);

      const request = createRequest('GET', 'http://localhost:3000/api/podcasts?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });
  });

  describe('POST /api/podcasts', () => {
    it('should subscribe to a podcast and return full podcast details', async () => {
      mockAuthenticatedUser('user-123');

      const mockSubscriptionResult = {
        id: 'podcast-456',
        title: 'Test Podcast',
        author: 'Test Author',
        description: 'A test podcast description',
        imageUrl: 'https://example.com/image.jpg',
        feedUrl: 'https://example.com/feed.xml',
        website: 'https://example.com',
        subscribedAt: '2026-01-01T00:00:00.000Z',
        notificationsEnabled: true,
      };

      mockService.subscribeToPodcast.mockResolvedValue(mockSubscriptionResult);

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        { feedUrl: 'https://example.com/feed.xml' },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription).toEqual(mockSubscriptionResult);
      expect(data.subscription.id).toBe('podcast-456');
      expect(data.subscription.title).toBe('Test Podcast');
      expect(data.subscription.author).toBe('Test Author');
      expect(data.subscription.feedUrl).toBe('https://example.com/feed.xml');
      expect(data.subscription.notificationsEnabled).toBe(true);
      expect(mockService.subscribeToPodcast).toHaveBeenCalledWith(
        'user-123',
        'https://example.com/feed.xml',
        true
      );
    });

    it('should allow disabling notifications on subscribe', async () => {
      mockAuthenticatedUser('user-123');

      const mockSubscriptionResult = {
        id: 'podcast-456',
        title: 'Test Podcast',
        author: 'Test Author',
        description: null,
        imageUrl: null,
        feedUrl: 'https://example.com/feed.xml',
        website: null,
        subscribedAt: '2026-01-01T00:00:00.000Z',
        notificationsEnabled: false,
      };

      mockService.subscribeToPodcast.mockResolvedValue(mockSubscriptionResult);

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        { feedUrl: 'https://example.com/feed.xml', notifyNewEpisodes: false },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.notificationsEnabled).toBe(false);
      expect(mockService.subscribeToPodcast).toHaveBeenCalledWith(
        'user-123',
        'https://example.com/feed.xml',
        false
      );
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        { feedUrl: 'https://example.com/feed.xml' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when feedUrl is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        {},
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: feedUrl');
    });

    it('should return 400 when feedUrl is invalid', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        { feedUrl: 'not-a-url' },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid feedUrl: must be a valid HTTP or HTTPS URL');
    });

    it('should return 404 when feed cannot be parsed', async () => {
      mockAuthenticatedUser('user-123');
      mockService.subscribeToPodcast.mockResolvedValue(null);

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts',
        { feedUrl: 'https://example.com/invalid-feed.xml' },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Could not parse podcast feed');
    });
  });

  describe('DELETE /api/podcasts', () => {
    it('should unsubscribe from a podcast', async () => {
      mockAuthenticatedUser('user-123');
      mockService.unsubscribeFromPodcast.mockResolvedValue(undefined);

      const request = createRequest(
        'DELETE',
        'http://localhost:3000/api/podcasts?podcastId=podcast-456',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockService.unsubscribeFromPodcast).toHaveBeenCalledWith('user-123', 'podcast-456');
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'DELETE',
        'http://localhost:3000/api/podcasts?podcastId=podcast-456'
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when podcastId is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'DELETE',
        'http://localhost:3000/api/podcasts',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required parameter: podcastId');
    });
  });
});
