/**
 * Crawl gateway: sells a day of crawl access to AI training crawlers over x402.
 *
 * Training crawlers (GPTBot, ClaudeBot, CCBot, meta-externalagent, Bytespider,
 * Applebot-Extended, ...) get `402 Payment Required` with an x402 offer, or the
 * HTML sales page at /crawl. A paid pass in the `x-crawl-pass` header lets them
 * through. People, Googlebot and retrieval crawlers are untouched.
 *
 * Two edge controls catch crawlers that do not say who they are:
 * - `denyCidrs`: hosting ranges that serve no readers get a tiny 403 first.
 * - `chargeSpoofedBrowsers`: a "Chrome/..." user agent with no Sec-Fetch-Mode
 *   header is an HTTP client wearing a copied string (every Chromium since 76
 *   sends it and nothing can strip it), so it is charged like GPTBot. Anything
 *   that declares itself (Googlebot's evergreen string, Bingbot, any "bot")
 *   is judged by the lists instead, and Firefox/Safari are never judged.
 *
 * This site is mostly real people, so `exempt` matters most: a request that
 * carries a valid-looking Supabase session or a valid-looking `btr_` API
 * bearer token is never charged, whatever else it looks like.
 *
 * Used by src/proxy.ts (the gate) and src/app/robots.txt/route.ts (the lists),
 * so robots.txt and the gate never disagree about who is who.
 *
 * Imports nothing Node-only: the proxy may run at the edge.
 */

import { createGateway } from '@profullstack/x402-gateway';

/**
 * OVH VPS fleet ranges, measured 2026-08-28 on rssamplifier: vps-*.vps.ovh.net
 * hosts spoofing "Chrome/148" across these /16s. Hosting ranges serve no
 * readers, so they are refused outright rather than offered a pass.
 */
const OVH_VPS_FLEET_CIDRS = [
  '51.38.0.0/16',
  '54.38.0.0/16',
  '141.94.0.0/16',
  '145.239.0.0/16',
  '149.202.0.0/16',
  '151.80.0.0/16',
  '57.129.0.0/16',
  '213.32.0.0/16',
];

/** The Supabase session cookie src/proxy.ts refreshes and src/lib/auth reads. */
const SESSION_COOKIE_NAME = 'sb-auth-token';

/** A v1 API token from src/lib/api-tokens: `btr_` + 32 random bytes as hex. */
const API_BEARER_RE = /^Bearer\s+btr_[0-9a-f]{64}$/i;

/** Three base64url segments: the shape of the Supabase access token. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Whether the request carries a valid-looking Supabase session: the cookie
 * src/proxy.ts refreshes, holding JSON with a JWT-shaped access_token and a
 * refresh_token. Shape only, no verification -- the gate runs before anything
 * that could ask Supabase, and the point is that a junk cookie named
 * sb-auth-token does not buy a spoofing fleet a way past the toll.
 */
export function hasSessionCookie(request: Request): boolean {
  const raw = cookieValue(request, SESSION_COOKIE_NAME);
  if (!raw) return false;
  try {
    const session = JSON.parse(decodeURIComponent(raw)) as { access_token?: unknown; refresh_token?: unknown };
    return (
      typeof session.access_token === 'string' &&
      JWT_RE.test(session.access_token) &&
      typeof session.refresh_token === 'string' &&
      session.refresh_token.length > 0
    );
  } catch {
    return false;
  }
}

/** Whether the request carries a valid-looking v1 API bearer token. */
export function hasApiBearer(request: Request): boolean {
  return API_BEARER_RE.test(request.headers.get('authorization') ?? '');
}

export const gateway = createGateway({
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://bittorrented.com',
  siteName: 'bittorrented',
  coinpay: { apiKey: process.env.COINPAY_X402_KEY },
  payTo: process.env.CRAWL_PAY_TO,
  denyCidrs: OVH_VPS_FLEET_CIDRS,
  chargeSpoofedBrowsers: true,
  exempt: (request) => hasSessionCookie(request) || hasApiBearer(request),
});
