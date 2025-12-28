/**
 * Watch Party Join API Route
 *
 * POST /api/watch-party/join - Join an existing watch party
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  joinWatchParty,
  validatePartyCode,
  type JoinPartyOptions,
} from '@/lib/watch-party';

// Import the parties map from the main route
// Note: In production, this should be a database
import { getParty, setParty } from '../_store';

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

    if (!body.userName || typeof body.userName !== 'string') {
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

    const party = getParty(code);

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

    // Check if party is full
    if (party.members.length >= party.settings.maxMembers) {
      return NextResponse.json(
        { error: 'Party is full' },
        { status: 403 }
      );
    }

    // Generate a guest ID if not provided
    const userId = body.userId ?? `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const joinOptions: JoinPartyOptions = {
      userId,
      userName: body.userName,
    };

    // Join the party
    const updatedParty = joinWatchParty(party, joinOptions);
    setParty(code, updatedParty);

    console.log('[WatchParty] User joined party:', {
      code,
      userName: body.userName,
      memberCount: updatedParty.members.length,
    });

    return NextResponse.json({
      success: true,
      party: {
        id: updatedParty.id,
        code: updatedParty.code,
        hostId: updatedParty.hostId,
        hostName: updatedParty.hostName,
        mediaUrl: updatedParty.mediaUrl,
        mediaTitle: updatedParty.mediaTitle,
        state: updatedParty.state,
        memberCount: updatedParty.members.length,
        members: updatedParty.members.map(m => ({
          id: m.id,
          name: m.name,
          isHost: m.isHost,
        })),
        playback: updatedParty.playback,
        settings: updatedParty.settings,
      },
      userId, // Return the user ID so they can identify themselves
    });
  } catch (error) {
    console.error('[WatchParty] Error joining party:', error);
    return NextResponse.json(
      { error: 'Failed to join watch party' },
      { status: 500 }
    );
  }
}
