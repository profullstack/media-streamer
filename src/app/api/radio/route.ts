/**
 * Radio API Route
 *
 * GET /api/radio - Search radio stations or browse a SiriusXM category.
 *
 * Query parameters:
 * - q: Search query (optional if cat is provided)
 * - cat: SiriusXM category ('sports' | 'news') for browse mode
 * - filter: Filter type (optional) - 's' for stations, 't' for topics, 'p' for programs
 * - limit: Maximum results (optional, default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRadioService } from '@/lib/radio';
import type { SiriusXmCategory } from '@/lib/radio';

const VALID_CATEGORIES: ReadonlyArray<SiriusXmCategory> = ['sports', 'news'];

function parseCategory(value: string | null): SiriusXmCategory | null {
  if (value && (VALID_CATEGORIES as readonly string[]).includes(value)) {
    return value as SiriusXmCategory;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const cat = parseCategory(searchParams.get('cat'));
  const filter = searchParams.get('filter') as 's' | 't' | 'p' | null;
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 50;
  const cappedLimit = Math.min(limit, 100);

  const trimmedQuery = query?.trim() ?? '';

  if (!trimmedQuery && !cat) {
    return NextResponse.json(
      { error: 'Search query is required' },
      { status: 400 }
    );
  }

  try {
    const service = getRadioService();

    if (!trimmedQuery && cat) {
      const stations = await service.getCategoryStations(cat);
      const sliced = stations.slice(0, cappedLimit);
      return NextResponse.json({ stations: sliced, total: sliced.length });
    }

    const stations = await service.searchStations({
      query: trimmedQuery,
      filter: filter || undefined,
      limit: cappedLimit,
      category: cat ?? undefined,
    });

    return NextResponse.json({ stations, total: stations.length });
  } catch (error) {
    console.error('[Radio API] Search error:', error);
    return NextResponse.json(
      { error: 'Failed to search radio stations' },
      { status: 500 }
    );
  }
}
