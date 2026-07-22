import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getPublicProvider, isProviderOwnedBy } from '@/lib/vod';

export const dynamic = 'force-dynamic';

/** GET — public metadata + pricing for a VOD library; flags the owner (free access). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const provider = await getPublicProvider(slug);
  if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getCurrentUser().catch(() => null);
  const isOwner = await isProviderOwnedBy(slug, user?.id);
  return NextResponse.json({ provider, isOwner }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
