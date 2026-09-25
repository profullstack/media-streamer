/**
 * An advert for a break in the radio player.
 *
 * Unauthenticated on purpose: the listeners who get adverts are the ones who
 * have not signed in. Nothing about which advert plays is decided here — that
 * is the ad network's auction, and it meters the impression — so this must not
 * cache or ask twice for one break.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nextAdvert } from '@/lib/ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const kind = new URL(request.url).searchParams.get('kind');
  return NextResponse.json(await nextAdvert(kind), {
    // Never cached: every fill is metered, and a cached one is an impression
    // that happened without being counted.
    headers: { 'cache-control': 'no-store' },
  });
}
