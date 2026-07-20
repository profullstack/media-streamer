import { NextRequest, NextResponse } from 'next/server';

import { passCookieName, resolvePass, streamForPass } from '@/lib/seedbox/shares';

// Payer-scoped playback proxy for a rental. A valid, paid, unexpired session
// pass may stream only files belonging to torrents it added. The proxy/transcode
// logic is the shared `streamSeedboxFile` helper; the owner's files-server token
// stays server-side.
export const dynamic = 'force-dynamic';

async function proxy(
  request: NextRequest,
  slug: string,
  method: 'GET' | 'HEAD'
): Promise<Response> {
  const pass = await resolvePass(slug, request.cookies.get(passCookieName(slug))?.value);
  if (!pass.ok) {
    return NextResponse.json({ error: pass.message }, { status: pass.status });
  }

  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'A file path is required' }, { status: 400 });
  }

  return streamForPass(pass.share, pass.grant, filePath, {
    method,
    range: request.headers.get('range'),
    probe: Boolean(request.nextUrl.searchParams.get('probe')),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  return proxy(request, slug, 'GET');
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  return proxy(request, slug, 'HEAD');
}
