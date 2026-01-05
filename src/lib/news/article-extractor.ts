/**
 * Article Extractor
 *
 * Extracts article content using Readability with Puppeteer fallback
 * for sites that block regular fetch requests (403, paywall, etc.)
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { ArticleContent } from './content-cache';

/**
 * Maximum HTML size to process (500KB)
 */
const MAX_HTML_SIZE = 500000;

/**
 * Fetch timeout in milliseconds
 */
const FETCH_TIMEOUT = 30000;

/**
 * Puppeteer timeout in milliseconds
 */
const PUPPETEER_TIMEOUT = 45000;

/**
 * Result of extraction attempt
 */
export interface ExtractionResult {
  success: boolean;
  content?: ArticleContent;
  error?: string;
  errorCode?: number;
}

/**
 * Extract article content from HTML using Readability
 */
function extractWithReadability(
  html: string,
  url: string,
  fetchMethod: 'fetch' | 'puppeteer'
): ArticleContent | null {
  try {
    const { document } = parseHTML(html);
    // Set the document URL for Readability
    Object.defineProperty(document, 'URL', { value: url, writable: false });

    const reader = new Readability(document);
    const parsed = reader.parse();

    if (!parsed || !parsed.textContent) {
      return null;
    }

    return {
      title: parsed.title || 'Untitled',
      byline: parsed.byline || null,
      content: parsed.content || '',
      textContent: parsed.textContent,
      excerpt: parsed.excerpt || null,
      siteName: parsed.siteName || null,
      length: parsed.length || parsed.textContent.length,
      extractedAt: Date.now(),
      fetchMethod,
    };
  } catch (error) {
    console.error('[ArticleExtractor] Readability parse error:', error);
    return null;
  }
}

/**
 * Fetch article HTML using regular fetch
 */
async function fetchWithFetch(url: string): Promise<{ html: string; status: number } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    return {
      html: await response.text(),
      status: response.status,
    };
  } catch (error) {
    console.error('[ArticleExtractor] Fetch error:', error);
    return null;
  }
}

/**
 * Fetch article HTML using Puppeteer (headless browser)
 * This works for sites that block regular fetch or require JavaScript
 */
async function fetchWithPuppeteer(url: string): Promise<{ html: string; status: number } | null> {
  let browser;
  try {
    // Dynamic import to avoid loading Puppeteer when not needed
    const puppeteer = await import('puppeteer');

    console.log('[ArticleExtractor] Launching Puppeteer for:', url);

    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        void request.abort();
      } else {
        void request.continue();
      }
    });

    // Navigate to the page
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PUPPETEER_TIMEOUT,
    });

    // Wait a bit for any JavaScript to execute
    await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

    // Get the page HTML
    const html = await page.content();
    const status = response?.status() || 200;

    return { html, status };
  } catch (error) {
    console.error('[ArticleExtractor] Puppeteer error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract article content from a URL
 * Tries regular fetch first, falls back to Puppeteer on failure
 */
export async function extractArticle(url: string): Promise<ExtractionResult> {
  console.log('[ArticleExtractor] Extracting article:', url);

  // Try regular fetch first
  let fetchResult = await fetchWithFetch(url);
  let fetchMethod: 'fetch' | 'puppeteer' = 'fetch';

  // If fetch failed or returned error status, try Puppeteer
  if (!fetchResult || fetchResult.status >= 400) {
    console.log(
      '[ArticleExtractor] Fetch failed with status:',
      fetchResult?.status || 'network error',
      '- trying Puppeteer'
    );

    const puppeteerResult = await fetchWithPuppeteer(url);
    if (puppeteerResult && puppeteerResult.status < 400) {
      fetchResult = puppeteerResult;
      fetchMethod = 'puppeteer';
    } else if (!fetchResult) {
      // Puppeteer also failed and we have no content
      return {
        success: false,
        error: 'Failed to fetch article from any source',
        errorCode: 502,
      };
    }
    // If Puppeteer also failed but we have content from fetch (even with error status),
    // try to extract from it anyway - some sites return content with 403
  }

  // Limit HTML size
  let html = fetchResult.html;
  if (html.length > MAX_HTML_SIZE) {
    console.log('[ArticleExtractor] HTML too large, truncating:', html.length);
    html = html.substring(0, MAX_HTML_SIZE);
  }

  // Extract content with Readability
  const content = extractWithReadability(html, url, fetchMethod);

  if (!content) {
    return {
      success: false,
      error: 'Could not extract article content',
      errorCode: 422,
    };
  }

  console.log(
    '[ArticleExtractor] Successfully extracted article via',
    fetchMethod,
    '- length:',
    content.textContent.length
  );

  return {
    success: true,
    content,
  };
}
