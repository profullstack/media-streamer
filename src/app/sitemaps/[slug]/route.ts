/**
 * Monthly Sitemap Generator
 * GET /sitemaps/torrents-2026-02.xml
 *
 * Streams up to 50k URLs per file. If slug ends with -N (e.g. torrents-2026-02-2.xml),
 * it's the Nth 50k chunk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';
import { normalizeInfoHash } from '@/lib/torrent-index/cursors';

export const dynamic = 'force-dynamic';

const BATCH = 50000;

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { slug } = await ctx.params;

  // Parse slug: torrents-YYYY-MM.xml or torrents-YYYY-MM-N.xml
  const cleaned = slug.replace(/\.xml$/, '');
  const match = cleaned.match(/^torrents-(\d{4})-(\d{2})(?:-(\d+))?$/);
  if (!match) {
    return new NextResponse('Not found', { status: 404 });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const chunk = match[3] ? Number(match[3]) : 1;

  if (month < 1 || month > 12) {
    return new NextResponse('Not found', { status: 404 });
  }

  const startTs = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const endTs = new Date(Date.UTC(year, month, 1)).toISOString();
  const offset = (chunk - 1) * BATCH;

  const supabase = getServerClient();

  // Use direct query with limit/offset for sitemap generation (simpler than cursor for bulk)
  const { data, error } = await supabase
    .from('torrents' as never)
    .select('info_hash')
    .gte('created_at', startTs)
    .lt('created_at', endTs)
    .order('created_at', { ascending: true })
    .order('info_hash', { ascending: true })
    .range(offset, offset + BATCH - 1);

  if (error) {
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }

  const rows = (data ?? []) as { info_hash: unknown }[];

  const urls = rows
    .map((r) => {
      const hex = normalizeInfoHash(r.info_hash);
      return `  <url><loc>https://bittorrented.com/torrents/${hex}</loc></url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
