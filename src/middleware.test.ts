/**
 * Middleware Tests — Bot blocking on API routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the middleware by importing and calling it directly
// Mock NextResponse and NextRequest
const mockNextUrl = { pathname: '' };

function createMockRequest(pathname: string, userAgent: string | null) {
  return {
    nextUrl: { pathname },
    headers: {
      get: (name: string) => (name === 'user-agent' ? userAgent : null),
    },
  };
}

// Import the actual middleware
import { middleware } from './middleware';
import { NextRequest } from 'next/server';

describe('Bot Blocking Middleware', () => {
  function callMiddleware(pathname: string, userAgent: string | null) {
    const url = new URL(`http://localhost${pathname}`);
    const req = new NextRequest(url, {
      headers: userAgent ? { 'user-agent': userAgent } : {},
    });
    return middleware(req);
  }

  it('should block Googlebot from API routes', () => {
    const res = callMiddleware('/api/torrents/123', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block Bingbot from API routes', () => {
    const res = callMiddleware('/api/stream', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block generic bot user agents', () => {
    const res = callMiddleware('/api/torrents/index', 'SomeBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block GPTBot', () => {
    const res = callMiddleware('/api/torrents/123', 'GPTBot/1.0');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
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
    // Middleware matcher only runs on /api/ routes, but test the function directly
    const res = callMiddleware('/torrents/123', 'Googlebot/2.1');
    expect(res).toBeUndefined();
  });

  it('should block AhrefsBot', () => {
    const res = callMiddleware('/api/torrents/123', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)');
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  it('should block social media preview bots from API', () => {
    const agents = [
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'WhatsApp/2.0',
      'TelegramBot',
      'Discordbot/2.0',
    ];
    for (const ua of agents) {
      const res = callMiddleware('/api/torrents/123', ua);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    }
  });
});
