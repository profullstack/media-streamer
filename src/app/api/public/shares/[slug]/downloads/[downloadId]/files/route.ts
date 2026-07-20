import { NextRequest, NextResponse } from 'next/server';

import { listDownloadFiles, passCookieName } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/** GET — playable media files under one of the pass's completed downloads. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; downloadId: string }> }
): Promise<NextResponse> {
  const { slug, downloadId } = await params;
  const cookieValue = request.cookies.get(passCookieName(slug))?.value;
  const result = await listDownloadFiles(slug, cookieValue, downloadId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json(
    { files: result.files },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
