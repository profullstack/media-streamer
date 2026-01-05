/**
 * News Extract API Route Tests
 *
 * Tests for the article content extraction endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Use vi.hoisted to define mocks that will be used in vi.mock
const mocks = vi.hoisted(() => {
  const mockGetCurrentUser = vi.fn();
  const mockExtractArticle = vi.fn();
  const mockContentCacheGet = vi.fn();
  const mockContentCacheSet = vi.fn();

  return {
    mockGetCurrentUser,
    mockExtractArticle,
    mockContentCacheGet,
    mockContentCacheSet,
  };
});

// Destructure for convenience
const {
  mockGetCurrentUser,
  mockExtractArticle,
  mockContentCacheGet,
  mockContentCacheSet,
} = mocks;

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.mockGetCurrentUser,
}));

// Mock the content cache
vi.mock('@/lib/news/content-cache', () => ({
  getNewsContentCache: () => ({
    get: mocks.mockContentCacheGet,
    set: mocks.mockContentCacheSet,
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock the article extractor
vi.mock('@/lib/news/article-extractor', () => ({
  extractArticle: mocks.mockExtractArticle,
}));

describe('News Extract API Route', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockExtractArticle.mockReset();
    mockContentCacheGet.mockReset();
    mockContentCacheSet.mockReset();

    // Default: no cached data
    mockContentCacheGet.mockResolvedValue(null);
    mockContentCacheSet.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (body: Record<string, unknown>): NextRequest => {
    return new NextRequest('http://localhost/api/news/extract', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  describe('POST /api/news/extract', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Authentication required');
    });

    it('returns 400 when URL is missing', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = createRequest({});
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Article URL is required');
    });

    it('returns 400 when URL is invalid', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'not-a-valid-url' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid URL format');
    });

    it('returns cached content when available', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const cachedContent = {
        title: 'Cached Article',
        byline: 'Jane Doe',
        content: '<p>Cached content</p>',
        textContent: 'Cached content',
        excerpt: 'Cached excerpt',
        siteName: 'Example',
        length: 100,
        extractedAt: Date.now(),
        fetchMethod: 'fetch' as const,
      };

      mockContentCacheGet.mockResolvedValue(cachedContent);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.cached).toBe(true);
      expect(data.data).toEqual(cachedContent);
    });

    it('extracts content when not cached', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const extractedContent = {
        title: 'Extracted Article',
        byline: 'John Smith',
        content: '<p>Extracted content</p>',
        textContent: 'Extracted content',
        excerpt: 'Extracted excerpt',
        siteName: 'Example',
        length: 200,
        extractedAt: Date.now(),
        fetchMethod: 'fetch' as const,
      };

      mockExtractArticle.mockResolvedValue({
        success: true,
        content: extractedContent,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.cached).toBe(false);
      expect(data.data).toEqual(extractedContent);
      expect(mockContentCacheSet).toHaveBeenCalledWith('https://example.com/article', extractedContent);
    });

    it('returns error when extraction fails', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      mockExtractArticle.mockResolvedValue({
        success: false,
        error: 'Failed to fetch article',
        errorCode: 502,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/blocked-article' });
      const response = await POST(request);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article');
    });

    it('returns 422 when content cannot be extracted', async () => {
      mockGetCurrentUser.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      mockExtractArticle.mockResolvedValue({
        success: false,
        error: 'Could not extract article content',
        errorCode: 422,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/empty-article' });
      const response = await POST(request);

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Could not extract article content');
    });

    it('handles unexpected errors gracefully', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Unexpected error'));

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to extract article');
    });

    it('does not require premium subscription', async () => {
      // Extract route should work for any authenticated user
      mockGetCurrentUser.mockResolvedValue({
        id: 'free-user',
        email: 'free@example.com',
      });

      mockExtractArticle.mockResolvedValue({
        success: true,
        content: {
          title: 'Article',
          byline: null,
          content: '<p>Content</p>',
          textContent: 'Content',
          excerpt: null,
          siteName: null,
          length: 10,
          extractedAt: Date.now(),
          fetchMethod: 'fetch' as const,
        },
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      // Should succeed without checking subscription
      expect(response.status).toBe(200);
    });
  });
});
