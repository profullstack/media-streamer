import { NextRequest, NextResponse } from 'next/server';

import { getAccessSummary, vodViewerCookieName } from '@/lib/vod';
import { withVaultErrors } from '@/lib/vault/route';

export const dynamic = 'force-dynamic';

/** GET — what the current anonymous viewer can play/download on this provider. */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const viewerKey = request.cookies.get(vodViewerCookieName(slug))?.value;
  const summary = await getAccessSummary(slug, viewerKey);
  if (!summary) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(summary, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withVaultErrors(handleGET);
