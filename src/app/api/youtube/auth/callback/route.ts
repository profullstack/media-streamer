/**
 * GET /api/youtube/auth/callback
 *
 * Google OAuth redirect target. Verifies the CSRF state, exchanges the code
 * for tokens, fetches the Google profile, and upserts a bt_youtube_accounts row.
 * On success the user is redirected to /youtube/accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  computeExpiresAt,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  getGoogleOAuthConfig,
  upsertAccount,
} from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';
import { YOUTUBE_OAUTH_STATE_COOKIE } from '../start/route';

function redirectWithError(origin: string, message: string): NextResponse {
  const url = new URL('/youtube/accounts', origin);
  url.searchParams.set('error', message);
  const res = NextResponse.redirect(url);
  res.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest): Promise<Response> {
  // Derive the public origin from the configured redirect URI rather than
  // `request.url`, which may reflect the internal bind address (e.g.
  // https://0.0.0.0:3000) when running behind a proxy or bound to all
  // interfaces. Fall back to the request origin if the env var is missing.
  let origin: string;
  try {
    origin = new URL(getGoogleOAuthConfig().redirectUri).origin;
  } catch {
    origin = new URL(request.url).origin;
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return redirectWithError(origin, 'not_authenticated');
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return redirectWithError(origin, oauthError);
  }
  if (!code || !state) {
    return redirectWithError(origin, 'missing_code_or_state');
  }

  const cookieState = request.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== state) {
    return redirectWithError(origin, 'state_mismatch');
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (err) {
    console.error('[YouTube OAuth] Missing config:', err);
    return redirectWithError(origin, 'server_misconfigured');
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code);

    if (!tokens.refresh_token) {
      // Without a refresh token we can't keep the connection alive.
      // access_type=offline + prompt=consent in the start route should
      // guarantee one, so treat this as an error.
      return redirectWithError(origin, 'no_refresh_token');
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    await upsertAccount({
      userId,
      googleSub: userInfo.sub,
      email: userInfo.email ?? null,
      displayName: userInfo.name ?? null,
      avatarUrl: userInfo.picture ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: computeExpiresAt(tokens.expires_in),
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
    });

    const successUrl = new URL('/youtube/accounts', origin);
    successUrl.searchParams.set('connected', '1');
    const response = NextResponse.redirect(successUrl);
    response.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('[YouTube OAuth] Callback failed:', err);
    return redirectWithError(origin, 'oauth_failed');
  }
}
