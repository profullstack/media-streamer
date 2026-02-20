/**
 * Podcast Progress API Route Tests
 *
 * Tests for podcast episode listen progress endpoints.
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
  getCurrentProfileIdWithFallback: vi.fn().mockResolvedValue('profile-123'),
}));

import { GET, POST } from './route';
import { getPodcastService } from '@/lib/podcasts';
import { createServerClient } from '@/lib/supabase';

describe('Podcast Progress API Routes', () => {
  const mockService = {
    searchPodcasts: vi.fn(),
    subscribeToPodcast: vi.fn(),
    unsubscribeFromPodcast: vi.fn(),
    getUserSubscriptions: vi.fn(),
    getEpisodes: vi.fn(),
    getPodcastById: vi.fn(),
    updateListenProgress: vi.fn(),
    getListenProgressForPodcast: vi.fn(),
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

  describe('GET /api/podcasts/progress', () => {
    it('should return listen progress for a podcast', async () => {
      mockAuthenticatedUser('user-123');

      const mockProgress = [
        {
          episodeId: 'episode-1',
          currentTimeSeconds: 1800,
          durationSeconds: 3600,
          percentage: 50,
          completed: false,
          lastListenedAt: '2026-01-01T12:00:00Z',
        },
        {
          episodeId: 'episode-2',
          currentTimeSeconds: 3500,
          durationSeconds: 3600,
          percentage: 97.22,
          completed: true,
          lastListenedAt: '2026-01-01T14:00:00Z',
        },
      ];

      mockService.getListenProgressForPodcast.mockResolvedValue(mockProgress);

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts/progress?podcastId=podcast-456',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress).toEqual(mockProgress);
      expect(data.progress).toHaveLength(2);
      expect(mockService.getListenProgressForPodcast).toHaveBeenCalledWith('profile-123', 'podcast-456');
    });

    it('should return empty array when no progress exists', async () => {
      mockAuthenticatedUser('user-123');

      mockService.getListenProgressForPodcast.mockResolvedValue([]);

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts/progress?podcastId=podcast-456',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts/progress?podcastId=podcast-456'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when podcastId is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts/progress',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required query parameter: podcastId');
    });

    it('should handle service errors', async () => {
      mockAuthenticatedUser('user-123');

      mockService.getListenProgressForPodcast.mockRejectedValue(new Error('Database error'));

      const request = createRequest(
        'GET',
        'http://localhost:3000/api/podcasts/progress?podcastId=podcast-456',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch progress');
    });
  });

  describe('POST /api/podcasts/progress', () => {
    it('should update listen progress', async () => {
      mockAuthenticatedUser('user-123');

      const mockProgress = {
        id: 'progress-789',
        user_id: 'user-123',
        episode_id: 'episode-456',
        current_time_seconds: 1800,
        duration_seconds: 3600,
        percentage: 50,
        completed: false,
        last_listened_at: '2026-01-01T12:00:00Z',
      };

      mockService.updateListenProgress.mockResolvedValue(mockProgress);

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          episodeId: 'episode-456',
          currentTimeSeconds: 1800,
          durationSeconds: 3600,
        },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress.id).toBe('progress-789');
      expect(data.progress.episodeId).toBe('episode-456');
      expect(data.progress.currentTimeSeconds).toBe(1800);
      expect(data.progress.percentage).toBe(50);
      expect(mockService.updateListenProgress).toHaveBeenCalledWith({
        userId: 'profile-123',
        episodeId: 'episode-456',
        currentTimeSeconds: 1800,
        durationSeconds: 3600,
      });
    });

    it('should update progress without durationSeconds', async () => {
      mockAuthenticatedUser('user-123');

      const mockProgress = {
        id: 'progress-789',
        user_id: 'user-123',
        episode_id: 'episode-456',
        current_time_seconds: 1800,
        duration_seconds: null,
        percentage: 0,
        completed: false,
        last_listened_at: '2026-01-01T12:00:00Z',
      };

      mockService.updateListenProgress.mockResolvedValue(mockProgress);

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          episodeId: 'episode-456',
          currentTimeSeconds: 1800,
        },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.progress.id).toBe('progress-789');
      expect(data.progress.episodeId).toBe('episode-456');
      expect(mockService.updateListenProgress).toHaveBeenCalledWith({
        userId: 'profile-123',
        episodeId: 'episode-456',
        currentTimeSeconds: 1800,
        durationSeconds: undefined,
      });
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          episodeId: 'episode-456',
          currentTimeSeconds: 1800,
        }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when episodeId is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          currentTimeSeconds: 1800,
        },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: episodeId');
    });

    it('should return 400 when currentTimeSeconds is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          episodeId: 'episode-456',
        },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: currentTimeSeconds');
    });

    it('should handle service errors', async () => {
      mockAuthenticatedUser('user-123');

      mockService.updateListenProgress.mockRejectedValue(new Error('Database error'));

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/podcasts/progress',
        {
          episodeId: 'episode-456',
          currentTimeSeconds: 1800,
          durationSeconds: 3600,
        },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update progress');
    });
  });
});
