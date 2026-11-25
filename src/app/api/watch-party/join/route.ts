/**
 * Watch Party Join API Route
 *
 * POST /api/watch-party/join - Join an existing watch party
 *
 * Who you are is your session, not a fresh guest id per request. It used to mint a new
 * guest id every time, so a host who reloaded the page (or followed their own link)
 * rejoined as a second, ordinary member: the host controls were gone, nobody could move
 * playback, and the member list grew a duplicate on every reload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  joinWatchParty,
  validatePartyCode,
  type JoinPartyOptions,
} from '@/lib/watch-party';
import { getParty, setParty, touchMember } from '../_store';
import { partyView } from '../_view';

interface JoinPartyBody {
  code?: string;
  userName?: string;
  userId?: string;
}

/**
 * POST /api/watch-party/join
 * Join an existing watch party
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as JoinPartyBody;

    // Validate required fields
    if (!body.code || typeof body.code !== 'string') {
      return NextResponse.json(
        { error: 'Party code is required' },
        { status: 400 }
      );
    }

    if (!body.userName || typeof body.userName !== 'string' || !body.userName.trim()) {
      return NextResponse.json(
        { error: 'userName is required' },
        { status: 400 }
      );
    }

    const code = body.code.toUpperCase();

    if (!validatePartyCode(code)) {
      return NextResponse.json(
        { error: 'Invalid party code format' },
        { status: 400 }
      );
    }

    // Before the party is read: nothing may await between reading it and writing it back.
    const user = await getCurrentUser();
    const party = await getParty(code);

    if (!party) {
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    // Check if party has ended
    if (party.state === 'ended') {
      return NextResponse.json(
        { error: 'Party has ended' },
        { status: 410 }
      );
    }

    // The session's user id; a guest id only where there is no session (a guest id the
    // caller kept from an earlier join is reused, so a reload is the same member).
    const claimed = typeof body.userId === 'string' && /^guest_[a-z0-9_]{1,40}$/i.test(body.userId) ? body.userId : undefined;
    const userId = user?.id ?? claimed ?? `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const already = party.members.some((m) => m.id === userId);

    // Check if party is full: somebody coming back is not a new seat.
    if (!already && party.members.length >= party.settings.maxMembers) {
      return NextResponse.json(
        { error: 'Party is full' },
        { status: 403 }
      );
    }

    const joinOptions: JoinPartyOptions = {
      userId,
      userName: body.userName.trim().slice(0, 60),
    };

    // Join the party (a member who is already in, the host included, is left as they are)
    const updatedParty = joinWatchParty(party, joinOptions);
    if (updatedParty !== party) setParty(code, updatedParty);
    touchMember(code, userId);

    console.log('[WatchParty] User joined party:', {
      code,
      memberCount: updatedParty.members.length,
      returning: already,
    });

    return NextResponse.json({
      success: true,
      party: partyView(updatedParty),
      userId, // Return the user ID so they can identify themselves
      isHost: userId === updatedParty.hostId,
    });
  } catch (error) {
    console.error('[WatchParty] Error joining party:', error);
    return NextResponse.json(
      { error: 'Failed to join watch party' },
      { status: 500 }
    );
  }
}
