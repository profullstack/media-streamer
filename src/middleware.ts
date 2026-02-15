/**
 * Next.js Middleware
 *
 * - Blocks known bots/crawlers from hitting API routes and triggering expensive operations
 * - robots.txt is advisory; this enforces the restriction server-side
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Common bot user-agent patterns (case-insensitive match)
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

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent');

  // Block bots from API routes (except sitemap/robots which are public)
  if (pathname.startsWith('/api/') && isBot(userAgent)) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return undefined;
}

export const config = {
  matcher: ['/api/:path*'],
};
