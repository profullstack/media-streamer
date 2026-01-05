/**
 * News Article Content Extraction API Route
 *
 * Server-side endpoint that extracts article content using Readability.
 * Falls back to Puppeteer for sites that block regular fetch requests.
 * Returns clean article content for display when iframes are blocked.
 *
 * This endpoint does NOT require premium subscription - it's just content extraction.
 * AI summarization is a separate premium feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getNewsContentCache, type ArticleContent } from '@/lib/news/content-cache';
import { extractArticle } from '@/lib/news/article-extractor';

interface ExtractRequest {
  url: string;
}

interface ExtractResponse {
  success: boolean;
  data?: ArticleContent;
  cached?: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ExtractResponse>> {
  console.log('[Extract] Request received');

  try {
    // Check authentication (still require login)
    console.log('[Extract] Checking authentication...');
    const user = await getCurrentUser();
    if (!user) {
      console.log('[Extract] No user found');
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    console.log('[Extract] User authenticated:', user.id);

    // Parse request body
    const body = (await request.json()) as ExtractRequest;
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'Article URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid URL format' }, { status: 400 });
    }

    // Check cache first
    const cache = getNewsContentCache();
    const cachedContent = await cache.get(url);
    if (cachedContent) {
      console.log('[Extract] Returning cached content for:', url);
      return NextResponse.json({
        success: true,
        data: cachedContent,
        cached: true,
      });
    }

    // Extract article content (with Puppeteer fallback)
    console.log('[Extract] Extracting article:', url);
    const result = await extractArticle(url);

    if (!result.success || !result.content) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to extract article' },
        { status: result.errorCode || 502 }
      );
    }

    // Cache the extracted content
    await cache.set(url, result.content);
    console.log('[Extract] Cached content for:', url);

    return NextResponse.json({
      success: true,
      data: result.content,
      cached: false,
    });
  } catch (error) {
    console.error('[Extract] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to extract article: ${errorMessage}` }, { status: 500 });
  }
}
