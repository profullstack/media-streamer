/**
 * GET /api/finance/quotes?symbols=NVDA,AAPL,…
 *
 * Batch last-price + session quotes for the watchlist cards (PRD §3.1). Paid-
 * gated; uses the per-profile market-data provider (connected broker → Yahoo
 * fallback) and the shared read-through quote cache so polling many symbols
 * stays cheap. Returns `{ quotes: { SYM: Quote } }`, omitting symbols with no data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { type MarketDataProvider, type Quote } from '@/lib/finance/market-data';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { readThrough, QUOTE_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import { parseSymbolList } from '@/lib/finance/watchlist';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 60;

async function quoteFor(provider: MarketDataProvider, symbol: string): Promise<Quote | null> {
  return readThrough<Quote | null>(symbol, `quote:${provider.id}`, QUOTE_TTL_SECONDS, () =>
    provider.getQuote(symbol),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const { valid } = parseSymbolList(request.nextUrl.searchParams.get('symbols') ?? '');
  if (valid.length === 0) return NextResponse.json({ quotes: {} });

  const profileId = await getActiveProfileId();
  const provider = await getMarketDataProviderForProfile(profileId);

  const symbols = valid.slice(0, MAX_SYMBOLS);
  const entries = await Promise.all(
    symbols.map(async (symbol): Promise<[string, Quote | null]> => {
      try {
        return [symbol, await quoteFor(provider, symbol)];
      } catch {
        return [symbol, null];
      }
    }),
  );

  const quotes: Record<string, Quote> = {};
  for (const [symbol, quote] of entries) {
    if (quote) quotes[symbol] = quote;
  }

  return NextResponse.json({ quotes });
}
