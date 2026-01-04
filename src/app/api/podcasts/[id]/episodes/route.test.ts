/**
 * Podcast Episodes API Route Tests
 * 
 * Tests for the episodes endpoint including validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the podcast service
vi.mock('@/lib/podcasts', () => ({
  getPodcastService: vi.fn(),
}));

import { GET } from './route';
import { getPodcastService } from '@/lib/podcasts';

describe('Podcast Episodes API Route', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    (getPodcastService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
  });

  function createRequest(url: string): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'));
  }

  describe('GET /api/podcasts/[id]/episodes', () => {
    it('should return 400 when podcast ID is undefined', async () => {
      const request = createRequest('http://localhost:3000/api/podcasts/undefined/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'undefined' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Podcast ID is required');
    });

    it('should return 400 when podcast ID is empty', async () => {
      const request = createRequest('http://localhost:3000/api/podcasts//episodes');
      const response = await GET(request, { params: Promise.resolve({ id: '' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Podcast ID is required');
    });

    it('should return 404 when podcast is not found', async () => {
      mockService.getPodcastById.mockResolvedValue(null);

      const request = createRequest('http://localhost:3000/api/podcasts/valid-uuid/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'valid-uuid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Podcast not found');
      expect(mockService.getPodcastById).toHaveBeenCalledWith('valid-uuid');
    });

    it('should return episodes for a valid podcast', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: 'https://example.com/image.jpg',
      };

      const mockEpisodes = [
        {
          id: 'episode-1',
          guid: 'guid-1',
          title: 'Episode 1',
          description: 'First episode',
          audio_url: 'https://example.com/ep1.mp3',
          duration_seconds: 3600,
          image_url: 'https://example.com/ep1.jpg',
          published_at: '2026-01-01T00:00:00.000Z',
          season_number: 1,
          episode_number: 1,
        },
        {
          id: 'episode-2',
          guid: 'guid-2',
          title: 'Episode 2',
          description: 'Second episode',
          audio_url: 'https://example.com/ep2.mp3',
          duration_seconds: 1800,
          image_url: null,
          published_at: '2026-01-02T00:00:00.000Z',
          season_number: 1,
          episode_number: 2,
        },
      ];

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue(mockEpisodes);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.podcast).toEqual({
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        imageUrl: 'https://example.com/image.jpg',
      });
      expect(data.episodes).toHaveLength(2);
      // Verify camelCase transformation
      expect(data.episodes[0]).toEqual({
        id: 'episode-1',
        guid: 'guid-1',
        title: 'Episode 1',
        description: 'First episode',
        audioUrl: 'https://example.com/ep1.mp3',
        duration: 3600,
        imageUrl: 'https://example.com/ep1.jpg',
        publishedAt: '2026-01-01T00:00:00.000Z',
        seasonNumber: 1,
        episodeNumber: 1,
      });
    });

    it('should respect limit and offset parameters', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: null,
      };

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue([]);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes?limit=10&offset=5');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });

      expect(response.status).toBe(200);
      expect(mockService.getEpisodes).toHaveBeenCalledWith('podcast-123', 10, 5);
    });

    it('should enforce maximum limit of 100', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: null,
      };

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue([]);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes?limit=500');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });

      expect(response.status).toBe(200);
      expect(mockService.getEpisodes).toHaveBeenCalledWith('podcast-123', 100, 0);
    });

    it('should use default values for invalid limit and offset', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: null,
      };

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue([]);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes?limit=invalid&offset=-5');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });

      expect(response.status).toBe(200);
      expect(mockService.getEpisodes).toHaveBeenCalledWith('podcast-123', 20, 0);
    });

    it('should return hasMore true when episodes equal limit', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: null,
      };

      const mockEpisodes = Array(20).fill(null).map((_, i) => ({
        id: `episode-${i}`,
        guid: `guid-${i}`,
        title: `Episode ${i}`,
        description: null,
        audio_url: 'https://example.com/ep.mp3',
        duration_seconds: 1800,
        image_url: null,
        published_at: '2026-01-01T00:00:00.000Z',
        season_number: null,
        episode_number: null,
      }));

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue(mockEpisodes);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(true);
    });

    it('should return hasMore false when episodes less than limit', async () => {
      const mockPodcast = {
        id: 'podcast-123',
        title: 'Test Podcast',
        author: 'Test Author',
        image_url: null,
      };

      const mockEpisodes = [
        {
          id: 'episode-1',
          guid: 'guid-1',
          title: 'Episode 1',
          description: null,
          audio_url: 'https://example.com/ep.mp3',
          duration_seconds: 1800,
          image_url: null,
          published_at: '2026-01-01T00:00:00.000Z',
          season_number: null,
          episode_number: null,
        },
      ];

      mockService.getPodcastById.mockResolvedValue(mockPodcast);
      mockService.getEpisodes.mockResolvedValue(mockEpisodes);

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(false);
    });

    it('should return 500 when service throws an error', async () => {
      mockService.getPodcastById.mockRejectedValue(new Error('Database error'));

      const request = createRequest('http://localhost:3000/api/podcasts/podcast-123/episodes');
      const response = await GET(request, { params: Promise.resolve({ id: 'podcast-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch episodes');
    });
  });
});
