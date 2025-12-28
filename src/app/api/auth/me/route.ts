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
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  }

  const supabase = createServerClient();

  // Verify the session with Supabase
  // Use setSession to set the tokens, then getUser to validate
  const { error: sessionError } = await supabase.auth.setSession({
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
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
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

  // Get user from session
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { user: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  }

  // Get user subscription info
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('tier, status')
    .eq('user_id', user.id)
    .single();

  const responseUser = {
    id: user.id,
    email: user.email ?? '',
    subscription_tier: subscription?.tier ?? 'trial',
    subscription_status: subscription?.status ?? 'active',
    display_name: user.user_metadata?.display_name as string | undefined,
    avatar_url: user.user_metadata?.avatar_url as string | undefined,
  };

  return NextResponse.json(
    { user: responseUser },
    {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    }
  );
}
