/**
 * Middleware Tests — Rate limiting and bot handling on API routes
 *
 * Behavior:
 * - Training crawlers (GPTBot, meta-externalagent, ...): 402 Payment Required
 *   with an x402 offer on every route (the crawl gateway runs first)
 * - Good bots (Googlebot, Bingbot, Applebot): rate-limited (10/min), NOT blocked
 * - Bad bots on expensive routes (/api/search/*, /api/dht/*): blocked (403)
 * - Bad bots on other API routes: rate-limited (5/min), allowed through
 * - Normal browsers: rate-limited on expensive routes (30/min)
 * - Supabase session: refreshed (cookie rewritten) when the access token expires within 60s
 * - ?ref=CODE: stored in the referral_code cookie when valid
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proxy as middleware } from './proxy';
import { NextRequest, NextResponse } from 'next/server';

/** A response that lets the request carry on to the app (NextResponse.next()). */
function expectPassThrough(res: Response | undefined): asserts res is NextResponse {
  expect(res).toBeDefined();
  expect(res!.status).toBe(200);
  expect(res!.headers.get('x-middleware-next')).toBe('1');
}

describe('Bot Handling Middleware', () => {
  function callMiddleware(pathname: string, userAgent: string | null) {
    const url = new URL(`http://localhost${pathname}`);
    const req = new NextRequest(url, {
      headers: {
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        'x-forwarded-for': `${Math.random().toString(36).slice(2)}.1.1.1`, // unique IP per call to avoid rate limit state
      },
    });
    return middleware(req);
  }

  it('should allow Googlebot on non-expensive API routes (rate-limited, not blocked)', async () => {
    const res = await callMiddleware('/api/torrents/123', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    // Good bots are allowed through (rate-limited at 10/min but first request passes)
    expectPassThrough(res);
  });

  it('should allow Bingbot on non-expensive API routes', async () => {
    const res = await callMiddleware('/api/stream', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)');
    expectPassThrough(res);
  });

  it('should block bad bots from expensive API routes with 403', async () => {
    const res = await callMiddleware('/api/search/torrents', 'SomeBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should charge GPTBot on expensive API routes (402 from the gateway, not 403)', async () => {
    const res = await callMiddleware('/api/dht/browse', 'GPTBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
  });

  it('should allow bad bots on non-expensive API routes (rate-limited)', async () => {
    // Bad bots on non-expensive routes are rate-limited but not immediately blocked
    const res = await callMiddleware('/api/torrents/123', 'SomeBot/1.0');
    expectPassThrough(res);
  });

  it('should allow normal browsers to access API routes', async () => {
    const res = await callMiddleware('/api/torrents/123', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    expectPassThrough(res);
  });

  it('should allow requests with no user-agent', async () => {
    const res = await callMiddleware('/api/torrents/123', null);
    expectPassThrough(res);
  });

  it('should not block bots from non-API routes', async () => {
    const res = await callMiddleware('/torrents/123', 'Googlebot/2.1');
    expectPassThrough(res);
  });

  it('should block AhrefsBot from expensive API routes', async () => {
    const res = await callMiddleware('/api/search/torrents', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block social media preview bots from expensive API routes', async () => {
    const agents = [
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'WhatsApp/2.0',
      'TelegramBot',
      'Discordbot/2.0',
    ];
    for (const ua of agents) {
      const res = await callMiddleware('/api/search/torrents', ua);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    }
  });
});

describe('Crawl Gateway (x402)', () => {
  const CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const META_UA = 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)';

  function callProxy(pathname: string, userAgent: string | null, headers: Record<string, string> = {}) {
    const url = new URL(`http://localhost${pathname}`);
    const req = new NextRequest(url, {
      headers: {
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        'x-forwarded-for': `${Math.random().toString(36).slice(2)}.1.1.1`,
        ...headers,
      },
    });
    return middleware(req);
  }

  it('answers meta-externalagent on a page route with 402 and an x402 offer', async () => {
    const res = await callProxy('/browse', META_UA);
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
    expect(res!.headers.get('content-type')).toContain('application/json');
    const body = (await res!.json()) as { x402Version: number; accepts: unknown[]; pass: { buy: string } };
    expect(body.x402Version).toBe(2);
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(body.pass.buy).toMatch(/\/crawl$/);
  });

  it('answers a training crawler that asks for HTML with the 402 sales page', async () => {
    const res = await callProxy('/browse', META_UA, { accept: 'text/html,application/xhtml+xml' });
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
    expect(res!.headers.get('content-type')).toContain('text/html');
  });

  it('lets a training crawler read robots.txt', async () => {
    const res = await callProxy('/robots.txt', META_UA);
    expectPassThrough(res);
  });

  it('passes a Chrome browser through to the existing behaviour', async () => {
    const res = await callProxy('/browse', CHROME_UA);
    expectPassThrough(res);
  });

  it('passes a Chrome browser through on expensive API routes (rate limit, not 402)', async () => {
    const res = await callProxy('/api/search/torrents', CHROME_UA);
    expectPassThrough(res);
  });

  it('passes Googlebot and a retrieval crawler through', async () => {
    expectPassThrough(await callProxy('/browse', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
    expectPassThrough(await callProxy('/browse', 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'));
  });

  it('serves the sales page at /crawl to anyone, including a browser', async () => {
    const res = await callProxy('/crawl', CHROME_UA, { accept: 'text/html' });
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
    expect(res!.headers.get('content-type')).toContain('text/html');
  });
});

describe('Supabase session refresh and referral cookie', () => {
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
  const META_UA = 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)';
  const SUPABASE_URL = 'https://sb.test';

  /** An unsigned JWT whose payload carries only `exp`. */
  function jwt(expiresInSeconds: number): string {
    const b64url = (s: string) => Buffer.from(s).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify({ exp }))}.sig`;
  }

  function authCookie(expiresInSeconds: number, refreshToken = 'old-refresh'): string {
    return encodeURIComponent(JSON.stringify({ access_token: jwt(expiresInSeconds), refresh_token: refreshToken }));
  }

  function call(
    pathname: string,
    { ua = CHROME_UA, cookies = {}, headers = {} }: { ua?: string; cookies?: Record<string, string>; headers?: Record<string, string> } = {}
  ) {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const req = new NextRequest(new URL(`http://localhost${pathname}`), {
      headers: {
        'user-agent': ua,
        'x-forwarded-for': `${Math.random().toString(36).slice(2)}.1.1.1`,
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    });
    return middleware(req);
  }

  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: jwt(3600), refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('refreshes an expiring session for a browser and writes the new tokens back', async () => {
    const res = await call('/browse', { cookies: { 'sb-auth-token': authCookie(30), 'x-profile-id': 'p1' } });
    expectPassThrough(res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['apikey']).toBe('anon-key');
    expect(JSON.parse(init.body as string)).toEqual({ refresh_token: 'old-refresh' });

    const written = res.cookies.get('sb-auth-token');
    expect(written).toBeDefined();
    expect(written!.httpOnly).toBe(true);
    expect(written!.maxAge).toBe(7 * 24 * 60 * 60);
    expect(JSON.parse(decodeURIComponent(written!.value)).refresh_token).toBe('new-refresh');
  });

  it('leaves a fresh session alone', async () => {
    const res = await call('/browse', { cookies: { 'sb-auth-token': authCookie(3600), 'x-profile-id': 'p1' } });
    expectPassThrough(res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.cookies.get('sb-auth-token')).toBeUndefined();
  });

  it('does nothing for a browser with no session', async () => {
    const res = await call('/browse');
    expectPassThrough(res);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('keeps the refreshed session on the select-profile redirect', async () => {
    const res = await call('/library', { cookies: { 'sb-auth-token': authCookie(30) } });
    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get('location')!).pathname).toBe('/select-profile');
    const written = (res as NextResponse).cookies.get('sb-auth-token');
    expect(JSON.parse(decodeURIComponent(written!.value)).refresh_token).toBe('new-refresh');
  });

  it('clears the cookie when Supabase says the refresh token is revoked (401)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 401 }));
    const res = await call('/browse', { cookies: { 'sb-auth-token': authCookie(30), 'x-profile-id': 'p1' } });
    expectPassThrough(res);
    const written = res.cookies.get('sb-auth-token');
    expect(written!.value).toBe('');
    expect(written!.maxAge).toBe(0);
  });

  it('keeps the stale cookie on a transient refresh failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    const res = await call('/browse', { cookies: { 'sb-auth-token': authCookie(30), 'x-profile-id': 'p1' } });
    expectPassThrough(res);
    expect(res.cookies.get('sb-auth-token')).toBeUndefined();
  });

  it('answers a training crawler with 402 without touching Supabase', async () => {
    const res = await call('/browse', { ua: META_UA, cookies: { 'sb-auth-token': authCookie(30) } });
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res!.headers.get('set-cookie')).toBeNull();
  });

  it('stores a valid ?ref= code in the referral_code cookie', async () => {
    const res = await call('/browse?ref=ABC-123_x');
    expectPassThrough(res);
    const cookie = res.cookies.get('referral_code');
    expect(cookie?.value).toBe('ABC-123_x');
    expect(cookie?.httpOnly).toBe(false);
  });

  it('ignores a malformed ?ref=', async () => {
    const res = await call('/browse?ref=' + encodeURIComponent('<script>'));
    expectPassThrough(res);
    expect(res.cookies.get('referral_code')).toBeUndefined();
  });

  it('sets both cookies on one browser request', async () => {
    const res = await call('/browse?ref=FRIEND1', { cookies: { 'sb-auth-token': authCookie(30), 'x-profile-id': 'p1' } });
    expectPassThrough(res);
    expect(res.cookies.get('referral_code')?.value).toBe('FRIEND1');
    expect(JSON.parse(decodeURIComponent(res.cookies.get('sb-auth-token')!.value)).refresh_token).toBe('new-refresh');
  });
});
