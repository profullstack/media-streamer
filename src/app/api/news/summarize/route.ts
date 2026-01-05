/**
 * News Article Summarization API Route
 *
 * Server-side endpoint that uses OpenAI to summarize news articles.
 * Fetches article content using Readability for clean extraction.
 * Only available to users with premium/trial/family subscription tiers.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';
import { getNewsSummaryCache, type ArticleSummary } from '@/lib/news/summary-cache';

interface SummarizeRequest {
  url: string;
}

interface SummarizeResponse {
  success: boolean;
  data?: ArticleSummary;
  cached?: boolean;
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SummarizeResponse>> {
  console.log('[Summarize] Request received');

  try {
    // Check authentication
    console.log('[Summarize] Checking authentication...');
    const user = await getCurrentUser();
    if (!user) {
      console.log('[Summarize] No user found');
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    console.log('[Summarize] User authenticated:', user.id);

    // Check subscription tier
    console.log('[Summarize] Checking subscription...');
    const subscriptionRepo = getSubscriptionRepository();
    const subscription = await subscriptionRepo.getSubscriptionStatus(user.id);
    console.log('[Summarize] Subscription status:', subscription?.is_active);

    if (!subscription || !subscription.is_active) {
      return NextResponse.json(
        { success: false, error: 'Premium subscription required' },
        { status: 403 }
      );
    }

    // Validate OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = (await request.json()) as SummarizeRequest;
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Article URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let articleUrl: URL;
    try {
      articleUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Check cache first to avoid AI costs
    const cache = getNewsSummaryCache();
    const cachedSummary = await cache.get(url);
    if (cachedSummary) {
      console.log('[Summarize] Returning cached summary for:', url);
      return NextResponse.json({
        success: true,
        data: cachedSummary,
        cached: true,
      });
    }

    // Fetch the article HTML
    console.log('[Summarize] Fetching article:', url);
    let articleHtml: string;
    try {
      const articleResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!articleResponse.ok) {
        console.log('[Summarize] Article fetch failed:', articleResponse.status);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch article' },
          { status: 502 }
        );
      }

      articleHtml = await articleResponse.text();
      console.log('[Summarize] Article fetched, length:', articleHtml.length);
    } catch (fetchError) {
      console.error('[Summarize] Article fetch error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch article' },
        { status: 502 }
      );
    }

    // Limit HTML size to prevent blocking the event loop
    const maxHtmlSize = 500000; // 500KB max
    if (articleHtml.length > maxHtmlSize) {
      console.log('[Summarize] HTML too large, truncating:', articleHtml.length);
      articleHtml = articleHtml.substring(0, maxHtmlSize);
    }

    // Parse with Readability using linkedom (much faster than JSDOM)
    console.log('[Summarize] Parsing with Readability...');
    let articleTitle: string | undefined;
    let articleByline: string | undefined;
    let articleText: string | undefined;

    try {
      const { document } = parseHTML(articleHtml);
      // Set the document URL for Readability
      Object.defineProperty(document, 'URL', { value: url, writable: false });

      const reader = new Readability(document);
      const parsed = reader.parse();
      if (parsed) {
        articleTitle = parsed.title ?? undefined;
        articleByline = parsed.byline ?? undefined;
        articleText = parsed.textContent ?? undefined;
      }
    } catch (parseError) {
      console.error('[Summarize] Parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse article' },
        { status: 422 }
      );
    }

    if (!articleText) {
      console.log('[Summarize] Failed to extract article content');
      return NextResponse.json(
        { success: false, error: 'Could not extract article content' },
        { status: 422 }
      );
    }
    console.log('[Summarize] Article parsed, content length:', articleText.length);

    // Truncate content if too long (OpenAI has token limits)
    const maxContentLength = 15000;
    const truncatedContent = articleText.length > maxContentLength
      ? articleText.substring(0, maxContentLength) + '...'
      : articleText;

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Create the summarization prompt
    const systemPrompt = `You are an expert article summarizer. Given a news article's text content, analyze and summarize it.

Return a JSON object with the following structure:
{
  "title": "The article's main title",
  "summary": "A concise 2-3 paragraph summary of the article's main points",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "images": [],
  "publishedDate": null,
  "author": "Author name or null if not found in the text",
  "source": "${articleUrl.hostname}"
}

Guidelines:
- The summary should be informative and capture the essence of the article
- Include 3-5 key points as bullet points
- If metadata (date, author) is not mentioned in the text, use null
- Keep the summary professional and neutral in tone`;

    const userPrompt = `Please summarize the following article:

Title: ${articleTitle || 'Unknown'}
Author: ${articleByline || 'Unknown'}

Content:
${truncatedContent}`;

    // Call OpenAI API with timeout
    console.log('[Summarize] Calling OpenAI API...');
    const completion = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
        temperature: 0.3,
      },
      {
        timeout: 60000, // 60 second timeout
      }
    );
    console.log('[Summarize] OpenAI response received');

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate summary' },
        { status: 500 }
      );
    }

    // Parse the response
    const summaryData = JSON.parse(content) as ArticleSummary;

    // Validate required fields
    if (!summaryData.title || !summaryData.summary) {
      return NextResponse.json(
        { success: false, error: 'Invalid summary generated' },
        { status: 500 }
      );
    }

    // Ensure arrays exist
    summaryData.keyPoints = summaryData.keyPoints || [];
    summaryData.images = summaryData.images || [];

    // Cache the summary for 8 hours to avoid repeated AI costs
    await cache.set(url, summaryData);
    console.log('[Summarize] Cached summary for:', url);

    return NextResponse.json({
      success: true,
      data: summaryData,
      cached: false,
    });
  } catch (error) {
    console.error('Article summarization error:', error);

    // Handle OpenAI-specific errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
      });
      return NextResponse.json(
        { success: false, error: `AI service error: ${error.message}` },
        { status: 503 }
      );
    }

    // Log the full error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Non-OpenAI error:', errorMessage);

    return NextResponse.json(
      { success: false, error: 'Failed to summarize article' },
      { status: 500 }
    );
  }
}
