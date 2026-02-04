/**
 * Next.js Middleware
 *
 * Handles auth token refresh for Supabase session management.
 * Runs before every matching route to ensure the auth cookie
 * has fresh tokens. Without this, expired access tokens cause
 * `getCurrentUser()` to fail because the refreshed tokens from
 * `setSession()` are never written back to the cookie.
 *
 * This is the standard approach for Supabase + Next.js App Router auth.
 */

import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'sb-auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/**
 * Decode a JWT payload without verifying signature.
 * Used only to check expiry — actual validation is done by Supabase.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload) as { exp?: number };
  } catch {
    return null;
  }
}

interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

interface SupabaseRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();

  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!authCookie?.value) {
    return response;
  }

  // Parse the stored session
  let session: SessionTokens;
  try {
    session = JSON.parse(decodeURIComponent(authCookie.value)) as SessionTokens;
  } catch {
    return response;
  }

  if (!session.access_token || !session.refresh_token) {
    return response;
  }

  // Check if the access token is expired or about to expire (within 60s)
  const payload = decodeJwtPayload(session.access_token);
  if (!payload?.exp) {
    return response;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;

  // Token still fresh (more than 60 seconds until expiry) — no refresh needed
  if (timeUntilExpiry > 60) {
    return response;
  }

  // Token expired or about to expire — refresh it
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Missing SUPABASE_URL or SUPABASE_ANON_KEY for token refresh');
    return response;
  }

  try {
    const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!refreshResponse.ok) {
      console.error('[Middleware] Token refresh failed:', refreshResponse.status);
      // Clear the stale cookie so user gets redirected to login cleanly
      response.cookies.set(AUTH_COOKIE_NAME, '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
      });
      return response;
    }

    const data = await refreshResponse.json() as SupabaseRefreshResponse;

    if (!data.access_token || !data.refresh_token) {
      console.error('[Middleware] Token refresh returned incomplete data');
      return response;
    }

    // Write the refreshed tokens back to the cookie
    const newCookieValue = encodeURIComponent(
      JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
    );

    response.cookies.set(AUTH_COOKIE_NAME, newCookieValue, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
    });
  } catch (error) {
    console.error('[Middleware] Token refresh error:', error);
    // Don't break the request — let getCurrentUser() handle the stale token
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, logo.svg, etc.
     * - Public assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|css|js|map)$).*)',
  ],
};
