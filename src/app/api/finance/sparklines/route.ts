/**
 * GET /api/finance/sparklines?symbols=NVDA,AAPL,…
 *
 * Returns last-week close samples per symbol for the tiny watchlist sparklines.
 * Paid-gated; uses the per-profile market-data provider (connected Alpaca →
 * Yahoo fallback) and read-through caches each symbol's samples.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getFallbackMarketDataProvider, type MarketDataProvider } from '@/lib/finance/market-data';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { readThrough, CANDLES_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import { parseSymbolList } from '@/lib/finance/watchlist';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 60;
const MAX_POINTS = 24;

/** Downsample an array to at most `max` evenly-spaced points (keeps last). */
function downsample(values: number[], max: number): number[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(values[Math.min(values.length - 1, Math.floor(i * step))]);
  out[out.length - 1] = values[values.length - 1];
  return out;
}

async function samplesFor(provider: MarketDataProvider, symbol: string): Promise<number[]> {
  return readThrough<number[]>(symbol, `sparkline:${provider.id}`, CANDLES_TTL_SECONDS, async () => {
    const candles = await provider.getCandles(symbol, '5D');
    return downsample(candles.map((c) => c.close), MAX_POINTS);
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const { valid } = parseSymbolList(request.nextUrl.searchParams.get('symbols') ?? '');
  if (valid.length === 0) return NextResponse.json({ samples: {} });

  const profileId = await getActiveProfileId();
  const provider = await getMarketDataProviderForProfile(profileId);
  const fallback = getFallbackMarketDataProvider();

  const symbols = valid.slice(0, MAX_SYMBOLS);
  const entries = await Promise.all(
    symbols.map(async (symbol): Promise<[string, number[]]> => {
      try {
        return [symbol, await samplesFor(provider, symbol)];
      } catch {
        try {
          return [symbol, await samplesFor(fallback, symbol)];
        } catch {
          return [symbol, []];
        }
      }
    }),
  );

  return NextResponse.json({ samples: Object.fromEntries(entries) });
}
