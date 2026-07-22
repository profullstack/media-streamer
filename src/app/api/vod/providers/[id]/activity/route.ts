import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getProviderActivity } from '@/lib/vod';

export const dynamic = 'force-dynamic';

/** GET — grants + gross totals for a provider. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const activity = await getProviderActivity(id, user.id);
  if (!activity) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const paid = activity.grants.filter((g) => g.status === 'paid');
  return NextResponse.json(
    {
      provider: activity.provider,
      grants: activity.grants,
      summary: {
        totalGrants: activity.grants.length,
        paidGrants: paid.length,
        weeklyPasses: paid.filter((g) => g.grantKind === 'weekly').length,
        titleSales: paid.filter((g) => g.grantKind === 'title').length,
        grossUsd: activity.provider.earningsUsd,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
