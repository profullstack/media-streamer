/**
 * POST /api/watch-party/leave: a member saying they are going.
 *
 * "Leave Party" used to change the page and tell nobody, so the member list only ever
 * grew. A member leaving is taken off the list; the host leaving ends the party for
 * everybody, which is what their button says. Closing the tab is not leaving: a member
 * who stops polling is dropped by the store, and a host whose laptop slept still has a
 * party to come back to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { leaveWatchParty, validatePartyCode } from '@/lib/watch-party';
import { getParty, setParty } from '../_store';

interface LeaveBody {
  code?: string;
  userId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: LeaveBody;
  try {
    body = (await request.json()) as LeaveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = (body.code ?? '').toUpperCase();
  if (!code || !validatePartyCode(code)) {
    return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });
  }

  const user = await getCurrentUser();
  const party = await getParty(code);
  if (!party) return NextResponse.json({ success: true, ended: true });

  // The session's user; a guest id is honoured only for a guest member, so nobody can
  // remove a signed-in member (or end a signed-in host's party) by naming their id.
  const claimed = typeof body.userId === 'string' && body.userId.startsWith('guest_') ? body.userId : undefined;
  const userId = user?.id ?? claimed;
  if (!userId || !party.members.some((m) => m.id === userId)) {
    return NextResponse.json({ success: true, ended: party.state === 'ended' });
  }

  const updated = leaveWatchParty(party, userId);
  setParty(code, updated);
  return NextResponse.json({ success: true, ended: updated.state === 'ended' });
}
