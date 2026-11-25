/**
 * Watch Party API Route
 *
 * POST /api/watch-party - Create a new watch party (signed in, with a plan)
 * GET /api/watch-party?code=XXXXXX[&member=ID] - Get party by code; `member` says "still here"
 * PATCH /api/watch-party - Update party media (host only)
 *
 * Parties are kept by ./_store: in memory, copied to Redis so a deploy does not end them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createWatchParty,
  validatePartyCode,
  type CreatePartyOptions,
  type PartySettings,
} from '@/lib/watch-party';
import { getParty, setParty, cleanupOldParties, pruneStaleMembers, touchMember } from './_store';
import { cleanMediaUrl, isHostOf, partyView } from './_view';
import { canHostParty } from './_host';
import { emitWebhook } from '@/lib/webhooks/hub';

interface CreatePartyBody {
  hostName?: string;
  mediaUrl?: string;
  mediaTitle?: string;
  settings?: Partial<PartySettings>;
}

const cleanTitle = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined;

/**
 * POST /api/watch-party
 * Create a new watch party
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as CreatePartyBody;

    // Validate required fields
    if (!body.hostName || typeof body.hostName !== 'string' || !body.hostName.trim()) {
      return NextResponse.json(
        { error: 'hostName is required' },
        { status: 400 }
      );
    }

    // Whoever is signed in IS the host: the party's hostId is their user id, which is
    // what proves every later host action (playback, media, the nixamp bridge) by the
    // session alone. The site is members-only, so there is no anonymous host any more.
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to start a watch party' }, { status: 401 });
    }
    if (!(await canHostParty(user.id))) {
      return NextResponse.json(
        {
          error: 'paid_plan_required',
          message: 'Hosting a watch party is part of a paid plan. Joining one is free.',
          feature: 'watch-party',
          upgradeUrl: '/pricing?upgrade=watch-party',
        },
        { status: 402 }
      );
    }

    let mediaUrl = '';
    if (body.mediaUrl) {
      const cleaned = cleanMediaUrl(body.mediaUrl);
      if (!cleaned) return NextResponse.json({ error: 'That link cannot be played. Use an https link.' }, { status: 400 });
      mediaUrl = cleaned;
    }

    // Create the party options
    const options: CreatePartyOptions = {
      hostId: user.id,
      hostName: body.hostName.trim().slice(0, 60),
      mediaUrl,
      mediaTitle: cleanTitle(body.mediaTitle) ?? 'Watch Party',
      settings: body.settings,
    };

    // Create the party
    const party = createWatchParty(options);

    // Store the party
    setParty(party.code, party);

    // Cleanup old parties
    cleanupOldParties();

    // The party code is what the host shares anyway; the media URL is left out.
    await emitWebhook(
      user.id,
      'watch_party.started',
      {
        party_id: party.id,
        code: party.code,
        host_name: party.hostName,
        media_title: party.mediaTitle,
        created_at: party.createdAt.toISOString(),
      },
      { subject: `watch_party:${party.id}`, id: `evt_watch_party_started_${party.id}` }
    ).catch(() => undefined);

    console.log('[WatchParty] Created party:', {
      code: party.code,
      hostName: party.hostName,
      memberCount: party.members.length,
    });

    return NextResponse.json({ success: true, party: partyView(party) });
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

    let party = await getParty(code);

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

    // The poll doubles as "I am still here"; whoever stopped polling has left.
    const member = searchParams.get('member');
    if (member && party.members.some((m) => m.id === member)) touchMember(code, member);
    const pruned = pruneStaleMembers(party);
    if (pruned !== party) {
      party = pruned;
      setParty(code, party);
    }

    return NextResponse.json(
      { success: true, party: partyView(party) },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    console.error('[WatchParty] Error getting party:', error);
    return NextResponse.json(
      { error: 'Failed to get watch party' },
      { status: 500 }
    );
  }
}

interface UpdatePartyBody {
  code: string;
  hostId?: string;
  mediaUrl?: string;
  mediaTitle?: string;
  torrentId?: string;
  filePath?: string;
}

/**
 * PATCH /api/watch-party
 * Update party media (host only)
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as UpdatePartyBody;

    // Validate required fields
    if (!body.code || typeof body.code !== 'string') {
      return NextResponse.json(
        { error: 'Party code is required' },
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

    // Asked before the party is read, so nothing awaits between reading it and writing it
    // back: a join landing in that gap used to be overwritten.
    const user = await getCurrentUser();
    const party = await getParty(code);

    if (!party) {
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    // Verify the requester is the host: the session for a signed-in host,
    // the guest id only for a guest-hosted party.
    if (!isHostOf(party, user?.id, typeof body.hostId === 'string' ? body.hostId : undefined)) {
      return NextResponse.json(
        { error: 'Only the host can update party media' },
        { status: 403 }
      );
    }

    // Check if party has ended
    if (party.state === 'ended') {
      return NextResponse.json(
        { error: 'Party has ended' },
        { status: 410 }
      );
    }

    // A file from the catalog, or a link the host pasted. An empty link clears the film.
    let mediaUrl = '';
    if (body.torrentId && body.filePath) {
      mediaUrl = `/api/stream?torrent=${encodeURIComponent(body.torrentId)}&file=${encodeURIComponent(body.filePath)}`;
    } else if (body.mediaUrl) {
      const cleaned = cleanMediaUrl(body.mediaUrl);
      if (!cleaned) {
        return NextResponse.json({ error: 'That link cannot be played. Use an https link to a video or an HLS playlist.' }, { status: 400 });
      }
      mediaUrl = cleaned;
    }

    // A new film starts at the beginning, paused, for everybody.
    const updated = {
      ...party,
      mediaUrl,
      mediaTitle: cleanTitle(body.mediaTitle) ?? party.mediaTitle,
      state: 'waiting' as const,
      playback: { isPlaying: false, currentTime: 0, duration: 0, lastUpdate: Date.now() },
    };
    setParty(code, updated);

    console.log('[WatchParty] Updated party media:', {
      code: updated.code,
      mediaTitle: updated.mediaTitle,
    });

    return NextResponse.json({ success: true, party: partyView(updated) });
  } catch (error) {
    console.error('[WatchParty] Error updating party:', error);
    return NextResponse.json(
      { error: 'Failed to update watch party' },
      { status: 500 }
    );
  }
}
