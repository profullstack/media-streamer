/** @route GET /.well-known/openfile.json — the dataset mirror as an OpenFile descriptor (logicsrc.com/openfile). */
import { NextRequest, NextResponse } from 'next/server';
import { type Catalog, type MirrorState, openFileDescriptor } from '@/lib/academic/catalog';
import { getSubscriptionPrice } from '@/lib/payments';
import catalog from '@/data/academic/catalog.json';
import mirror from '@/data/academic/mirror.json';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest): NextResponse {
  const origin = new URL(request.url).origin;
  const plans = (['premium', 'family'] as const).map((plan) => ({
    plan,
    amountUsd: getSubscriptionPrice(plan).usd,
    per: 'year' as const,
  }));
  const body = openFileDescriptor(catalog as Catalog, mirror as MirrorState, origin, {
    plans,
    signup: `${origin}/pricing`,
  });
  return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=3600' } });
}
