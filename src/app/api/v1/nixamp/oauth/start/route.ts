/**
 * GET /api/v1/nixamp/oauth/start
 *
 * Begins the OAuth 2.1 flow that connects a nixamp account to this one, or,
 * for somebody signed out, signs them in here as their nixamp self.
 * nixamp is the authorization server; we are the client.
 *
 *   ?redirect=/watch-party?code=ABC123   where to land afterwards (this site only)
 *
 * Two secrets go out in one httpOnly cookie and neither ever reaches the
 * browser's JavaScript: the CSRF state, which proves the callback belongs to
 * a flow we started, and the PKCE verifier, which proves the code exchange is
 * being done by whoever started it. OAuth 2.1 requires the second of every
 * client, and it is what makes a client secret unnecessary here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  buildAuthUrl,
  codeChallenge,
  discover,
  generateCodeVerifier,
  generateState,
  getNixampOAuthConfig,
  NIXAMP_OAUTH_STATE_COOKIE,
  NIXAMP_OAUTH_STATE_MAX_AGE_SECONDS,
  safeRedirect,
} from '@/lib/nixamp';

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirect = safeRedirect(url.searchParams.get('redirect'));
  const user = await getCurrentUser();
  // Signed out, this is "Sign in with nixamp": the same round trip, and the
  // callback makes the account here from the identity there. Signed in, it
  // connects nixamp to the account that is already here.
  const signin = !user;

  let config;
  try {
    config = getNixampOAuthConfig(origin);
  } catch (err) {
    console.error('[nixamp OAuth] Missing config:', err);
    return NextResponse.json({ error: 'The nixamp connection is not configured on this server.' }, { status: 500 });
  }

  const state = generateState();
  const verifier = generateCodeVerifier();
  const metadata = await discover(config);
  const authUrl = buildAuthUrl(config, metadata, state, await codeChallenge(verifier));

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(NIXAMP_OAUTH_STATE_COOKIE, JSON.stringify({ state, verifier, redirect, signin }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: NIXAMP_OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
