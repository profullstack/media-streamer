import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getPublicShare, isShareOwnedBy } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/** GET — public, secret-free metadata for a rental (for the /rent/[slug] page).
 * Also reports whether the caller is the owner, so the page can offer them a
 * free pass instead of a paywall (owners never pay for their own seedbox). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const share = await getPublicShare(slug);
  if (!share) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  const user = await getCurrentUser().catch(() => null);
  const isOwner = await isShareOwnedBy(slug, user?.id);
  return NextResponse.json(
    { share, isOwner },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
