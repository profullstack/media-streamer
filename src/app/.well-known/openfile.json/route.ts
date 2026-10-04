/** @route GET /.well-known/openfile.json — the dataset mirror as an OpenFile descriptor (logicsrc.com/openfile). */
import { NextRequest, NextResponse } from 'next/server';
import { type Catalog, type MirrorState, openFileDescriptor } from '@/lib/academic/catalog';
import { ACADEMIC_LISTING } from '@/lib/academic/listing';
import { getSubscriptionPrice } from '@/lib/payments';
import { publicOrigin } from '@/lib/openswarm/service';
import catalog from '@/data/academic/catalog.json';
import mirror from '@/data/academic/mirror.json';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest): NextResponse {
  // Behind Railway's proxy request.url is localhost; the configured app URL wins.
  const origin = publicOrigin(new URL(request.url).origin);
  const plans = (['premium', 'family'] as const).map((plan) => ({
    plan,
    amountUsd: getSubscriptionPrice(plan).usd,
    per: 'year' as const,
  }));
  const descriptor = openFileDescriptor(catalog as Catalog, mirror as MirrorState, origin, {
    plans,
    signup: `${origin}/pricing`,
  });
  // Withdrawn: still a valid descriptor, with nothing in it and the reason beside it.
  const body = ACADEMIC_LISTING.listed
    ? descriptor
    : { ...descriptor, files: [], bittorrented: { ...descriptor.bittorrented, withdrawn: ACADEMIC_LISTING } };
  return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=300' } });
}
