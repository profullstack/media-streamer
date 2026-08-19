/**
 * @route POST /api/account/seedboxes/[id]/default — make this the account's default.
 *
 * The default is the box used by everything that does not name one: sending a
 * torrent, the streaming proxy, and every resale share.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { listSeedboxes, setDefaultSeedbox } from '@/lib/seedbox';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  try {
    await setDefaultSeedbox(user.id, id);
    return NextResponse.json({ seedboxes: await listSeedboxes(user.id) }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
