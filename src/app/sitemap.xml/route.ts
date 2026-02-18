/**
 * Sitemap Index — points to monthly sitemap files.
 * GET /sitemap.xml
 */

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const supabase = getServerClient();

  // Get distinct year-month combos from torrents
  const { data, error } = await supabase.rpc('list_torrents_page' as any, { page_size: 1 });
  // We need month list. Use raw SQL via rpc or a simple approach:
  // Query min/max created_at and generate months between them.
  const { data: minMax, error: mmError } = await supabase
    .from('torrents' as never)
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  let startDate = new Date(2020, 0, 1);
  if (!mmError && minMax && minMax.length > 0) {
    startDate = new Date((minMax[0] as { created_at: string }).created_at);
  }

  const now = new Date();
  const months: string[] = [];

  const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (d <= now) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`torrents-${y}-${m}`);
    d.setMonth(d.getMonth() + 1);
  }

  const sitemaps = months
    .map(
      (slug) =>
        `  <sitemap>\n    <loc>https://bittorrented.com/sitemaps/${slug}.xml</loc>\n  </sitemap>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://bittorrented.com/sitemaps/static.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://bittorrented.com/sitemaps/indexed.xml</loc>
  </sitemap>
${sitemaps}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
