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
import { JSDOM } from 'jsdom';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

interface ArticleSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  images: string[];
  publishedDate: string | null;
  author: string | null;
  source: string | null;
}

interface SummarizeRequest {
  url: string;
}

interface SummarizeResponse {
  success: boolean;
  data?: ArticleSummary;
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SummarizeResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check subscription tier
    const subscriptionRepo = getSubscriptionRepository();
    const subscription = await subscriptionRepo.getSubscriptionStatus(user.id);

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

    // Fetch the article HTML
    let articleHtml: string;
    try {
      const articleResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!articleResponse.ok) {
        return NextResponse.json(
          { success: false, error: 'Failed to fetch article' },
          { status: 502 }
        );
      }

      articleHtml = await articleResponse.text();
    } catch (fetchError) {
      console.error('Article fetch error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch article' },
        { status: 502 }
      );
    }

    // Parse with Readability
    const dom = new JSDOM(articleHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      return NextResponse.json(
        { success: false, error: 'Could not extract article content' },
        { status: 422 }
      );
    }

    // Truncate content if too long (OpenAI has token limits)
    const maxContentLength = 15000;
    const truncatedContent = article.textContent.length > maxContentLength
      ? article.textContent.substring(0, maxContentLength) + '...'
      : article.textContent;

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

Title: ${article.title || 'Unknown'}
Author: ${article.byline || 'Unknown'}

Content:
${truncatedContent}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.3,
    });

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

    return NextResponse.json({
      success: true,
      data: summaryData,
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
