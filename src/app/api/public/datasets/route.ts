/** @route GET /api/public/datasets — every licence-cleared Academic Torrents dataset, as OpenFile file objects. */
import { NextRequest, NextResponse } from 'next/server';
import { type Catalog, type MirrorState, datasetsFeed } from '@/lib/academic/catalog';
import { ACADEMIC_LISTING } from '@/lib/academic/listing';
import { publicOrigin } from '@/lib/openswarm/service';
import catalog from '@/data/academic/catalog.json';
import mirror from '@/data/academic/mirror.json';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest): NextResponse {
  // Behind Railway's proxy request.url is localhost; the configured app URL wins.
  const origin = publicOrigin(new URL(request.url).origin);
  const feed = datasetsFeed(catalog as Catalog, mirror as MirrorState, origin);
  // Withdrawn: an empty snapshot, so a reader sees "nothing on offer" rather than an error.
  const body = ACADEMIC_LISTING.listed ? feed : { ...feed, datasets: [], withdrawn: ACADEMIC_LISTING };
  return NextResponse.json(body, {
    headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  });
}
