import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import {
  RentalError,
  createRental,
  listRentals,
  ownerSeedboxReady,
  type ShareInput,
} from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/** GET — list the account's seedbox rentals, plus whether its seedbox is rentable. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const [rentals, config] = await Promise.all([
    listRentals(user.id),
    loadAccountSeedboxConfig(user.id),
  ]);
  const ready = await ownerSeedboxReady(config);
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
