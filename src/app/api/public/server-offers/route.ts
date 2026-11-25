/**
 * GET /api/public/server-offers?preset=big|huge|starter
 *
 * Servers worth running a seedbox on, read from r4ck.dev and cached for an hour
 * (src/lib/r4ck/offers.ts). Public: it is a list of other companies' published prices
 * with links to r4ck.dev, shown on the seedbox page and on the page that sells the plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OFFER_PRESETS, getOffers } from '@/lib/r4ck/offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const list = await getOffers(request.nextUrl.searchParams.get('preset'));
  return NextResponse.json(
    {
      preset: list.preset.key,
      presets: OFFER_PRESETS.map(({ key, label, blurb }) => ({ key, label, blurb })),
      offers: list.offers,
      browseUrl: list.browseUrl,
      fetchedAt: list.fetchedAt,
      source: 'r4ck.dev',
    },
    { headers: { 'cache-control': 'public, max-age=300' } }
  );
}
