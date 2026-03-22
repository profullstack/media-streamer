/**
 * Amazon Product Search API Route
 *
 * GET /api/amazon/search?title=...&contentType=...
 *
 * Searches Amazon via Rainforest API and returns the first result's
 * product URL (with affiliate tag) and image. Used for "Buy on Amazon" links.
 *
 * Results are cached in Supabase for 30 days to minimize API usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Read at runtime to support test env overrides
function getRainforestKey() { return process.env.RAINFOREST_API_KEY || ''; }
const AMAZON_ASSOCIATE_ID = 'media-streamer-20';
const RAINFOREST_BASE = 'https://api.rainforestapi.com/request';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Map content types to Amazon category IDs for more relevant results
 */
const CATEGORY_MAP: Record<string, string> = {
  movie: '2625373011',    // Movies & TV
  tvshow: '2625373011',   // Movies & TV
  music: '5174',          // CDs & Vinyl
  book: '283155',         // Books
};

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Generate a normalized cache key from search parameters
 */
function getCacheKey(title: string, contentType: string): string {
  return `${title.toLowerCase().trim()}|${contentType.toLowerCase().trim()}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title')?.trim();
  const contentType = searchParams.get('contentType')?.trim() || '';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const cacheKey = getCacheKey(title, contentType);
  const supabase = getSupabase();

  // ── 1. Check cache first ──
  if (supabase) {
    try {
      const { data: cached } = await supabase
        .from('amazon_search_cache')
        .select('result, expires_at')
        .eq('search_key', cacheKey)
        .single();

      if (cached) {
        const isExpired = new Date(cached.expires_at) < new Date();
        if (!isExpired) {
          // Cache hit — return stored result (may be null = no result)
          return NextResponse.json({ result: cached.result || null });
        }
        // Expired — delete and re-fetch
        await supabase.from('amazon_search_cache').delete().eq('search_key', cacheKey);
      }
    } catch {
      // Cache miss or error — proceed to API
    }
  }

  // ── 2. Fetch from Rainforest API ──
  if (!getRainforestKey()) {
    return NextResponse.json({ result: null });
  }

  try {
    const searchTerm = title;

    const params = new URLSearchParams({
      api_key: getRainforestKey(),
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: searchTerm,
      sort_by: 'average_review',
      associate_id: AMAZON_ASSOCIATE_ID,
    });

    // Add category filter if we have a known content type
    const categoryId = CATEGORY_MAP[contentType];
    if (categoryId) {
      params.set('category_id', categoryId);
    }

    const res = await fetch(`${RAINFOREST_BASE}?${params.toString()}`, {
      next: { revalidate: 86400 }, // Also use Next.js fetch cache as secondary layer
    });

    if (!res.ok) {
      console.error(`[Amazon Search] Rainforest API error: ${res.status}`);
      return NextResponse.json({ error: 'Amazon search failed' }, { status: 502 });
    }

    const data = await res.json();
    const results = data?.search_results || [];

    let result = null;
    if (results.length > 0) {
      const first = results[0];
      result = {
        title: first.title || title,
        url: first.link || first.url || null,
        image: first.image || null,
        price: first.price?.raw || first.price?.value || null,
        rating: first.rating || null,
        asin: first.asin || null,
      };
    }

    // ── 3. Store in cache (including null results to avoid re-querying) ──
    if (supabase) {
      try {
        await supabase.from('amazon_search_cache').upsert(
          {
            search_key: cacheKey,
            title,
            content_type: contentType || null,
            result,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'search_key' }
        );
      } catch (err) {
        console.error('[Amazon Search] Cache write failed:', err);
        // Non-fatal — still return the result
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[Amazon Search] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
