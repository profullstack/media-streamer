/**
 * Logout API Route
 *
 * POST /api/auth/logout
 *
 * Revokes the Supabase session and clears auth cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const AUTH_COOKIE_NAME = 'sb-auth-token';

interface SessionToken {
  access_token: string;
  refresh_token: string;
}

function parseSessionCookie(value: string | undefined): SessionToken | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'access_token' in parsed &&
      'refresh_token' in parsed
    ) {
      return parsed as SessionToken;
    }
  } catch { /* ignore */ }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  // Revoke the Supabase session server-side so the refresh token is invalidated
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = parseSessionCookie(cookieValue);
  if (session) {
    try {
      const supabase = createServerClient();
      await supabase.auth.setSession(session);
      await supabase.auth.signOut();
    } catch { /* best-effort — still clear cookies */ }
  }

  const response = NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });

  // Clear auth cookie
  response.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
  // Clear profile cookie
  response.headers.append(
    'Set-Cookie',
    `x-profile-id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );

  return response;
}
