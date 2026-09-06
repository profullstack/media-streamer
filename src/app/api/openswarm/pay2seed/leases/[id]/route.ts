/** @route GET /api/openswarm/pay2seed/leases/[id] — a lease, what it has earned, where it stands. */
import { NextRequest } from 'next/server';
import { getLease } from '@/lib/openswarm/service';
import { failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lease = await getLease(decodeURIComponent(id));
    if (!lease) return json({ error: 'no such lease' }, 404);
    return json({ lease });
  } catch (error) {
    return failed(error);
  }
}
