/**
 * GET /api/finance/holdings[?symbol=] — synced read-only positions (PRD §5).
 *
 * Paid-gated, profile-scoped. Optional `symbol` filter powers the chart overlay
 * on the ticker page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getHoldings } from '@/lib/finance/brokers/service';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const symbolParam = request.nextUrl.searchParams.get('symbol');
  const symbol = symbolParam ? normalizeSymbol(symbolParam) : undefined;

  return NextResponse.json({ holdings: await getHoldings(profileId, symbol) });
}
