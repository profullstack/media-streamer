import { NextRequest, NextResponse } from 'next/server';

import { browseCatalog } from '@/lib/vod';

export const dynamic = 'force-dynamic';

/** GET — browse a provider's catalog (public). `?q=` search, `?page=` paginate. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const q = request.nextUrl.searchParams.get('q') ?? undefined;
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1') || 1;
  const result = await browseCatalog(slug, { q, page, pageSize: 30 });
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
