/**
 * GET /api/live/oauth/callback
 *
 * c0mpute sends the member back here. The code is traded for a token, the token
 * makes the member's stream, and the token is dropped. They land on /live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  PENDING_TTL,
  finishConnect,
  liveDeps,
  livePageUrl,
  type Finished,
} from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deps = liveDeps();
  if (!deps) return NextResponse.json({ error: 'c0mpute Live is not configured' }, { status: 503 });
  const user = await getCurrentUser();
  // Absolute, from the canonical site URL: request.url is the address nginx proxies to.
  if (!user) return NextResponse.redirect(`${deps.cfg.siteUrl}/login?redirect=${encodeURIComponent('/live')}`, 302);

  const params = request.nextUrl.searchParams;
  let finished: Finished;
  try {
    finished = await finishConnect(deps, {
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      cookie: request.cookies.get(PENDING_COOKIE)?.value,
      sessionUserId: user.id,
    });
  } catch (err) {
    console.error('[c0mpute-live] connect failed:', err instanceof Error ? err.message : 'error');
    finished = { outcome: 'failed' };
  }

  if (finished.restart) {
    const res = NextResponse.redirect(finished.restart.url, 302);
    res.cookies.set(PENDING_COOKIE, finished.restart.cookie, {
      path: PENDING_COOKIE_PATH,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: PENDING_TTL,
    });
    res.headers.set('cache-control', 'no-store');
    return res;
  }

  if (finished.outcome !== 'connected' && finished.reason) {
    console.warn('[c0mpute-live] connect did not finish:', finished.reason);
  }
  const res = NextResponse.redirect(livePageUrl(deps.cfg, finished.outcome), 302);
  res.cookies.set(PENDING_COOKIE, '', { path: PENDING_COOKIE_PATH, maxAge: 0 });
  res.headers.set('cache-control', 'no-store');
  return res;
}
