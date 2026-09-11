/**
 * The bridge between a watch party here and a room on nixamp.
 *
 *   GET  /api/watch-party/nixamp?code=ABC123   where the room is (public)
 *   POST /api/watch-party/nixamp               bridge, sync or end (host only)
 *
 * The film stays here; the room goes there. Once a party is bridged, anybody
 * on nixamp -- the web app, the terminal, the desktop app, a television, an
 * agent over MCP -- can find it and be in the room with the people watching
 * in this browser.
 *
 * GET is public on purpose: a member who was handed a code needs the room
 * link, and that link is not a secret -- the room's own visibility on nixamp
 * is what decides who may be in it.
 *
 * POST is the host, proven twice: the signed-in user must be the one whose
 * nixamp account is connected, and must be the host of the party as the
 * in-memory store has it. Neither alone is enough -- the store's hostId can
 * be a guest string, and a connected nixamp account says nothing about which
 * party is yours.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { validatePartyCode } from '@/lib/watch-party';
import {
  NixampConnectionLost,
  NixampNotConnected,
  bridgeParty,
  endBridgedParty,
  getBridgedRoom,
  pushPlayback,
} from '@/lib/nixamp';
import { getParty } from '../_store';

interface BridgeBody {
  code?: string;
  action?: 'bridge' | 'sync' | 'end';
  title?: string;
  mediaTitle?: string;
  positionSeconds?: number;
  playing?: boolean;
}

function cleanCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return code && validatePartyCode(code) ? code : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = cleanCode(new URL(request.url).searchParams.get('code'));
  if (!code) return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });

  const room = await getBridgedRoom(code);
  if (!room) {
    // Not an error: most parties are never bridged, and the page asks about
    // every one it shows.
    return NextResponse.json({ success: true, bridged: false });
  }
  return NextResponse.json({
    success: true,
    bridged: true,
    room: { nixampUrl: room.nixampUrl, roomId: room.roomId, slug: room.slug, site: room.nixampSite },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in, then connect a nixamp account, to put this party on nixamp.' },
      { status: 401 }
    );
  }

  let body: BridgeBody;
  try {
    body = (await request.json()) as BridgeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = cleanCode(body.code);
  if (!code) return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });

  const party = getParty(code);
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });
  if (party.hostId !== user.id) {
    return NextResponse.json({ error: 'Only the host can put this party on nixamp' }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const action = body.action ?? 'bridge';

  try {
    if (action === 'bridge') {
      const room = await bridgeParty({
        userId: user.id,
        partyCode: code,
        title: body.title ?? party.mediaTitle ?? `Watch party ${code}`,
        mediaTitle: body.mediaTitle ?? party.mediaTitle ?? '',
        origin,
      });
      return NextResponse.json({
        success: true,
        bridged: true,
        room: { nixampUrl: room.nixampUrl, roomId: room.roomId, slug: room.slug, site: room.nixampSite },
      });
    }

    if (action === 'sync') {
      // Where the host's own player is. Falling back to the party's recorded
      // playback so a client that only says "sync" still says something true.
      const positionSeconds =
        typeof body.positionSeconds === 'number' ? body.positionSeconds : party.playback.currentTime;
      const playing = typeof body.playing === 'boolean' ? body.playing : party.playback.isPlaying;
      const landed = await pushPlayback({
        userId: user.id,
        partyCode: code,
        positionSeconds,
        playing,
        ...(body.mediaTitle ?? party.mediaTitle ? { mediaTitle: body.mediaTitle ?? party.mediaTitle } : {}),
      });
      // A sync that did not land is not a failure of the party: everybody in
      // this browser is still together. It is only nixamp that is behind.
      return NextResponse.json({ success: true, synced: landed });
    }

    if (action === 'end') {
      return NextResponse.json({ success: true, ended: await endBridgedParty(user.id, code) });
    }

    return NextResponse.json({ error: 'action must be bridge, sync or end' }, { status: 400 });
  } catch (error) {
    if (error instanceof NixampNotConnected) {
      return NextResponse.json(
        { error: 'Connect your nixamp account first.', connect: '/api/v1/nixamp/oauth/start' },
        { status: 409 }
      );
    }
    if (error instanceof NixampConnectionLost) {
      return NextResponse.json(
        { error: 'That nixamp connection has ended. Connect it again.', connect: '/api/v1/nixamp/oauth/start' },
        { status: 409 }
      );
    }
    console.error('[WatchParty] nixamp bridge failed:', error);
    return NextResponse.json({ error: 'Could not reach nixamp' }, { status: 502 });
  }
}
