import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { listSeedboxes, loadSeedboxForRequest } from '@/lib/seedbox';
import {
  RentalError,
  createRental,
  listRentals,
  ownerSeedboxReady,
  type ShareInput,
} from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/**
 * GET — the account's rentals, plus whether it has anything rentable at all.
 *
 * Readiness is reported for the *best* box the account has, not for its default.
 * An account whose default is half-configured but whose second box works can
 * still list that second box, and gating the form on the default alone would
 * have hidden it with nothing to explain why.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const [rentals, boxes] = await Promise.all([listRentals(user.id), listSeedboxes(user.id)]);

  const ids: (string | null)[] = boxes.filter((b) => b.id).map((b) => b.id);
  if (ids.length === 0) ids.push(null); // no boxes: report on nothing, as before

  let ready = await ownerSeedboxReady(null);
  for (const id of ids) {
    const candidate = await ownerSeedboxReady(await loadSeedboxForRequest(user.id, id));
    if (candidate.ready) {
      ready = candidate;
      break;
    }
    ready = candidate;
  }
  return NextResponse.json({ rentals, ready }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

/** POST — create/enable a public rental of the account's seedbox. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as ShareInput;
  try {
    const rental = await createRental(user.id, body);
    return NextResponse.json({ rental }, { status: 201 });
  } catch (error) {
    if (error instanceof RentalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
