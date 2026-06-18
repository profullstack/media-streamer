/**
 * GET /api/finance/fundamentals?symbol=SPY
 *
 * Finviz snapshot for the ticker page: the full valuation / performance /
 * technical / fund / dividend table plus the company description. Paid-gated
 * and read-through cached (fundamentals move slowly). This is public market
 * data, sourced independently of the user's broker, so the cache key is fixed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getFinvizFundamentals } from '@/lib/finance/market-data';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { readThrough, FUNDAMENTALS_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import type { Fundamentals } from '@/lib/finance/market-data/types';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const symbol = normalizeSymbol(request.nextUrl.searchParams.get('symbol') ?? '');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  try {
    const fundamentals = await readThrough<Fundamentals | null>(
      symbol,
      'fundamentals:finviz',
      FUNDAMENTALS_TTL_SECONDS,
      () => getFinvizFundamentals(symbol),
    );
    return NextResponse.json({ fundamentals });
  } catch (error) {
    console.error('[finance/fundamentals] error:', error);
    // Soft-fail: the section is supplementary, so never break the page.
    return NextResponse.json({ fundamentals: null });
  }
}
