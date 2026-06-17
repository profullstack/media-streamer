/**
 * GET /api/finance/asset?symbol=NVDA
 *
 * Company / asset metadata for the ticker page (name, exchange, class, and the
 * Alpaca tradability flags). Paid-gated; resolves the per-profile provider
 * (connected Alpaca → app default) and read-through caches the result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getActiveBrokerCreds } from '@/lib/finance/brokers/service';
import { getMarketDataProviderForProfile } from '@/lib/finance/market-data/for-profile';
import { readThrough, QUOTE_TTL_SECONDS } from '@/lib/finance/market-data/cache';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import type { AssetInfo } from '@/lib/finance/market-data/types';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const symbol = normalizeSymbol(request.nextUrl.searchParams.get('symbol') ?? '');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const profileId = await getActiveProfileId();
  const provider = await getMarketDataProviderForProfile(profileId);
  if (typeof provider.getAsset !== 'function') {
    return NextResponse.json({ asset: null });
  }

  // Asset metadata is account-agnostic, but a connected broker's keys can serve
  // it; vary the cache key by whether per-profile creds back the lookup.
  const hasBroker = profileId ? Boolean(await getActiveBrokerCreds(profileId, 'alpaca')) : false;
  const cacheKey = `asset:${provider.id}:${hasBroker ? 'broker' : 'app'}`;

  try {
    const asset = await readThrough<AssetInfo | null>(symbol, cacheKey, QUOTE_TTL_SECONDS, () =>
      provider.getAsset!(symbol),
    );
    return NextResponse.json({ asset });
  } catch {
    return NextResponse.json({ asset: null });
  }
}
