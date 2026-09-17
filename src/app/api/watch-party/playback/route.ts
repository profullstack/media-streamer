/**
 * PATCH /api/watch-party/playback — the host saying where the film is.
 *
 * A watch party is everybody at the same second, and this is the second.
 * The host's player reports it on play, pause and seek and then every few
 * seconds while playing; every other member polls the party and follows.
 *
 * Who is the host is proven by the session first: a signed-in host's id is
 * their user id, which nobody else's cookie carries. A guest-hosted party
 * (one made before the site went members-only) is proven by the guest id,
 * because that is all such a party has.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updatePlaybackState, validatePartyCode } from '@/lib/watch-party';
import { getParty, setParty } from '../_store';
import { isHostOf, partyView } from '../_view';

interface PlaybackBody {
  code?: string;
  hostId?: string;
  currentTime?: number;
  isPlaying?: boolean;
  duration?: number;
}

function finiteSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: PlaybackBody;
  try {
    body = (await request.json()) as PlaybackBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = (body.code ?? '').toUpperCase();
  if (!code || !validatePartyCode(code)) {
    return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });
  }
  const party = getParty(code);
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });
  if (party.state === 'ended') return NextResponse.json({ error: 'Party has ended' }, { status: 410 });

  const user = await getCurrentUser();
  if (!isHostOf(party, user?.id, body.hostId)) {
    return NextResponse.json({ error: 'Only the host can move playback' }, { status: 403 });
  }

  const currentTime = finiteSeconds(body.currentTime);
  const duration = finiteSeconds(body.duration);
  const isPlaying = typeof body.isPlaying === 'boolean' ? body.isPlaying : undefined;
  if (currentTime === undefined && isPlaying === undefined && duration === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = updatePlaybackState(party, {
    ...(currentTime !== undefined ? { currentTime } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(isPlaying !== undefined ? { isPlaying } : {}),
  });
  // The party's own state follows the player: a film that is playing is a
  // party that is playing, which is what the list of parties reads.
  if (updated.playback.isPlaying) updated.state = 'playing';
  else if (party.state === 'playing' || party.state === 'paused') updated.state = 'paused';
  setParty(code, updated);

  return NextResponse.json({ success: true, party: partyView(updated) });
}
