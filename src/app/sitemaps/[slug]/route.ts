/**
 * GET /sitemaps/static.xml: kept for crawlers that remember the old sitemap index; it is
 * the same public list as /sitemap.xml. The monthly torrent and indexed-torrent sitemaps
 * are retired with the index (legal mode), so every other slug is 404.
 */

import { NextRequest } from 'next/server';
import { loadAllPosts } from '@/lib/blog/posts';
import { publicSitemapXml } from '@/lib/public-sitemap';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { slug } = await ctx.params;
  if (slug.replace(/\.xml$/, '') !== 'static') {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return new Response(publicSitemapXml(await loadAllPosts()), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
