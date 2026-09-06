/** @route GET /api/openswarm/pay2seed/parties/[key] — a key's standing and balance. */
import { NextRequest } from 'next/server';
import { getParty } from '@/lib/openswarm/service';
import { failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const party = await getParty(decodeURIComponent(key));
    if (!party) return json({ error: 'no such key here' }, 404);
    return json({ party });
  } catch (error) {
    return failed(error);
  }
}
