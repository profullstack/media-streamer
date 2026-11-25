/**
 * GET /api/live/oauth/start?visibility=public|unlisted
 *
 * Sends the member to c0mpute to approve the `live:publish` scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  PENDING_TTL,
  liveDeps,
  livePageUrl,
  startConnect,
  visibilityOf,
} from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const deps = liveDeps();
  if (!deps) return NextResponse.json({ error: 'c0mpute Live is not configured' }, { status: 503 });

  try {
    const started = await startConnect(deps, {
      userId: user.id,
      visibility: visibilityOf(request.nextUrl.searchParams.get('visibility')),
    });
    const res = NextResponse.redirect(started.url, 302);
    res.cookies.set(PENDING_COOKIE, started.cookie, {
      path: PENDING_COOKIE_PATH,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: PENDING_TTL,
    });
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch (err) {
    console.error('[c0mpute-live] connect start failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.redirect(livePageUrl(deps.cfg, 'failed'), 302);
  }
}
