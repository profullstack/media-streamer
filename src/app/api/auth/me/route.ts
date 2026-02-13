/**
 * Auth Me API Route
 *
 * GET /api/auth/me
 *
 * Returns current user's authentication state.
 * Reads session from HTTP-only cookie.
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Cookie name for auth token
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

/**
 * Session token structure stored in cookie
 */
interface SessionToken {
  access_token: string;
  refresh_token: string;
}

/**
 * Parse session token from cookie
 */
function parseSessionCookie(cookieValue: string | undefined): SessionToken | null {
  if (!cookieValue) return null;

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as unknown;
    
    // Validate structure
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'access_token' in parsed &&
      'refresh_token' in parsed &&
      typeof (parsed as SessionToken).access_token === 'string' &&
      typeof (parsed as SessionToken).refresh_token === 'string'
    ) {
      return parsed as SessionToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/me
 *
 * Get current user's authentication state.
 *
 * Returns:
 * - 200: User info if authenticated, { user: null } if not
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Get auth cookie
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionToken = parseSessionCookie(cookieValue);

  // No session cookie - user is not logged in
  if (!sessionToken) {
    return NextResponse.json(
      { user: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
        },
      }
    );
  }

  const supabase = createServerClient();

  // Verify the session with Supabase
  // Use setSession to set the tokens, then getUser to validate
  // setSession will refresh expired tokens using the refresh_token
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: sessionToken.access_token,
    refresh_token: sessionToken.refresh_token,
  });

  if (sessionError) {
    // Invalid session - clear cookie and return null user
    const response = NextResponse.json(
      { user: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
        },
      }
    );
    // Clear invalid cookie
    response.headers.set(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );
    return response;
  }

  // Always write back tokens from setSession() — even if the access_token
  // looks the same, the refresh_token may have rotated. This prevents
  // stale refresh tokens from causing auth loops.
  const tokensRefreshed = sessionData?.session?.access_token &&
    (sessionData.session.access_token !== sessionToken.access_token ||
     sessionData.session.refresh_token !== sessionToken.refresh_token);

  // Get user from session
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { user: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
        },
      }
    );
  }

  // Get user subscription info
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('tier, status, trial_expires_at, subscription_expires_at')
    .eq('user_id', user.id)
    .single();

  // Check if subscription is expired
  const now = new Date();
  const tier = subscription?.tier ?? 'trial';
  let subscription_expired = false;
  let trial_expired = false;

  if (tier === 'trial' && subscription?.trial_expires_at) {
    trial_expired = new Date(subscription.trial_expires_at) < now;
    subscription_expired = trial_expired;
  } else if ((tier === 'premium' || tier === 'family') && subscription?.subscription_expires_at) {
    subscription_expired = new Date(subscription.subscription_expires_at) < now;
  }

  const responseUser = {
    id: user.id,
    email: user.email ?? '',
    subscription_tier: subscription?.tier ?? 'trial',
    subscription_status: subscription?.status ?? 'active',
    subscription_expired,
    trial_expired,
    trial_expires_at: subscription?.trial_expires_at ?? null,
    subscription_expires_at: subscription?.subscription_expires_at ?? null,
    display_name: user.user_metadata?.display_name as string | undefined,
    avatar_url: user.user_metadata?.avatar_url as string | undefined,
  };

  const response = NextResponse.json(
    { user: responseUser },
    {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    }
  );

  // If tokens were refreshed, update the cookie with new tokens
  // This ensures the next request uses the fresh tokens
  if (tokensRefreshed && sessionData.session) {
    const newCookieValue = JSON.stringify({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    });
    response.headers.set(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=${encodeURIComponent(newCookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    );
  }

  return response;
}
