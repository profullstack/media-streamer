/**
 * The account's seedboxes, as a collection.
 *
 * @route GET  /api/account/seedboxes — every box, default first, secret-free
 * @route POST /api/account/seedboxes — add another
 *
 * The singular /api/account/seedbox routes still work and act on one box; they
 * take an optional ?id= and fall back to the default, which is what everything
 * written before an account could have more than one expects.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { createSeedbox, listSeedboxes, parseSeedboxInput } from '@/lib/seedbox';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    return NextResponse.json({ seedboxes: await listSeedboxes(user.id) }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const summary = await createSeedbox(user.id, parseSeedboxInput(body));
    return NextResponse.json({ summary }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
