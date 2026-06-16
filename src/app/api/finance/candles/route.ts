/**
 * GET /api/finance/candles?symbol=&range=
 *
 * OHLCV for the chart (PRD §5). Paid-gated; read-through cached per range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getMarketDataProvider, isTickerRange } from '@/lib/finance/market-data';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { readThrough, CANDLES_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import type { Candle } from '@/lib/finance/market-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const raw = request.nextUrl.searchParams.get('symbol');
  const rangeParam = request.nextUrl.searchParams.get('range') ?? '1Y';

  if (!raw) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }
  if (!isTickerRange(rangeParam)) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 });
  }

  const symbol = normalizeSymbol(raw);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();
    const candles = await readThrough<Candle[]>(
      symbol,
      `candles:${provider.id}:${rangeParam}`,
      CANDLES_TTL_SECONDS,
      () => provider.getCandles(symbol, rangeParam),
    );

    return NextResponse.json({ symbol, range: rangeParam, candles });
  } catch (error) {
    console.error('[finance/candles] error:', error);
    return NextResponse.json({ error: 'failed to load candles' }, { status: 502 });
  }
}
