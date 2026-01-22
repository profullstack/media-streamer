/**
 * Radio API Route
 *
 * GET /api/radio - Search radio stations
 *
 * Query parameters:
 * - q: Search query (required)
 * - filter: Filter type (optional) - 's' for stations, 't' for topics, 'p' for programs
 * - limit: Maximum results (optional, default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRadioService } from '@/lib/radio';

/**
 * GET /api/radio?q=<query>
 *
 * Search for radio stations. No authentication required.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const filter = searchParams.get('filter') as 's' | 't' | 'p' | null;
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Search query is required' },
      { status: 400 }
    );
  }

  try {
    const service = getRadioService();
    const stations = await service.searchStations({
      query: query.trim(),
      filter: filter || undefined,
      limit: Math.min(limit, 100), // Cap at 100
    });

    return NextResponse.json({
      stations,
      total: stations.length,
    });
  } catch (error) {
    console.error('[Radio API] Search error:', error);
    return NextResponse.json(
      { error: 'Failed to search radio stations' },
      { status: 500 }
    );
  }
}
