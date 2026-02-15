/**
 * Amazon Product Search API Route
 *
 * GET /api/amazon/search?title=...&contentType=...
 *
 * Searches Amazon via Rainforest API and returns the first result's
 * product URL (with affiliate tag) and image. Used for "Buy on Amazon" links.
 */

import { NextRequest, NextResponse } from 'next/server';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || 'AFE7ECC9F15F44EDB49BE6E9A203CC5F';
const AMAZON_ASSOCIATE_ID = 'media-streamer-20';
const RAINFOREST_BASE = 'https://api.rainforestapi.com/request';

/**
 * Map content types to Amazon category IDs for more relevant results
 */
const CATEGORY_MAP: Record<string, string> = {
  movie: '2625373011',    // Movies & TV
  tvshow: '2625373011',   // Movies & TV
  music: '5174',          // CDs & Vinyl
  book: '283155',         // Books
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title')?.trim();
  const contentType = searchParams.get('contentType')?.trim() || '';
  const year = searchParams.get('year')?.trim() || '';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    // Append year to search for better results (e.g. "Valkyrie 2008" vs just "Valkyrie")
    const searchTerm = year ? `${title} ${year}` : title;

    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: searchTerm,
      sort_by: 'most_reviews',
      associate_id: AMAZON_ASSOCIATE_ID,
    });

    // Add category filter if we know the content type
    const categoryId = CATEGORY_MAP[contentType];
    if (categoryId) {
      params.set('category_id', categoryId);
    }

    const res = await fetch(`${RAINFOREST_BASE}?${params.toString()}`, {
      next: { revalidate: 86400 }, // Cache for 24h
    });

    if (!res.ok) {
      console.error(`[Amazon Search] Rainforest API error: ${res.status}`);
      return NextResponse.json({ error: 'Amazon search failed' }, { status: 502 });
    }

    const data = await res.json();
    const results = data?.search_results || [];

    if (results.length === 0) {
      return NextResponse.json({ result: null });
    }

    // Return the first result
    const first = results[0];
    return NextResponse.json({
      result: {
        title: first.title || title,
        url: first.link || first.url || null,
        image: first.image || null,
        price: first.price?.raw || first.price?.value || null,
        rating: first.rating || null,
        asin: first.asin || null,
      },
    });
  } catch (err) {
    console.error('[Amazon Search] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
