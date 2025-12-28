/**
 * Watch Party API Route
 *
 * POST /api/watch-party - Create a new watch party
 * GET /api/watch-party?code=XXXXXX - Get party by code
 *
 * This is a simple in-memory implementation for demo purposes.
 * For production, parties should be stored in a database.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createWatchParty,
  validatePartyCode,
  type CreatePartyOptions,
  type PartySettings,
} from '@/lib/watch-party';
import { getParty, setParty, cleanupOldParties } from './_store';

interface CreatePartyBody {
  hostId?: string;
  hostName?: string;
  mediaUrl?: string;
  mediaTitle?: string;
  settings?: Partial<PartySettings>;
}

/**
 * POST /api/watch-party
 * Create a new watch party
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as CreatePartyBody;

    // Validate required fields
    if (!body.hostName || typeof body.hostName !== 'string') {
      return NextResponse.json(
        { error: 'hostName is required' },
        { status: 400 }
      );
    }

    // Generate a guest ID if not provided (for anonymous users)
    const hostId = body.hostId ?? `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Create the party options
    const options: CreatePartyOptions = {
      hostId,
      hostName: body.hostName,
      mediaUrl: body.mediaUrl ?? '',
      mediaTitle: body.mediaTitle ?? 'Watch Party',
      settings: body.settings,
    };

    // Create the party
    const party = createWatchParty(options);

    // Store the party
    setParty(party.code, party);

    // Cleanup old parties
    cleanupOldParties();

    console.log('[WatchParty] Created party:', {
      code: party.code,
      hostName: party.hostName,
      memberCount: party.members.length,
    });

    return NextResponse.json({
      success: true,
      party: {
        id: party.id,
        code: party.code,
        hostId: party.hostId,
        hostName: party.hostName,
        mediaUrl: party.mediaUrl,
        mediaTitle: party.mediaTitle,
        state: party.state,
        memberCount: party.members.length,
        settings: party.settings,
        createdAt: party.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[WatchParty] Error creating party:', error);
    return NextResponse.json(
      { error: 'Failed to create watch party' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/watch-party?code=XXXXXX
 * Get party by code
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.toUpperCase();

    if (!code) {
      return NextResponse.json(
        { error: 'Party code is required' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      success: true,
      party: {
        id: party.id,
        code: party.code,
        hostId: party.hostId,
        hostName: party.hostName,
        mediaUrl: party.mediaUrl,
        mediaTitle: party.mediaTitle,
        state: party.state,
        memberCount: party.members.length,
        members: party.members.map(m => ({
          id: m.id,
          name: m.name,
          isHost: m.isHost,
        })),
        playback: party.playback,
        settings: party.settings,
        createdAt: party.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[WatchParty] Error getting party:', error);
    return NextResponse.json(
      { error: 'Failed to get watch party' },
      { status: 500 }
    );
  }
}
