/**
 * Next.js Proxy (middleware)
 *
 * The one live proxy file. In order:
 * - Charges AI training crawlers for access (402 + x402 offer) via the crawl gateway
 * - Refreshes the Supabase session cookie when the access token is about to expire
 * - Rate limits expensive API routes (sliding window, per-IP)
 * - Blocks known bots/crawlers from hitting API routes (with exceptions for good bots)
 * - Enforces profile selection for authenticated users
 * - Stores a valid ?ref= referral code in a cookie
 *
 * The session refresh and referral cookie used to live in a root middleware.ts
 * that Next never loaded (with the app under src/, only src/proxy.ts is
 * scanned), so they are folded in here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trackReferralCode } from '@profullstack/stack/referrals';
import { gateway } from '@/lib/crawl-gateway';

// =============================================================================
// Rate Limiting (in-memory sliding window)
// =============================================================================

interface RateLimitEntry {
  timestamps: number[];
}

/** IP -> rate limit tracking */
const rateLimitStore = new Map<string, RateLimitEntry>();

/** Last cleanup timestamp */
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000; // 60s
const WINDOW_MS = 60_000; // 1 minute sliding window

/** Rate limit tiers (requests per minute) */
const RATE_LIMITS = {
  api: 30,        // /api/search/*, /api/dht/*, /api/torrent-search
  page: 60,       // /search, /dht page routes
  goodBot: 10,    // Googlebot, Bingbot, Applebot
  badBot: 5,      // All other bots
} as const;

/**
 * Clean up expired entries to prevent memory leaks.
 * Runs at most once per CLEANUP_INTERVAL_MS.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - WINDOW_MS;
  for (const [key, entry] of rateLimitStore) {
    // Remove timestamps older than the window
    entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);
    // Remove the entry entirely if no timestamps remain
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a given key.
 * Returns { allowed: true } or { allowed: false, retryAfterSec }.
 */
function checkRateLimit(key: string, maxRequests: number): { allowed: boolean; retryAfterSec?: number } {
  cleanupExpiredEntries();

  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let entry = rateLimitStore.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    // Calculate when the oldest request in the window expires
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Extract client IP from request headers (handles proxies).
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// =============================================================================
// Bot Detection
// =============================================================================

/**
 * Known good bots that should be rate-limited but NOT blocked
 */
const GOOD_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
];

/**
 * All bot user-agent patterns (case-insensitive match)
 */
const BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,          // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /sogou/i,
  /exabot/i,
  /facebot/i,
  /facebookexternalhit/i,
  /ia_archiver/i,    // Alexa
  /mj12bot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /dotbot/i,
  /rogerbot/i,
  /seznambot/i,
  /petalbot/i,
  /applebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /slack/i,
  /crawler/i,
  /spider/i,
  /bot\b/i,          // Generic "bot" word boundary
  /crawl/i,
  /archive\.org_bot/i,
  /ccbot/i,
  /gptbot/i,
  /chatgpt/i,
  /anthropic/i,
  /claude/i,
  /bytespider/i,
  /amazonbot/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function isGoodBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return GOOD_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

// =============================================================================
// Rate-limited path matching
// =============================================================================

/** API paths that are expensive and need strict rate limiting */
const EXPENSIVE_API_PATHS = [
  '/api/search/',
  '/api/dht/',
  '/api/torrent-search',
];

/** Page paths that should be rate limited (more generous) */
const RATE_LIMITED_PAGE_PATHS = [
  '/search',
  '/dht',
];

function isExpensiveApiRoute(pathname: string): boolean {
  return EXPENSIVE_API_PATHS.some(p => pathname.startsWith(p));
}

function isRateLimitedPageRoute(pathname: string): boolean {
  return RATE_LIMITED_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// =============================================================================
// Supabase session refresh
// =============================================================================

/**
 * Handles auth token refresh for Supabase session management. Without this,
 * expired access tokens cause `getCurrentUser()` to fail because the refreshed
 * tokens from `setSession()` are never written back to the cookie.
 *
 * CIRCUIT BREAKER: under memory pressure or repeated failures, token refresh
 * is skipped to prevent cascading failures. The stale token is handled
 * gracefully by getCurrentUser().
 */

const AUTH_COOKIE_NAME = 'sb-auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// Token refresh timeout - short to prevent blocking requests
const REFRESH_TIMEOUT_MS = 3000; // 3 seconds

let consecutiveFailures = 0;
let lastFailureTime = 0;
const MAX_CONSECUTIVE_FAILURES = 10;
const CIRCUIT_RESET_MS = 15000; // 15 seconds

/** Check if circuit breaker is open (should skip refresh) */
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

function recordFailure(): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

/**
 * Decode a JWT payload without verifying signature.
 * Used only to check expiry — actual validation is done by Supabase.
 * Web APIs only (no Buffer), so this also runs at the edge.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as { exp?: number };
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

/** What the session refresh wants written to the auth cookie, if anything. */
interface SessionCookieUpdate {
  value: string;
  maxAge: number;
}

/**
 * Refresh the Supabase session if its access token expires within 60s.
 * Resolves to the cookie update to apply to the outgoing response, or null
 * when nothing needs to change. Never throws and never blocks longer than
 * REFRESH_TIMEOUT_MS.
 */
async function refreshSession(request: NextRequest): Promise<SessionCookieUpdate | null> {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!authCookie?.value) return null;

  // Parse the stored session
  let session: SessionTokens;
  try {
    session = JSON.parse(decodeURIComponent(authCookie.value)) as SessionTokens;
  } catch {
    return null;
  }
  if (!session.access_token || !session.refresh_token) return null;

  // Check if the access token is expired or about to expire (within 60s)
  const payload = decodeJwtPayload(session.access_token);
  if (!payload?.exp) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp - now > 60) return null; // still fresh

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Only log once per circuit reset to avoid spam
    if (consecutiveFailures === 0) {
      console.error('[Proxy] Missing SUPABASE_URL or SUPABASE_ANON_KEY for token refresh');
    }
    return null;
  }

  // Circuit breaker: skip refresh if we've had too many recent failures
  if (isCircuitOpen()) return null;

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
      if (consecutiveFailures === 1) {
        console.error('[Proxy] Token refresh failed:', refreshResponse.status);
      }
      // DON'T clear the cookie on a transient failure — the stale token may
      // still work for API routes that do their own refresh via setSession().
      // Only clear on 401 (token truly revoked).
      return refreshResponse.status === 401 ? { value: '', maxAge: 0 } : null;
    }

    const data = (await refreshResponse.json()) as SupabaseRefreshResponse;
    if (!data.access_token || !data.refresh_token) {
      recordFailure();
      if (consecutiveFailures === 1) {
        console.error('[Proxy] Token refresh returned incomplete data');
      }
      return null;
    }

    recordSuccess();
    return {
      value: encodeURIComponent(
        JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token })
      ),
      maxAge: COOKIE_MAX_AGE,
    };
  } catch (error) {
    recordFailure();
    if (consecutiveFailures === 1) {
      console.error('[Proxy] Token refresh error:', error);
    }
    // Don't break the request — let getCurrentUser() handle the stale token
    return null;
  }
}

/**
 * Write the refreshed session onto whatever response goes out — a pass-
 * through, a redirect or a 429 alike. Supabase rotates refresh tokens, so a
 * refresh whose result is dropped would sign the user out on the next request.
 */
function withSession<T extends NextResponse>(response: T, update: SessionCookieUpdate | null): T {
  if (update) {
    response.cookies.set(AUTH_COOKIE_NAME, update.value, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: update.maxAge,
    });
  }
  return response;
}

// =============================================================================
// Profile enforcement
// =============================================================================

/**
 * Pages that don't require profile selection
 */
const PROFILE_EXEMPT_PATHS = [
  '/select-profile',
  '/login',
  '/signup',
  '/auth',
  '/pricing',
  '/api/auth',
  '/api/profiles',
  '/_next',
  '/favicon',
  '/manifest',
  '/robots.txt',
  '/sitemap',
];

function isProfileExempt(pathname: string): boolean {
  return PROFILE_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
}

// =============================================================================
// Middleware
// =============================================================================

function make429Response(retryAfterSec: number, isJson: boolean): NextResponse {
  if (isJson) {
    return new NextResponse(
      JSON.stringify({ error: 'Too Many Requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
        },
      }
    );
  }
  return new NextResponse('Too Many Requests', {
    status: 429,
    headers: {
      'Content-Type': 'text/plain',
      'Retry-After': String(retryAfterSec),
    },
  });
}

export async function proxy(request: NextRequest): Promise<Response> {
  // --- 1. Crawl gateway: training crawlers pay, everyone else carries on ---
  // Answers 402 (with an x402 offer) for GPTBot, ClaudeBot, CCBot,
  // meta-externalagent and friends, the sales page at /crawl for anyone, and
  // null for people, search engines and retrieval crawlers -- who fall
  // through to the behaviour below. A refused crawler never reaches Supabase.
  const answer = await gateway.handle(request);
  if (answer) return answer;

  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent');
  const clientIp = getClientIp(request);
  const isBotRequest = isBot(userAgent);
  const isGoodBotRequest = isGoodBot(userAgent);
  const isApiRoute = pathname.startsWith('/api/');

  // Log real client IP for API requests
  if (isApiRoute) {
    console.log(`[${request.method}] ${pathname} — ${clientIp}`);
  }

  // --- 2. Supabase session refresh ---
  // Resolved up front so every response below, early or not, carries the
  // refreshed cookie.
  const session = await refreshSession(request);

  // --- Bot handling for API routes ---
  if (isApiRoute && isBotRequest) {
    if (isGoodBotRequest) {
      // Good bots get a generous rate limit instead of a hard block
      const result = checkRateLimit(`bot:${clientIp}`, RATE_LIMITS.goodBot);
      if (!result.allowed) {
        console.log(`[rate-limit] Good bot rate limited: IP=${clientIp} UA=${userAgent?.slice(0, 80)} path=${pathname}`);
        return withSession(make429Response(result.retryAfterSec ?? 60, true), session);
      }
      // Allow through (don't block good bots)
    } else {
      // Bad bots: aggressive rate limit
      const result = checkRateLimit(`badbot:${clientIp}`, RATE_LIMITS.badBot);
      if (!result.allowed) {
        console.log(`[rate-limit] Bad bot rate limited: IP=${clientIp} UA=${userAgent?.slice(0, 80)} path=${pathname}`);
        return withSession(make429Response(result.retryAfterSec ?? 60, true), session);
      }
      // Block bad bots from expensive API routes entirely
      if (isExpensiveApiRoute(pathname)) {
        return withSession(
          new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
          session
        );
      }
    }
  }

  // --- Rate limiting for expensive API routes (non-bot requests) ---
  if (!isBotRequest && isExpensiveApiRoute(pathname)) {
    const result = checkRateLimit(`api:${clientIp}`, RATE_LIMITS.api);
    if (!result.allowed) {
      console.log(`[rate-limit] API rate limited: IP=${clientIp} path=${pathname}`);
      return withSession(make429Response(result.retryAfterSec ?? 60, true), session);
    }
  }

  // --- Rate limiting for page routes ---
  if (!isBotRequest && !isApiRoute && isRateLimitedPageRoute(pathname)) {
    const result = checkRateLimit(`page:${clientIp}`, RATE_LIMITS.page);
    if (!result.allowed) {
      console.log(`[rate-limit] Page rate limited: IP=${clientIp} path=${pathname}`);
      return withSession(make429Response(result.retryAfterSec ?? 60, false), session);
    }
  }

  // --- Profile enforcement: authenticated users must select a profile ---
  const hasAuth = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasProfile = request.cookies.get('x-profile-id')?.value;

  if (hasAuth && !hasProfile && !isProfileExempt(pathname)) {
    // For page requests, redirect to profile selector
    if (!isApiRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/select-profile';
      url.searchParams.set('redirect', pathname);
      return withSession(NextResponse.redirect(url), session);
    }
  }

  const response = NextResponse.next();

  // --- Referral cookie ---
  // Validate ref before storing: alphanumeric + hyphens/underscores, max 64
  // chars. Without validation, an attacker can inject arbitrary values via a
  // crafted URL, enabling referral fraud and overflowing the cookie header.
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && /^[a-zA-Z0-9_-]{1,64}$/.test(ref)) {
    trackReferralCode(request, response);
  }

  return withSession(response, session);
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, logo.svg, etc.
     * - Public assets (images, fonts, css, js, source maps)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|css|js|map)$).*)',
  ],
};
