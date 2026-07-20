import { NextRequest, NextResponse } from 'next/server';

import { getGrantStatus } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/**
 * GET — poll a session pass's payment status. The /rent page polls this after
 * returning from CoinPay; the pass cookie was already set at checkout, so once
 * this reports `paid` the player unlocks.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; grantId: string }> }
): Promise<NextResponse> {
  const { slug, grantId } = await params;
  const status = await getGrantStatus(slug, grantId);
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(
    { status: status.status, expiresAt: status.expiresAt },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
