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
 * 
 * CIRCUIT BREAKER: Under memory pressure or repeated failures,
 * token refresh is skipped to prevent cascading failures.
 * The stale token will be handled gracefully by getCurrentUser().
 */

import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'sb-auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Token refresh timeout - short to prevent blocking requests
const REFRESH_TIMEOUT_MS = 3000; // 3 seconds

/**
 * Circuit breaker state for token refresh
 * Prevents cascading failures when the system is under pressure
 */
let consecutiveFailures = 0;
let lastFailureTime = 0;
const MAX_CONSECUTIVE_FAILURES = 10;
const CIRCUIT_RESET_MS = 15000; // 15 seconds

/**
 * Check if circuit breaker is open (should skip refresh)
 */
function isCircuitOpen(): boolean {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    // Check if enough time has passed to reset
    if (Date.now() - lastFailureTime > CIRCUIT_RESET_MS) {
      consecutiveFailures = 0;
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Record a failure for circuit breaker
 */
function recordFailure(): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();
}

/**
 * Record a success - reset circuit breaker
 */
function recordSuccess(): void {
  consecutiveFailures = 0;
}

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

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Log real client IP for API requests
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    console.log(`[${request.method}] ${path} — ${getClientIp(request)}`);
  }

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
    // Only log once per circuit reset to avoid spam
    if (consecutiveFailures === 0) {
      console.error('[Middleware] Missing SUPABASE_URL or SUPABASE_ANON_KEY for token refresh');
    }
    return response;
  }

  // Circuit breaker: skip refresh if we've had too many recent failures
  if (isCircuitOpen()) {
    // Silently skip - don't spam logs when circuit is open
    return response;
  }

  try {
    // Use AbortController for timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

    const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!refreshResponse.ok) {
      recordFailure();
      // Only log if this is the first failure in a series
      if (consecutiveFailures === 1) {
        console.error('[Middleware] Token refresh failed:', refreshResponse.status);
      }
      // DON'T clear the cookie on refresh failure — the stale token
      // may still work for API routes that do their own refresh via setSession().
      // Only clear on 401 (token truly revoked), not on transient errors.
      if (refreshResponse.status === 401) {
        response.cookies.set(AUTH_COOKIE_NAME, '', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 0,
        });
      }
      return response;
    }

    const data = await refreshResponse.json() as SupabaseRefreshResponse;

    if (!data.access_token || !data.refresh_token) {
      recordFailure();
      if (consecutiveFailures === 1) {
        console.error('[Middleware] Token refresh returned incomplete data');
      }
      return response;
    }

    // Success! Reset circuit breaker
    recordSuccess();

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
    recordFailure();
    // Only log first failure to avoid spam during outages
    if (consecutiveFailures === 1) {
      console.error('[Middleware] Token refresh error:', error);
    }
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
