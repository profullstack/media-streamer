/**
 * GET /api/finance/search?q=
 *
 * Symbol lookup / typeahead (PRD §5). Paid-gated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getMarketDataProvider } from '@/lib/finance/market-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await getMarketDataProvider().search(q);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[finance/search] error:', error);
    return NextResponse.json({ error: 'search failed' }, { status: 502 });
  }
}
