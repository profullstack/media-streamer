/**
 * GET /sitemap.xml: the public pages and blog posts only (src/lib/public-sitemap.ts).
 * Open to signed-out visitors and crawlers (site-offline INVITE_ONLY_OPEN, legal mode).
 */

import { loadAllPosts } from '@/lib/blog/posts';
import { publicSitemapXml } from '@/lib/public-sitemap';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const posts = await loadAllPosts();
  return new Response(publicSitemapXml(posts), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
