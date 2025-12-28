/**
 * Logout API Route
 *
 * POST /api/auth/logout
 *
 * Logs out the current user by clearing the auth cookie.
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie name for auth token
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

/**
 * POST /api/auth/logout
 *
 * Log out the current user.
 *
 * Returns:
 * - 200: Logout successful
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json(
    { message: 'Logged out successfully' },
    { status: 200 }
  );

  // Clear the auth cookie by setting it to expire immediately
  response.headers.set(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );

  return response;
}
