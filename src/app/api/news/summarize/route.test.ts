/**
 * News Summarize API Route Tests
 *
 * Tests for the article summarization endpoint that uses
 * Readability for content extraction and OpenAI for summarization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Use vi.hoisted to define mocks that will be used in vi.mock
const mocks = vi.hoisted(() => {
  const mockOpenAICreate = vi.fn();
  const mockGetCurrentUser = vi.fn();
  const mockGetSubscriptionStatus = vi.fn();

  class MockAPIError extends Error {
    status: number;
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

  return { mockOpenAICreate, MockAPIError, mockGetCurrentUser, mockGetSubscriptionStatus, MockOpenAI };
});

// Destructure for convenience
const { mockOpenAICreate, MockAPIError, mockGetCurrentUser, mockGetSubscriptionStatus, MockOpenAI } = mocks;

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

// Mock summary cache (Redis-based) to avoid Redis connection issues in tests
vi.mock('@/lib/news/summary-cache', () => ({
  getNewsSummaryCache: () => ({
    get: vi.fn().mockResolvedValue(null), // Always cache miss for testing
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Store original env
const originalEnv = process.env;

describe('News Summarize API Route', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-openai-key' };
    mockOpenAICreate.mockReset();
    mockGetCurrentUser.mockReset();
    mockGetSubscriptionStatus.mockReset();

    // Default: authenticated user with active subscription
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockGetSubscriptionStatus.mockResolvedValue({ is_active: true, tier: 'premium' });
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

  const mockArticleHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Article Title</title></head>
    <body>
      <article>
        <h1>Test Article Title</h1>
        <p class="byline">By John Doe</p>
        <p>This is the first paragraph of the article content. It contains important information about the topic being discussed.</p>
        <p>This is the second paragraph with more details about the subject matter.</p>
        <p>The article concludes with some final thoughts and analysis.</p>
      </article>
    </body>
    </html>
  `;

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

  describe('Article Fetching', () => {
    it('should return 502 when article fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article');
    });

    it('should return 502 when fetch throws an error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article');
    });

    it('should fetch article with proper headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockArticleHtml),
      });
      mockOpenAICreate.mockResolvedValue(mockOpenAIResponse);

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      await POST(request);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
          }),
        })
      );
    });
  });

  describe('Content Extraction', () => {
    it('should return 422 when Readability cannot extract content', async () => {
      // Completely empty HTML that Readability definitely cannot parse as an article
      const emptyHtml = '<!DOCTYPE html><html><head></head><body></body></html>';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(emptyHtml),
      });

      const { POST } = await import('./route');
      const request = createRequest({ url: 'https://example.com/article' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Could not extract article content');
    });
  });

  describe('Successful Summarization', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockArticleHtml),
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockArticleHtml),
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
      // Generate HTML with very long content
      const longContent = 'A'.repeat(20000);
      const longHtml = `
        <html>
        <body>
          <article>
            <h1>Long Article</h1>
            <p>${longContent}</p>
          </article>
        </body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(longHtml),
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
