import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getRentalActivity } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/** GET — paid/pending session passes + download count + gross totals for a rental. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { id } = await params;
  const activity = await getRentalActivity(id, user.id);
  if (!activity) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }

  const paid = activity.grants.filter((g) => g.status === 'paid');
  return NextResponse.json(
    {
      share: activity.share,
      grants: activity.grants,
      summary: {
        totalGrants: activity.grants.length,
        paidGrants: paid.length,
        downloadCount: activity.downloadCount,
        grossUsd: activity.share.earningsUsd,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
