/**
 * News Summarize API Route Tests
 *
 * Tests for the article summarization endpoint that uses
 * the article extractor (with Puppeteer fallback) and OpenAI for summarization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Use vi.hoisted to define mocks that will be used in vi.mock
const mocks = vi.hoisted(() => {
  const mockOpenAICreate = vi.fn();
  const mockGetCurrentUser = vi.fn();
  const mockGetSubscriptionStatus = vi.fn();
  const mockExtractArticle = vi.fn();
  const mockSummaryCacheGet = vi.fn();
  const mockSummaryCacheSet = vi.fn();
  const mockContentCacheGet = vi.fn();
  const mockContentCacheSet = vi.fn();

  class MockAPIError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  // Create the OpenAI mock class
  function MockOpenAI() {
    return {
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    };
  }
  MockOpenAI.APIError = MockAPIError;

  return {
    mockOpenAICreate,
    MockAPIError,
    mockGetCurrentUser,
    mockGetSubscriptionStatus,
    MockOpenAI,
    mockExtractArticle,
    mockSummaryCacheGet,
    mockSummaryCacheSet,
    mockContentCacheGet,
    mockContentCacheSet,
  };
});

// Destructure for convenience
const {
  mockOpenAICreate,
  MockAPIError,
  mockGetCurrentUser,
  mockGetSubscriptionStatus,
  MockOpenAI,
  mockExtractArticle,
  mockSummaryCacheGet,
  mockSummaryCacheSet,
  mockContentCacheGet,
  mockContentCacheSet,
} = mocks;

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.mockGetCurrentUser,
}));

// Mock subscription
vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: () => ({
    getSubscriptionStatus: mocks.mockGetSubscriptionStatus,
  }),
}));

// Mock OpenAI
vi.mock('openai', () => ({
  default: mocks.MockOpenAI,
}));

// Mock summary cache
vi.mock('@/lib/news/summary-cache', () => ({
  getNewsSummaryCache: () => ({
    get: mocks.mockSummaryCacheGet,
    set: mocks.mockSummaryCacheSet,
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock content cache
vi.mock('@/lib/news/content-cache', () => ({
  getNewsContentCache: () => ({
    get: mocks.mockContentCacheGet,
    set: mocks.mockContentCacheSet,
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock article extractor
vi.mock('@/lib/news/article-extractor', () => ({
  extractArticle: mocks.mockExtractArticle,
}));

// Store original env
const originalEnv = process.env;

describe('News Summarize API Route', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-openai-key' };
    mockOpenAICreate.mockReset();
    mockGetCurrentUser.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockExtractArticle.mockReset();
    mockSummaryCacheGet.mockReset();
    mockSummaryCacheSet.mockReset();
    mockContentCacheGet.mockReset();
    mockContentCacheSet.mockReset();

    // Default: authenticated user with active subscription
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockGetSubscriptionStatus.mockResolvedValue({ is_active: true, tier: 'premium' });
    // Default: no cached data
    mockSummaryCacheGet.mockResolvedValue(null);
    mockSummaryCacheSet.mockResolvedValue(true);
    mockContentCacheGet.mockResolvedValue(null);
    mockContentCacheSet.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createRequest(body: object): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/api/news/summarize'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const mockExtractedContent = {
    title: 'Test Article Title',
    byline: 'John Doe',
    content: '<p>This is the article content.</p>',
    textContent: 'This is the first paragraph of the article content. It contains important information about the topic being discussed. This is the second paragraph with more details about the subject matter. The article concludes with some final thoughts and analysis.',
    excerpt: 'Article excerpt',
    siteName: 'Example News',
    length: 500,
    extractedAt: Date.now(),
    fetchMethod: 'fetch' as const,
  };

  const mockOpenAIResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: 'Test Article Title',
            summary: 'This is a summary of the test article discussing important topics.',
            keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
            images: [],
            publishedDate: null,
            author: 'John Doe',
            source: 'example.com',
          }),
        },
      },
    ],
  };

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Authentication required');
    });
  });

  describe('Subscription Check', () => {
    it('should return 403 when user has no subscription', async () => {
      mockGetSubscriptionStatus.mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Premium subscription required');
    });

    it('should return 403 when subscription is not active', async () => {
      mockGetSubscriptionStatus.mockResolvedValue({ is_active: false, tier: 'premium' });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Premium subscription required');
    });
  });

  describe('OpenAI Configuration', () => {
    it('should return 500 when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('AI service not configured');
    });
  });

  describe('URL Validation', () => {
    it('should return 400 when URL is missing', async () => {
      const { POST } = await import('./route');
      const request = createRequest({});
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Article URL is required');
    });

    it('should return 400 when URL is not a string', async () => {
      const { POST } = await import('./route');
      const request = createRequest({ url: 123 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Article URL is required');
    });

    it('should return 400 when URL is invalid', async () => {
      const { POST } = await import('./route');
      const request = createRequest({ url: 'not-a-valid-url' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid URL format');
    });
  });

  describe('Summary Caching', () => {
    it('should return cached summary when available', async () => {
      const cachedSummary = {
        title: 'Cached Summary',
        summary: 'This is a cached summary.',
        keyPoints: ['Point 1'],
        images: [],
        publishedDate: null,
        author: 'Jane Doe',
        source: 'example.com',
      };
      mockSummaryCacheGet.mockResolvedValue(cachedSummary);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.cached).toBe(true);
      expect(data.data).toEqual(cachedSummary);
      // Should not call extractor or OpenAI
      expect(mockExtractArticle).not.toHaveBeenCalled();
      expect(mockOpenAICreate).not.toHaveBeenCalled();
    });

    it('should cache summary after successful generation', async () => {
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: mockExtractedContent,
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      expect(mockSummaryCacheSet).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          title: 'Test Article Title',
          summary: expect.any(String),
        })
      );
    });
  });

  describe('Content Caching', () => {
    it('should use cached content when available', async () => {
      mockContentCacheGet.mockResolvedValue(mockExtractedContent);
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      // Should not call extractor when content is cached
      expect(mockExtractArticle).not.toHaveBeenCalled();
      // Should still call OpenAI for summarization
      expect(mockOpenAICreate).toHaveBeenCalled();
    });

    it('should cache content after extraction', async () => {
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: mockExtractedContent,
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      expect(mockContentCacheSet).toHaveBeenCalledWith(
        'https://example.com/article',
        mockExtractedContent
      );
    });
  });

  describe('Article Extraction with Puppeteer Fallback', () => {
    it('should use article extractor for content extraction', async () => {
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: mockExtractedContent,
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      expect(mockExtractArticle).toHaveBeenCalledWith('https://example.com/article');
    });

    it('should return 502 when extraction fails with network error', async () => {
      mockExtractArticle.mockResolvedValue({
        success: false,
        error: 'Failed to fetch article from any source',
        errorCode: 502,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/blocked' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article from any source');
    });

    it('should return 422 when content cannot be extracted', async () => {
      mockExtractArticle.mockResolvedValue({
        success: false,
        error: 'Could not extract article content',
        errorCode: 422,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/empty' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Could not extract article content');
    });

    it('should handle extraction via Puppeteer fallback', async () => {
      const puppeteerContent = {
        ...mockExtractedContent,
        fetchMethod: 'puppeteer' as const,
      };
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: puppeteerContent,
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/403-blocked' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Content was cached
      expect(mockContentCacheSet).toHaveBeenCalledWith(
        'https://example.com/403-blocked',
        expect.objectContaining({ fetchMethod: 'puppeteer' })
      );
    });
  });

  describe('Successful Summarization', () => {
    beforeEach(() => {
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: mockExtractedContent,
      });
    });

    it('should return summary on success', async () => {
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({
        title: 'Test Article Title',
        summary: 'This is a summary of the test article discussing important topics.',
        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
        images: [],
        publishedDate: null,
        author: 'John Doe',
        source: 'example.com',
      });
    });

    it('should call OpenAI with correct parameters', async () => {
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          max_tokens: 1500,
          temperature: 0.3,
        }),
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should include article content in the prompt', async () => {
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('Content:');
      expect(userMessage.content).toContain('first paragraph');
    });

    it('should ensure keyPoints array exists even if empty', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Test',
                summary: 'Summary text',
                images: [],
                publishedDate: null,
                author: null,
                source: 'example.com',
              }),
            },
          },
        ],
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.keyPoints).toEqual([]);
    });

    it('should ensure images array exists even if empty', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Test',
                summary: 'Summary text',
                keyPoints: ['Point 1'],
                publishedDate: null,
                author: null,
                source: 'example.com',
              }),
            },
          },
        ],
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.images).toEqual([]);
    });
  });

  describe('OpenAI Error Handling', () => {
    beforeEach(() => {
      mockExtractArticle.mockResolvedValue({
        success: true,
        content: mockExtractedContent,
      });
    });

    it('should return 500 when OpenAI returns no content', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to generate summary');
    });

    it('should return 500 when OpenAI response is missing title', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Summary without title',
                keyPoints: [],
                images: [],
              }),
            },
          },
        ],
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid summary generated');
    });

    it('should return 500 when OpenAI response is missing summary', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Title without summary',
                keyPoints: [],
                images: [],
              }),
            },
          },
        ],
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid summary generated');
    });

    it('should return 503 when OpenAI API throws an APIError', async () => {
      mockOpenAICreate.mockRejectedValue(new MockAPIError(429, 'Rate limit exceeded'));

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toContain('AI service error');
    });

    it('should return 500 for non-OpenAI errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Unknown error'));

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to summarize article');
    });
  });

  describe('Content Truncation', () => {
    it('should truncate very long content', async () => {
      // Generate content longer than 15000 chars
      const longTextContent = 'A'.repeat(20000);
      const longContent = {
        ...mockExtractedContent,
        textContent: longTextContent,
      };

      mockExtractArticle.mockResolvedValue({
        success: true,
        content: longContent,
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      // Content should be truncated and end with '...'
      expect(userMessage.content).toContain('...');
      // Should be around 15000 chars max for the content portion
      expect(userMessage.content.length).toBeLessThan(20000);
    });
  });
});
