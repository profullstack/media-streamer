/**
 * GET /api/v1/nixamp/oauth/callback
 *
 * Where nixamp sends the browser back, to connect an account or to sign in
 * as one ("Sign in with nixamp": no session here yet, the identity is the
 * one nixamp vouches for, and the account with that email is theirs).
 *
 * This is the exact path registered with
 * nixamp, which matches it byte for byte, so it is not something to rename
 * lightly: the OAuth 2.1 rule is exact matching, with only a loopback port
 * allowed to vary.
 *
 * The state and the PKCE verifier come out of the httpOnly cookie set on the
 * way out, and the cookie is cleared however this ends: a verifier is worth
 * exactly one exchange.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  discover,
  exchangeCodeForTokens,
  fetchUserInfo,
  getNixampOAuthConfig,
  NIXAMP_OAUTH_STATE_COOKIE,
  NixampSignInError,
  safeRedirect,
  sessionCookieValue,
  sessionForNixampIdentity,
  upsertNixampAccount,
} from '@/lib/nixamp';

const SETTINGS = '/settings?tab=connections';

function back(origin: string, params: Record<string, string>, to = SETTINGS): NextResponse {
  const url = new URL(to, origin);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const res = NextResponse.redirect(url);
  res.cookies.delete(NIXAMP_OAUTH_STATE_COOKIE);
  return res;
}

/** A refusal on the way in goes to the login page, which knows how to say it. */
function refuse(origin: string, reason: string, redirect: string): NextResponse {
  return back(origin, { nixamp_error: reason, redirect }, '/login');
}

export async function GET(request: NextRequest): Promise<Response> {
  // The public origin, from the configured redirect URI rather than
  // request.url, which behind a proxy can be the internal bind address.
  let origin: string;
  let config;
  try {
    config = getNixampOAuthConfig(new URL(request.url).origin);
    origin = new URL(config.redirectUri).origin;
  } catch {
    return back(new URL(request.url).origin, { nixamp_error: 'server_misconfigured' });
  }

  const cookie = request.cookies.get(NIXAMP_OAUTH_STATE_COOKIE)?.value;
  let kept: { state?: string; verifier?: string; redirect?: string; signin?: boolean } = {};
  try {
    kept = cookie ? (JSON.parse(cookie) as typeof kept) : {};
  } catch {
    kept = {};
  }
  const redirect = safeRedirect(kept.redirect);

  // Signed in: connecting nixamp to this account. Signed out: this IS the
  // sign-in, and the cookie set on the way out says so -- a callback that
  // arrives with no session and no such cookie is not a flow we started.
  const user = await getCurrentUser();
  const signin = !user && kept.signin === true;
  if (!user && !signin) return back(origin, { nixamp_error: 'not_authenticated' });
  const fail = (reason: string): NextResponse => (signin ? refuse(origin, reason, redirect) : back(origin, { nixamp_error: reason }));

  const { searchParams } = new URL(request.url);
  const refused = searchParams.get('error');
  if (refused) return fail(refused);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return fail('missing_code_or_state');

  // Both halves, and the state compared rather than merely present: a
  // callback whose state we did not issue is somebody replaying a URL.
  if (!kept.state || !kept.verifier || kept.state !== state) {
    return fail('state_mismatch');
  }

  try {
    const metadata = await discover(config);
    const tokens = await exchangeCodeForTokens(config, metadata, code, kept.verifier);
    const who = await fetchUserInfo(metadata, tokens.access_token);

    let userId = user?.id ?? '';
    let session: { accessToken: string; refreshToken: string } | null = null;
    if (signin) {
      const minted = await sessionForNixampIdentity({
        email: who.email ?? '',
        sub: who.sub,
        ...(who.handle ? { handle: who.handle } : {}),
      });
      userId = minted.userId;
      session = minted;
    }

    await upsertNixampAccount({
      userId,
      nixampSub: who.sub,
      nixampSite: config.site,
      // The handle, never the address: on nixamp the account email is the
      // linking key and is treated as a credential, and the handle is the
      // name that is safe to show a room full of strangers.
      ...(who.handle ? { handle: who.handle } : {}),
      ...(who.email ? { email: who.email } : {}),
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      expiresIn: tokens.expires_in,
      scopes: tokens.scope ? tokens.scope.split(' ').filter(Boolean) : [],
    });

    // Home is wherever they were going: the party they were sent to, or the
    // connections tab, which is what a plain Connect started from.
    const res = back(origin, signin ? {} : { nixamp: 'connected' }, redirect);
    if (session) {
      res.cookies.set(AUTH_COOKIE_NAME, sessionCookieValue(session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: AUTH_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (err) {
    console.error('[nixamp OAuth] callback failed:', err);
    if (err instanceof NixampSignInError) return fail(err.reason);
    return fail('exchange_failed');
  }
}
