import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadSeedboxForRequest } from '@/lib/seedbox';
import { cleanupStaleTorrents } from '@/lib/seedbox/cleanup';

// Drop torlink records whose data is gone from the seedbox.
//
// torlink never forgets a torrent on its own, so a box that has had files
// deleted accumulates ghost records — it was reporting 63 torrents for 39
// directories on disk. The status page hides them, but only this endpoint
// actually removes them.
//
// POST (not GET) because it mutates: the status poll must stay a safe read.

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = await loadSeedboxForRequest(user.id, new URL(request.url).searchParams.get('id'));
  if (!config?.http) {
    return NextResponse.json({ configured: false }, { status: 200, headers: NO_STORE });
  }

  const result = await cleanupStaleTorrents(config);
  return NextResponse.json(
    {
      configured: true,
      removed: result.removed.length,
      failed: result.failed,
      skipped: result.skipped,
      names: result.removed.map((t) => t.name),
    },
    { status: 200, headers: NO_STORE }
  );
}
