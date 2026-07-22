import { NextRequest, NextResponse } from 'next/server';

import { getGrantStatus } from '@/lib/vod';

export const dynamic = 'force-dynamic';

/** GET — poll a purchase's payment status (the page polls after returning from CoinPay). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; grantId: string }> }
): Promise<NextResponse> {
  const { slug, grantId } = await params;
  const status = await getGrantStatus(slug, grantId);
  if (!status) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(status, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
