/**
 * News Article Summarization API Route
 *
 * Server-side endpoint that uses OpenAI to summarize news articles.
 * Only available to users with premium/trial/family subscription tiers.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
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
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Create the summarization prompt
    const systemPrompt = `You are an expert article summarizer. Given a news article URL, analyze and summarize the content.

Return a JSON object with the following structure:
{
  "title": "The article's main title",
  "summary": "A concise 2-3 paragraph summary of the article's main points",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "images": ["https://url-to-image-1.jpg", "https://url-to-image-2.jpg"],
  "publishedDate": "2024-01-15T12:00:00Z or null if not found",
  "author": "Author name or null if not found",
  "source": "Publication name or null if not found"
}

Guidelines:
- The summary should be informative and capture the essence of the article
- Include 3-5 key points as bullet points
- Extract any image URLs from the article (up to 3)
- If metadata (date, author, source) is not available, use null
- Keep the summary professional and neutral in tone`;

    const userPrompt = `Please fetch and summarize the article at this URL: ${url}`;

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
      return NextResponse.json(
        { success: false, error: 'AI service temporarily unavailable' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to summarize article' },
      { status: 500 }
    );
  }
}
