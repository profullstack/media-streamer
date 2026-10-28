/**
 * GET /api/v1/nixamp/hosts — the Nixamp servers the signed-in member runs,
 * as nixamp.com lists them: where "Broadcast with Nixamp" can send music.
 * Needs a nixamp connection with the stations scope (409 reconnect_required
 * for one made before it existed).
 */

import { NextResponse } from 'next/server';
import { vaultErrorBody } from '@/lib/vault';
import { getCurrentUser } from '@/lib/auth';
import { getNixampAccount } from '@/lib/nixamp';
import { HandoffError, listHosts } from '@/lib/nixamp/handoff';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const account = await getNixampAccount(user.id);
  if (!account) return NextResponse.json({ error: 'connect nixamp first', code: 'not_connected' }, { status: 409 });
  try {
    return NextResponse.json({ hosts: await listHosts(account) });
  } catch (error) {
    const locked = vaultErrorBody(error);
    if (locked) return NextResponse.json(locked.body, { status: locked.status });
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: 'could not reach nixamp.com', code: 'nixamp_unreachable' }, { status: 502 });
  }
}
