/**
 * Article Extractor
 *
 * Extracts article content using Readability with fetch + Puppeteer fallback.
 * Tries fetch with multiple user agents first, then falls back to Puppeteer
 * for sites that block all fetch attempts.
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import puppeteer from 'puppeteer';
import type { ArticleContent } from './content-cache';

/**
 * Maximum HTML size to process (500KB)
 */
const MAX_HTML_SIZE = 500000;

/**
 * Fetch timeout in milliseconds
 */
const FETCH_TIMEOUT = 15000;

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
 * User agents to rotate through when sites block requests
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

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
 * Fetch article HTML using fetch with a specific user agent
 */
async function fetchWithUserAgent(
  url: string,
  userAgent: string
): Promise<{ html: string; status: number } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
 * Fetch article HTML using Puppeteer as a fallback.
 * Browser is always closed in a finally block to prevent memory leaks.
 */
async function fetchWithPuppeteer(url: string): Promise<string | null> {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(USER_AGENTS[0]);

    // Block unnecessary resources to save memory/bandwidth
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: FETCH_TIMEOUT });
    await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

    const html = await page.content();
    return html;
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
 * Extract article content from a URL.
 * Tries fetch with multiple user agents first, then falls back to Puppeteer.
 */
export async function extractArticle(url: string): Promise<ExtractionResult> {
  console.log('[ArticleExtractor] Extracting article:', url);

  let fetchResult: { html: string; status: number } | null = null;

  // Try each user agent until one succeeds
  for (const userAgent of USER_AGENTS) {
    fetchResult = await fetchWithUserAgent(url, userAgent);
    if (fetchResult && fetchResult.status < 400) {
      break;
    }
  }

  // If fetch succeeded with a good status, try extraction
  if (fetchResult && fetchResult.status < 400) {
    let html = fetchResult.html;
    if (html.length > MAX_HTML_SIZE) {
      console.log('[ArticleExtractor] HTML too large, truncating:', html.length);
      html = html.substring(0, MAX_HTML_SIZE);
    }

    const content = extractWithReadability(html, url, 'fetch');
    if (content) {
      console.log(
        '[ArticleExtractor] Successfully extracted article - length:',
        content.textContent.length
      );
      return { success: true, content };
    }
  }

  // Fall back to Puppeteer
  console.log('[ArticleExtractor] Fetch failed or insufficient, falling back to Puppeteer');
  const puppeteerHtml = await fetchWithPuppeteer(url);

  if (!puppeteerHtml) {
    return {
      success: false,
      error: 'Failed to fetch article from any source',
      errorCode: 502,
    };
  }

  let html = puppeteerHtml;
  if (html.length > MAX_HTML_SIZE) {
    console.log('[ArticleExtractor] HTML too large, truncating:', html.length);
    html = html.substring(0, MAX_HTML_SIZE);
  }

  const content = extractWithReadability(html, url, 'puppeteer');

  if (!content) {
    return {
      success: false,
      error: 'Could not extract article content',
      errorCode: 422,
    };
  }

  console.log(
    '[ArticleExtractor] Successfully extracted article via Puppeteer - length:',
    content.textContent.length
  );

  return {
    success: true,
    content,
  };
}
