/**
 * POST /api/live/disconnect
 *
 * Stop anything on air and forget the member's c0mpute stream. The stream
 * itself stays on their c0mpute account, where they can delete it.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { liveDeps, stopSessionsOf } from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const deps = liveDeps();
  if (!deps) return NextResponse.json({ error: 'c0mpute Live is not configured' }, { status: 503 });

  stopSessionsOf(user.id);
  try {
    await deps.store.remove(user.id);
  } catch (err) {
    console.error('[c0mpute-live] disconnect failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Could not disconnect' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
