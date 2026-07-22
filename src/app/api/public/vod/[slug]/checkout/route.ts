import { NextRequest, NextResponse } from 'next/server';

import { VodError, createCheckout, vodViewerCookieName } from '@/lib/vod';

export const dynamic = 'force-dynamic';
const COOKIE_MAX_AGE = 60 * 24 * 60 * 60; // 60 days (the grant's expiry is the real gate)

/**
 * POST — start a checkout. Body `{ kind: 'weekly' | 'title', titleId?, blockchain? }`.
 * Reuses the viewer's existing anonymous cookie so weekly + per-title purchases
 * accumulate under one identity; sets it if absent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: 'weekly' | 'title';
    titleId?: string;
    blockchain?: string;
  };
  if (body.kind !== 'weekly' && body.kind !== 'title') {
    return NextResponse.json({ error: 'kind must be "weekly" or "title"' }, { status: 400 });
  }

  const existingKey = request.cookies.get(vodViewerCookieName(slug))?.value;
  try {
    const result = await createCheckout(slug, {
      kind: body.kind,
      titleId: body.titleId,
      viewerKey: existingKey,
      blockchain: body.blockchain,
      origin: request.nextUrl.origin,
    });
    const response = NextResponse.json(
      { paymentUrl: result.paymentUrl, grantId: result.grantId },
      { status: 200 }
    );
    response.cookies.set(result.cookie.name, result.cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof VodError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
