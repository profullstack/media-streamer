/**
 * Next.js Middleware
 *
 * - Rate limits expensive API routes (sliding window, per-IP)
 * - Blocks known bots/crawlers from hitting API routes (with exceptions for good bots)
 * - Enforces profile selection for authenticated users
 */

import { NextRequest, NextResponse } from 'next/server';

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

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent');
  const clientIp = getClientIp(request);
  const isBotRequest = isBot(userAgent);
  const isGoodBotRequest = isGoodBot(userAgent);
  const isApiRoute = pathname.startsWith('/api/');

  // --- Bot handling for API routes ---
  if (isApiRoute && isBotRequest) {
    if (isGoodBotRequest) {
      // Good bots get a generous rate limit instead of a hard block
      const result = checkRateLimit(`bot:${clientIp}`, RATE_LIMITS.goodBot);
      if (!result.allowed) {
        console.log(`[rate-limit] Good bot rate limited: IP=${clientIp} UA=${userAgent?.slice(0, 80)} path=${pathname}`);
        return make429Response(result.retryAfterSec ?? 60, true);
      }
      // Allow through (don't block good bots)
    } else {
      // Bad bots: aggressive rate limit
      const result = checkRateLimit(`badbot:${clientIp}`, RATE_LIMITS.badBot);
      if (!result.allowed) {
        console.log(`[rate-limit] Bad bot rate limited: IP=${clientIp} UA=${userAgent?.slice(0, 80)} path=${pathname}`);
        return make429Response(result.retryAfterSec ?? 60, true);
      }
      // Block bad bots from expensive API routes entirely
      if (isExpensiveApiRoute(pathname)) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  // --- Rate limiting for expensive API routes (non-bot requests) ---
  if (!isBotRequest && isExpensiveApiRoute(pathname)) {
    const result = checkRateLimit(`api:${clientIp}`, RATE_LIMITS.api);
    if (!result.allowed) {
      console.log(`[rate-limit] API rate limited: IP=${clientIp} path=${pathname}`);
      return make429Response(result.retryAfterSec ?? 60, true);
    }
  }

  // --- Rate limiting for page routes ---
  if (!isBotRequest && !isApiRoute && isRateLimitedPageRoute(pathname)) {
    const result = checkRateLimit(`page:${clientIp}`, RATE_LIMITS.page);
    if (!result.allowed) {
      console.log(`[rate-limit] Page rate limited: IP=${clientIp} path=${pathname}`);
      return make429Response(result.retryAfterSec ?? 60, false);
    }
  }

  // --- Profile enforcement: authenticated users must select a profile ---
  const hasAuth = request.cookies.get('sb-auth-token')?.value;
  const hasProfile = request.cookies.get('x-profile-id')?.value;

  if (hasAuth && !hasProfile && !isProfileExempt(pathname)) {
    // For page requests, redirect to profile selector
    if (!isApiRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/select-profile';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return undefined;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
