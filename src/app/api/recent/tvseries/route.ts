/**
 * Recent TV Series API
 *
 * GET /api/recent/tvseries?page=1
 *
 * Returns recently airing TV series from TMDB,
 * enriched with cast and director credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getTMDBService } from '@/lib/tmdb';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!process.env.TMDB_API_KEY) {
    return NextResponse.json({ error: 'TMDB API not configured' }, { status: 500 });
  }

  try {
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10));
    const tmdbService = getTMDBService();
    const result = await tmdbService.getRecentTVSeries(page);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    });
  } catch (error) {
    console.error('[Recent] Error fetching TV series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent TV series' },
      { status: 500 },
    );
  }
}
