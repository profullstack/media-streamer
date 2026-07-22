import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { streamTitle, vodViewerCookieName } from '@/lib/vod';

// Pass-gated VOD playback proxy. A viewer with a weekly pass or a per-title
// grant (or the provider owner) streams the title; the upstream source URL is
// SSRF-checked and proxied so provider creds/tokens stay server-side.
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, slug: string, method: 'GET' | 'HEAD'): Promise<Response> {
  const titleId = request.nextUrl.searchParams.get('titleId');
  if (!titleId) return NextResponse.json({ error: 'titleId is required' }, { status: 400 });

  const viewerKey = request.cookies.get(vodViewerCookieName(slug))?.value;
  const user = await getCurrentUser().catch(() => null);

  return streamTitle(
    slug,
    viewerKey,
    titleId,
    {
      method,
      range: request.headers.get('range'),
      probe: Boolean(request.nextUrl.searchParams.get('probe')),
    },
    user?.id ?? null
  );
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
