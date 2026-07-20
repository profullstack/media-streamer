import { NextRequest, NextResponse } from 'next/server';

import {
  RentalError,
  addDownload,
  listDownloadsWithProgress,
  passCookieName,
  resolvePass,
} from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

function passCookie(request: NextRequest, slug: string): string | undefined {
  return request.cookies.get(passCookieName(slug))?.value;
}

/** GET — list the pass's downloads with live progress. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const pass = await resolvePass(slug, passCookie(request, slug));
  if (!pass.ok) {
    return NextResponse.json({ error: pass.message }, { status: pass.status });
  }
  const downloads = await listDownloadsWithProgress(pass.share, pass.grant);
  return NextResponse.json(
    { downloads, maxDownloads: pass.share.maxDownloadsPerPass },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** POST — add a magnet to the owner's seedbox under this pass. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const pass = await resolvePass(slug, passCookie(request, slug));
  if (!pass.ok) {
    return NextResponse.json({ error: pass.message }, { status: pass.status });
  }
  const body = (await request.json().catch(() => ({}))) as { magnet?: string };
  try {
    const download = await addDownload(pass.share, pass.grant, body.magnet ?? '');
    return NextResponse.json({ download }, { status: 201 });
  } catch (error) {
    if (error instanceof RentalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
