/**
 * @route GET /api/public/iptv/[slug] — secret-free metadata for a resale listing.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getPublicShare } from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const share = await getPublicShare(slug);
  if (!share) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  return NextResponse.json({ share }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
