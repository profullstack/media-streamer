/**
 * News API Route Tests
 * 
 * Tests for fetching news from TheNewsAPI.
 * The API key is stored server-side in THENEWSAPI_API_KEY env var.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Store original env
const originalEnv = process.env;

describe('News API Routes', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, THENEWSAPI_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createRequest(
    method: string,
    url: string,
  ): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), { method });
  }

  describe('GET /api/news', () => {
    it('should return news articles with required fields', async () => {
      const mockApiResponse = {
        meta: { found: 100, returned: 3, limit: 3, page: 1 },
        data: [
          {
            uuid: 'article-1',
            title: 'Test Article 1',
            description: 'Description 1',
            snippet: 'Snippet 1',
            url: 'https://example.com/article1',
            image_url: 'https://example.com/image1.jpg',
            language: 'en',
            published_at: '2026-01-04T06:00:00.000000Z',
            source: 'example.com',
            categories: ['general', 'business'],
            relevance_score: null,
          },
          {
            uuid: 'article-2',
            title: 'Test Article 2',
            description: 'Description 2',
            snippet: 'Snippet 2',
            url: 'https://example.com/article2',
            image_url: 'https://example.com/image2.jpg',
            language: 'en',
            published_at: '2026-01-04T05:00:00.000000Z',
            source: 'news.com',
            categories: ['tech'],
            relevance_score: null,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?search=bitcoin');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(2);
      expect(data.articles[0]).toEqual({
        uuid: 'article-1',
        title: 'Test Article 1',
        description: 'Description 1',
        snippet: 'Snippet 1',
        url: 'https://example.com/article1',
        imageUrl: 'https://example.com/image1.jpg',
        publishedAt: '2026-01-04T06:00:00.000000Z',
        source: 'example.com',
        categories: ['general', 'business'],
      });
      expect(data.meta).toEqual({
        found: 100,
        returned: 3,
        limit: 3,
        page: 1,
      });
    });

    it('should use default search term when none provided', async () => {
      const mockApiResponse = {
        meta: { found: 50, returned: 10, limit: 10, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=cryptocurrency'),
        expect.any(Object)
      );
    });

    it('should pass search parameter to API', async () => {
      const mockApiResponse = {
        meta: { found: 50, returned: 10, limit: 10, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?search=ethereum');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=ethereum'),
        expect.any(Object)
      );
    });

    it('should pass limit parameter to API', async () => {
      const mockApiResponse = {
        meta: { found: 50, returned: 5, limit: 5, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?limit=5');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });

    it('should pass page parameter to API', async () => {
      const mockApiResponse = {
        meta: { found: 50, returned: 10, limit: 10, page: 2 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?page=2');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      );
    });

    it('should return 500 when API key is not configured', async () => {
      delete process.env.THENEWSAPI_API_KEY;

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('News API not configured');
    });

    it('should return 502 when external API fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe('Failed to fetch news from external API');
    });

    it('should return 502 when external API returns 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe('Failed to fetch news from external API');
    });

    it('should return 500 when fetch throws an error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle articles with null optional fields', async () => {
      const mockApiResponse = {
        meta: { found: 1, returned: 1, limit: 10, page: 1 },
        data: [
          {
            uuid: 'article-1',
            title: 'Test Article',
            description: null,
            snippet: null,
            url: 'https://example.com/article',
            image_url: null,
            language: 'en',
            published_at: '2026-01-04T06:00:00.000000Z',
            source: 'example.com',
            categories: [],
            relevance_score: null,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles[0]).toEqual({
        uuid: 'article-1',
        title: 'Test Article',
        description: null,
        snippet: null,
        url: 'https://example.com/article',
        imageUrl: null,
        publishedAt: '2026-01-04T06:00:00.000000Z',
        source: 'example.com',
        categories: [],
      });
    });

    it('should include API token in request', async () => {
      const mockApiResponse = {
        meta: { found: 0, returned: 0, limit: 10, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api_token=test-api-key'),
        expect.any(Object)
      );
    });

    it('should sort by published_at', async () => {
      const mockApiResponse = {
        meta: { found: 0, returned: 0, limit: 10, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sort=published_at'),
        expect.any(Object)
      );
    });

    it('should filter by English language', async () => {
      const mockApiResponse = {
        meta: { found: 0, returned: 0, limit: 10, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('language=en'),
        expect.any(Object)
      );
    });

    it('should enforce maximum limit of 50', async () => {
      const mockApiResponse = {
        meta: { found: 0, returned: 0, limit: 50, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?limit=100');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object)
      );
    });

    it('should enforce minimum limit of 1', async () => {
      const mockApiResponse = {
        meta: { found: 0, returned: 0, limit: 1, page: 1 },
        data: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { GET } = await import('./route');
      const request = createRequest('GET', 'http://localhost:3000/api/news?limit=0');
      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1'),
        expect.any(Object)
      );
    });
  });
});
