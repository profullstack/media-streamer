/**
 * GET /api/finance/candles?symbol=&range=
 *
 * OHLCV for the chart (PRD §5). Paid-gated; read-through cached per range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { isTickerRange, getFallbackMarketDataProvider } from '@/lib/finance/market-data';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { readThrough, CANDLES_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import type { Candle, MarketDataProvider } from '@/lib/finance/market-data';

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

  const profileId = await getActiveProfileId();
  const provider = await getMarketDataProviderForProfile(profileId);

  const fetchFrom = (p: MarketDataProvider) =>
    readThrough<Candle[]>(
      symbol,
      `candles:${p.id}:${rangeParam}`,
      CANDLES_TTL_SECONDS,
      () => p.getCandles(symbol, rangeParam),
    );

  try {
    const candles = await fetchFrom(provider);
    return NextResponse.json({ symbol, range: rangeParam, candles, source: provider.id });
  } catch (error) {
    // The user's broker (e.g. Alpaca) failed — fall back to the keyless source so
    // the chart still renders instead of going blank.
    console.error(`[finance/candles] ${provider.id} failed, falling back:`, error);
    const fallback = getFallbackMarketDataProvider();
    if (fallback.id === provider.id) {
      return NextResponse.json({ error: 'failed to load candles' }, { status: 502 });
    }
    try {
      const candles = await fetchFrom(fallback);
      return NextResponse.json({ symbol, range: rangeParam, candles, source: fallback.id });
    } catch (fallbackError) {
      console.error('[finance/candles] fallback failed:', fallbackError);
      return NextResponse.json({ error: 'failed to load candles' }, { status: 502 });
    }
  }
}
