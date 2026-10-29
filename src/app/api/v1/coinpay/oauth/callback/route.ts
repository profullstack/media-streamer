/**
 * GET /api/v1/coinpay/oauth/callback
 *
 * Where CoinPay sends the browser back. The exact path registered with
 * CoinPay (exact redirect matching), so not something to rename lightly.
 *
 * Signs in the account bound to the CoinPay `sub`, or (mode "link") binds the
 * sub to the signed-in account that started the request. Never by email.
 * The pending cookie is cleared however this ends: a verifier is worth one
 * exchange.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME, sessionCookieValue } from '@/lib/nixamp';
import {
  COINPAY_PENDING_COOKIE,
  CoinpaySigninError,
  finishCoinpaySignin,
  getCoinpaySigninConfig,
  openPending,
} from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

const SETTINGS = '/settings?tab=connections';

export async function GET(request: NextRequest): Promise<Response> {
  const config = getCoinpaySigninConfig(new URL(request.url).origin);
  // The public origin, from the registered redirect URI rather than
  // request.url, which behind the proxy can be the internal bind address.
  const origin = config ? new URL(config.redirectUri).origin : new URL(request.url).origin;
  const cookie = request.cookies.get(COINPAY_PENDING_COOKIE)?.value;
  const pending = config ? openPending(cookie, config.clientSecret) : null;
  const linking = pending?.mode === 'link';

  const go = (to: string, params: Record<string, string> = {}): NextResponse => {
    const url = new URL(to, origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url, 302);
    res.headers.set('cache-control', 'no-store');
    res.cookies.set(COINPAY_PENDING_COOKIE, '', { path: '/api/v1/coinpay/oauth', maxAge: 0 });
    return res;
  };
  const fail = (reason: string): NextResponse =>
    linking ? go(SETTINGS, { coinpay_error: reason }) : go('/login', { coinpay_error: reason });

  if (!config) return fail('server_misconfigured');
  const params = new URL(request.url).searchParams;
  const refused = params.get('error');
  if (refused) return fail(refused === 'access_denied' ? 'access_denied' : 'exchange_failed');

  const user = await getCurrentUser();
  try {
    const out = await finishCoinpaySignin({
      config,
      cookie,
      state: params.get('state'),
      code: params.get('code'),
      sessionUserId: user?.id ?? null,
    });
    if (out.mode === 'link') return go(out.redirect, { coinpay: 'connected' });
    const res = go(out.redirect);
    if (out.session) {
      res.cookies.set(AUTH_COOKIE_NAME, sessionCookieValue(out.session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: AUTH_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (err) {
    const reason = err instanceof CoinpaySigninError ? err.reason : 'exchange_failed';
    console.error('[CoinPay sign-in] refused:', reason, (err as Error)?.message);
    return fail(reason);
  }
}
