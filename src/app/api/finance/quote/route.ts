/**
 * GET /api/finance/quote?symbol=
 *
 * Last price + key stats for a symbol (PRD §5). Paid-gated; read-through cached.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { getFallbackMarketDataProvider } from '@/lib/finance/market-data';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { readThrough, QUOTE_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import type { Quote } from '@/lib/finance/market-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const raw = request.nextUrl.searchParams.get('symbol');
  if (!raw) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const symbol = normalizeSymbol(raw);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  try {
    const profileId = await getActiveProfileId();
    const provider = await getMarketDataProviderForProfile(profileId);

    let quote: Quote | null;
    try {
      quote = await readThrough<Quote | null>(
        symbol,
        `quote:${provider.id}`,
        QUOTE_TTL_SECONDS,
        () => provider.getQuote(symbol),
      );
    } catch (err) {
      // Broker (e.g. Alpaca) failed — fall back to the keyless source.
      console.error(`[finance/quote] ${provider.id} failed, falling back:`, err);
      const fallback = getFallbackMarketDataProvider();
      quote =
        fallback.id === provider.id
          ? null
          : await readThrough<Quote | null>(
              symbol,
              `quote:${fallback.id}`,
              QUOTE_TTL_SECONDS,
              () => fallback.getQuote(symbol),
            );
    }

    if (!quote) {
      return NextResponse.json({ error: 'no data for symbol' }, { status: 404 });
    }

    return NextResponse.json({ quote });
  } catch (error) {
    console.error('[finance/quote] error:', error);
    return NextResponse.json({ error: 'failed to load quote' }, { status: 502 });
  }
}
