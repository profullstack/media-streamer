/**
 * News API Route
 * 
 * Server-side endpoint for fetching news from TheNewsAPI.
 * The API key is stored securely in THENEWSAPI_API_KEY env var.
 */

import { NextRequest, NextResponse } from 'next/server';

const THENEWSAPI_BASE_URL = 'https://api.thenewsapi.com/v1/news/all';
const DEFAULT_SEARCH_TERM = '';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;

// Supported categories from TheNewsAPI
export const NEWS_CATEGORIES = [
  'general',
  'science',
  'sports',
  'business',
  'health',
  'entertainment',
  'tech',
  'politics',
  'food',
  'travel',
] as const;

export type NewsCategory = typeof NEWS_CATEGORIES[number];

interface TheNewsApiArticle {
  uuid: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  image_url: string | null;
  language: string;
  published_at: string;
  source: string;
  categories: string[];
  relevance_score: number | null;
}

interface TheNewsApiResponse {
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
  };
  data: TheNewsApiArticle[];
}

interface NewsArticle {
  uuid: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  source: string;
  categories: string[];
}

interface NewsResponse {
  articles: NewsArticle[];
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
  };
}

function transformArticle(article: TheNewsApiArticle): NewsArticle {
  return {
    uuid: article.uuid,
    title: article.title,
    description: article.description,
    snippet: article.snippet,
    url: article.url,
    imageUrl: article.image_url,
    publishedAt: article.published_at,
    source: article.source,
    categories: article.categories,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.THENEWSAPI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'News API not configured' },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search') || DEFAULT_SEARCH_TERM;
  const page = searchParams.get('page') || '1';
  const category = searchParams.get('category');

  // Parse and clamp limit
  let limit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  if (isNaN(limit) || limit < MIN_LIMIT) {
    limit = MIN_LIMIT;
  } else if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const url = new URL(THENEWSAPI_BASE_URL);
  url.searchParams.set('api_token', apiKey);
  // Only add search param if a search term is provided
  if (search) {
    url.searchParams.set('search', search);
  }
  url.searchParams.set('sort', 'published_at');
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', page);

  // Add category filter if provided and valid
  if (category && NEWS_CATEGORIES.includes(category as NewsCategory)) {
    url.searchParams.set('categories', category);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch news from external API' },
        { status: 502 }
      );
    }

    const data: TheNewsApiResponse = await response.json();

    const newsResponse: NewsResponse = {
      articles: data.data.map(transformArticle),
      meta: data.meta,
    };

    return NextResponse.json(newsResponse);
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
