/**
 * Middleware Tests — Rate limiting and bot handling on API routes
 *
 * Behavior:
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

  it('should allow Googlebot on non-expensive API routes (rate-limited, not blocked)', () => {
    const res = callMiddleware('/api/torrents/123', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    // Good bots are allowed through (rate-limited at 10/min but first request passes)
    expect(res).toBeUndefined();
  });

  it('should allow Bingbot on non-expensive API routes', () => {
    const res = callMiddleware('/api/stream', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)');
    expect(res).toBeUndefined();
  });

  it('should block bad bots from expensive API routes with 403', () => {
    const res = callMiddleware('/api/search/torrents', 'SomeBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block GPTBot from expensive API routes', () => {
    const res = callMiddleware('/api/dht/browse', 'GPTBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should allow bad bots on non-expensive API routes (rate-limited)', () => {
    // Bad bots on non-expensive routes are rate-limited but not immediately blocked
    const res = callMiddleware('/api/torrents/123', 'SomeBot/1.0');
    expect(res).toBeUndefined();
  });

  it('should allow normal browsers to access API routes', () => {
    const res = callMiddleware('/api/torrents/123', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    expect(res).toBeUndefined();
  });

  it('should allow requests with no user-agent', () => {
    const res = callMiddleware('/api/torrents/123', null);
    expect(res).toBeUndefined();
  });

  it('should not block bots from non-API routes', () => {
    const res = callMiddleware('/torrents/123', 'Googlebot/2.1');
    expect(res).toBeUndefined();
  });

  it('should block AhrefsBot from expensive API routes', () => {
    const res = callMiddleware('/api/search/torrents', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block social media preview bots from expensive API routes', () => {
    const agents = [
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'WhatsApp/2.0',
      'TelegramBot',
      'Discordbot/2.0',
    ];
    for (const ua of agents) {
      const res = callMiddleware('/api/search/torrents', ua);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    }
  });
});
