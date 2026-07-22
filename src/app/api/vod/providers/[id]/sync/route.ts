import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { VodError, syncProvider } from '@/lib/vod';

export const dynamic = 'force-dynamic';
// Catalog pulls (esp. large Xtream/http-library sources) can take a while.
export const maxDuration = 120;

/**
 * POST — pull the provider's catalog into the searchable cache. Incremental by
 * default (only new titles are processed + written); `?full=1` re-processes all.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const full = request.nextUrl.searchParams.get('full') === '1';
  try {
    const result = await syncProvider(id, user.id, { full });
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof VodError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
