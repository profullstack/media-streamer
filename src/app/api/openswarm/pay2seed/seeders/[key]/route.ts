/** @route GET /api/openswarm/pay2seed/seeders/[key] — a seeder's standing, balance and leases. */
import { NextRequest } from 'next/server';
import { getParty, listLeasesFor } from '@/lib/openswarm/service';
import { failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const seeder = decodeURIComponent(key);
    const party = await getParty(seeder);
    if (!party) return json({ error: 'no such key here' }, 404);
    const leases = await listLeasesFor(seeder);
    return json({
      key: party.key,
      kind: party.kind,
      standing: party.seederStanding,
      proven: party.proven,
      failed: party.failed,
      abandoned: party.abandoned,
      balanceUsd: party.balanceUsd,
      leases,
    });
  } catch (error) {
    return failed(error);
  }
}
