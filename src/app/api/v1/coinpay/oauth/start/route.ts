/**
 * GET /api/v1/coinpay/oauth/start
 *
 * Begins "Sign in with CoinPay" (signed out) or "Connect CoinPay" (signed in,
 * ?mode=link). The PKCE verifier, state and nonce ride an HMAC-signed httpOnly
 * cookie; the browser's JavaScript never sees them.
 *
 *   ?redirect=/somewhere   where to land afterwards (this site only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sameOriginPath } from '@/lib/safe-redirect';
import {
  COINPAY_PENDING_COOKIE,
  COINPAY_PENDING_MAX_AGE_SECONDS,
  getCoinpaySigninConfig,
  startCoinpaySignin,
} from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const config = getCoinpaySigninConfig(url.origin);
  if (!config) {
    return NextResponse.json({ error: 'Sign in with CoinPay is not configured on this server.' }, { status: 503 });
  }

  const link = url.searchParams.get('mode') === 'link';
  let userId: string | undefined;
  if (link) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL('/login?redirect=/settings%3Ftab%3Dconnections', config.redirectUri));
    userId = user.id;
  }
  const redirect = sameOriginPath(url.searchParams.get('redirect'), link ? '/settings?tab=connections' : '/');

  const { url: authUrl, cookie } = startCoinpaySignin(config, {
    mode: link ? 'link' : 'signin',
    ...(userId ? { userId } : {}),
    redirect,
  });
  const response = NextResponse.redirect(authUrl, 302);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set(COINPAY_PENDING_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/coinpay/oauth',
    maxAge: COINPAY_PENDING_MAX_AGE_SECONDS,
  });
  return response;
}
