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
 */

import { describe, it, expect } from 'vitest';
import { proxy as middleware } from './proxy';
import { NextRequest } from 'next/server';

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
    expect(res).toBeUndefined();
  });

  it('should allow Bingbot on non-expensive API routes', async () => {
    const res = await callMiddleware('/api/stream', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)');
    expect(res).toBeUndefined();
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
    expect(res).toBeUndefined();
  });

  it('should allow normal browsers to access API routes', async () => {
    const res = await callMiddleware('/api/torrents/123', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    expect(res).toBeUndefined();
  });

  it('should allow requests with no user-agent', async () => {
    const res = await callMiddleware('/api/torrents/123', null);
    expect(res).toBeUndefined();
  });

  it('should not block bots from non-API routes', async () => {
    const res = await callMiddleware('/torrents/123', 'Googlebot/2.1');
    expect(res).toBeUndefined();
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
    expect(res).toBeUndefined();
  });

  it('passes a Chrome browser through to the existing behaviour', async () => {
    const res = await callProxy('/browse', CHROME_UA);
    expect(res).toBeUndefined();
  });

  it('passes a Chrome browser through on expensive API routes (rate limit, not 402)', async () => {
    const res = await callProxy('/api/search/torrents', CHROME_UA);
    expect(res).toBeUndefined();
  });

  it('passes Googlebot and a retrieval crawler through', async () => {
    expect(await callProxy('/browse', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeUndefined();
    expect(await callProxy('/browse', 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)')).toBeUndefined();
  });

  it('serves the sales page at /crawl to anyone, including a browser', async () => {
    const res = await callProxy('/crawl', CHROME_UA, { accept: 'text/html' });
    expect(res).toBeDefined();
    expect(res!.status).toBe(402);
    expect(res!.headers.get('content-type')).toContain('text/html');
  });
});
