/**
 * GET /api/finance/watchlist/changes?symbols=NVDA,AAPL,…
 *
 * Returns trailing 1 / 5 / 30-day percent gain/loss per symbol for the watchlist
 * cards. Paid-gated; uses the per-profile market-data provider (connected
 * broker → Yahoo fallback) and read-through caches each symbol's 1M candles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { type MarketDataProvider } from '@/lib/finance/market-data';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { readThrough, CANDLES_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import { parseSymbolList } from '@/lib/finance/watchlist';
import { computeChanges, EMPTY_CHANGES, type WatchlistChanges } from '@/lib/finance/performance';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 60;

async function changesFor(provider: MarketDataProvider, symbol: string): Promise<WatchlistChanges> {
  return readThrough<WatchlistChanges>(symbol, `changes:${provider.id}`, CANDLES_TTL_SECONDS, async () => {
    const candles = await provider.getCandles(symbol, '1M');
    return computeChanges(candles);
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const { valid } = parseSymbolList(request.nextUrl.searchParams.get('symbols') ?? '');
  if (valid.length === 0) return NextResponse.json({ changes: {} });

  const profileId = await getActiveProfileId();
  const provider = await getMarketDataProviderForProfile(profileId);

  const symbols = valid.slice(0, MAX_SYMBOLS);
  const entries = await Promise.all(
    symbols.map(async (symbol): Promise<[string, WatchlistChanges]> => {
      try {
        return [symbol, await changesFor(provider, symbol)];
      } catch {
        return [symbol, EMPTY_CHANGES];
      }
    }),
  );

  return NextResponse.json({ changes: Object.fromEntries(entries) });
}
