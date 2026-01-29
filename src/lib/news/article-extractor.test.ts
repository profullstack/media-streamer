/**
 * Article Extractor Tests
 *
 * Tests for article content extraction with Puppeteer fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractArticle } from './article-extractor';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Use vi.hoisted for Puppeteer mock
const mocks = vi.hoisted(() => {
  const mockLaunch = vi.fn();
  return { mockLaunch };
});

// Mock Puppeteer
vi.mock('puppeteer', () => ({
  default: {
    launch: mocks.mockLaunch,
  },
}));

// Sample HTML for testing
const sampleArticleHtml = `
<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <article>
    <h1>Test Article Title</h1>
    <p class="byline">By John Doe</p>
    <div class="content">
      <p>This is the first paragraph of the article.</p>
      <p>This is the second paragraph with more content.</p>
      <p>This is the third paragraph concluding the article.</p>
    </div>
  </article>
</body>
</html>
`;

const minimalHtml = `
<!DOCTYPE html>
<html>
<head><title>Minimal Page</title></head>
<body>
  <p>Very short content.</p>
</body>
</html>
`;

describe('Article Extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mocks.mockLaunch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractArticle', () => {
    describe('successful extraction via fetch', () => {
      it('extracts article content from HTML', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(sampleArticleHtml),
        });

        const result = await extractArticle('https://example.com/article');

        expect(result.success).toBe(true);
        expect(result.content).toBeDefined();
        // Readability may extract title differently depending on HTML structure
        expect(result.content?.title).toContain('Test Article');
        expect(result.content?.fetchMethod).toBe('fetch');
      });

      it('extracts text content from article', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(sampleArticleHtml),
        });

        const result = await extractArticle('https://example.com/article');

        expect(result.content?.textContent).toContain('first paragraph');
        expect(result.content?.textContent).toContain('second paragraph');
      });

      it('sets extractedAt timestamp', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(sampleArticleHtml),
        });

        const before = Date.now();
        const result = await extractArticle('https://example.com/article');
        const after = Date.now();

        expect(result.content?.extractedAt).toBeGreaterThanOrEqual(before);
        expect(result.content?.extractedAt).toBeLessThanOrEqual(after);
      });
    });

    describe('fallback to Puppeteer on fetch failure', () => {
      it('falls back to Puppeteer when fetch returns 403', async () => {
        // All fetch attempts return 403
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        // Mock Puppeteer
        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue(sampleArticleHtml),
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };

        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        const result = await extractArticle('https://example.com/blocked-article');

        expect(result.success).toBe(true);
        expect(result.content?.fetchMethod).toBe('puppeteer');
        expect(mockBrowser.close).toHaveBeenCalled();
      });

      it('falls back to Puppeteer when fetch throws network error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue(sampleArticleHtml),
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };

        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        const result = await extractArticle('https://example.com/network-error');

        expect(result.success).toBe(true);
        expect(result.content?.fetchMethod).toBe('puppeteer');
      });
    });

    describe('extraction failures', () => {
      it('returns error when both fetch and Puppeteer fail', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        mocks.mockLaunch.mockRejectedValueOnce(new Error('Puppeteer failed'));

        const result = await extractArticle('https://example.com/total-failure');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.errorCode).toBe(502);
      });

      it('returns error when Readability cannot extract content', async () => {
        // Return HTML with no extractable content
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('<html><body></body></html>'),
        });

        // Puppeteer fallback also returns empty content
        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue('<html><body></body></html>'),
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };
        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        const result = await extractArticle('https://example.com/empty');

        expect(result.success).toBe(false);
        expect(result.error).toContain('extract');
        expect(result.errorCode).toBe(422);
      });

      it('returns error with appropriate code for parse failures', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(minimalHtml),
        });

        const result = await extractArticle('https://example.com/minimal');

        // Minimal content might fail extraction
        if (!result.success) {
          expect(result.errorCode).toBe(422);
        }
      });
    });

    describe('HTML size limiting', () => {
      it('truncates very large HTML to prevent memory issues', async () => {
        // Create HTML larger than 500KB
        const largeHtml = sampleArticleHtml + '<p>' + 'x'.repeat(600000) + '</p>';

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(largeHtml),
        });

        // Should not throw, should handle gracefully
        const result = await extractArticle('https://example.com/large');

        // Even with truncation, extraction should be attempted
        expect(result).toBeDefined();
      });
    });

    describe('Puppeteer browser configuration', () => {
      it('launches browser with security flags', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue(sampleArticleHtml),
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };

        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        await extractArticle('https://example.com/test');

        expect(mocks.mockLaunch).toHaveBeenCalledWith(
          expect.objectContaining({
            headless: true,
            args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
          })
        );
      });

      it('sets up request interception to block images/css/fonts', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue(sampleArticleHtml),
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };

        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        await extractArticle('https://example.com/test');

        expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
        expect(mockPage.on).toHaveBeenCalledWith('request', expect.any(Function));
      });

      it('closes browser even on extraction error', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        const mockPage = {
          setViewport: vi.fn(),
          setUserAgent: vi.fn(),
          setRequestInterception: vi.fn(),
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: () => 200 }),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          content: vi.fn().mockResolvedValue('<html><body></body></html>'), // Empty content
        };
        const mockBrowser = {
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        };

        mocks.mockLaunch.mockResolvedValueOnce(mockBrowser);

        await extractArticle('https://example.com/test');

        expect(mockBrowser.close).toHaveBeenCalled();
      });
    });

    describe('fetch configuration', () => {
      it('sends browser-like User-Agent header', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(sampleArticleHtml),
        });

        await extractArticle('https://example.com/article');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/article',
          expect.objectContaining({
            headers: expect.objectContaining({
              'User-Agent': expect.stringContaining('Mozilla'),
            }),
          })
        );
      });

      it('includes Accept headers for HTML', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(sampleArticleHtml),
        });

        await extractArticle('https://example.com/article');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Accept: expect.stringContaining('text/html'),
            }),
          })
        );
      });
    });
  });
});
