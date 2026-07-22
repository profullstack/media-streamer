import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { downloadTitle, vodViewerCookieName } from '@/lib/vod';

// Pass-gated file download. Requires a per-title purchase whose access mode is
// 'download' (or the provider owner). A weekly pass grants streaming, not files.
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const titleId = request.nextUrl.searchParams.get('titleId');
  if (!titleId) return NextResponse.json({ error: 'titleId is required' }, { status: 400 });

  const viewerKey = request.cookies.get(vodViewerCookieName(slug))?.value;
  const user = await getCurrentUser().catch(() => null);
  return downloadTitle(slug, viewerKey, titleId, user?.id ?? null);
}
