/**
 * GET /api/youtube/auth/start
 *
 * Begins the Google OAuth flow for connecting a YouTube account.
 * Stores a random `state` in an httpOnly cookie for CSRF protection and
 * redirects the user to Google's consent screen.
 *
 * Requires an authenticated media-streamer user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { buildAuthUrl, generateState, getGoogleOAuthConfig, YOUTUBE_OAUTH_STATE_COOKIE } from '@/lib/youtube';

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (err) {
    console.error('[YouTube OAuth] Missing config:', err);
    return NextResponse.json(
      { error: 'YouTube integration is not configured on this server.' },
      { status: 500 }
    );
  }

  const state = generateState();
  const authUrl = buildAuthUrl(config, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  });
  return response;
}
