/** POST /api/vault/lock: forget the data key now. Jobs needing it pause until the next unlock. */

import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { unlockStore } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  unlockStore().lock(user.id);
  return NextResponse.json({ unlocked: false, expiresAt: null });
}
