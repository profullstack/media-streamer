/**
 * GET /api/v1/nixamp/oauth/callback
 *
 * Where nixamp sends the browser back. This is the exact path registered with
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
  discover,
  exchangeCodeForTokens,
  fetchUserInfo,
  getNixampOAuthConfig,
  NIXAMP_OAUTH_STATE_COOKIE,
  upsertNixampAccount,
} from '@/lib/nixamp';

const SETTINGS = '/settings?tab=connections';

function back(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL(SETTINGS, origin);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const res = NextResponse.redirect(url);
  res.cookies.delete(NIXAMP_OAUTH_STATE_COOKIE);
  return res;
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

  const user = await getCurrentUser();
  if (!user) return back(origin, { nixamp_error: 'not_authenticated' });

  const { searchParams } = new URL(request.url);
  const refused = searchParams.get('error');
  if (refused) return back(origin, { nixamp_error: refused });

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return back(origin, { nixamp_error: 'missing_code_or_state' });

  const cookie = request.cookies.get(NIXAMP_OAUTH_STATE_COOKIE)?.value;
  let kept: { state?: string; verifier?: string } = {};
  try {
    kept = cookie ? (JSON.parse(cookie) as typeof kept) : {};
  } catch {
    kept = {};
  }
  // Both halves, and the state compared rather than merely present: a
  // callback whose state we did not issue is somebody replaying a URL.
  if (!kept.state || !kept.verifier || kept.state !== state) {
    return back(origin, { nixamp_error: 'state_mismatch' });
  }

  try {
    const metadata = await discover(config);
    const tokens = await exchangeCodeForTokens(config, metadata, code, kept.verifier);
    const who = await fetchUserInfo(metadata, tokens.access_token);

    await upsertNixampAccount({
      userId: user.id,
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

    return back(origin, { nixamp: 'connected' });
  } catch (err) {
    console.error('[nixamp OAuth] callback failed:', err);
    return back(origin, { nixamp_error: 'exchange_failed' });
  }
}
