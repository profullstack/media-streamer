/**
 * POST /api/spotify/connect
 *
 * Starts Spotify device pairing for the current user and returns the code to
 * enter at spotify.com/pair. Credentials are persisted the moment librespot
 * writes them, from inside the process manager, so the pairing survives the
 * user closing the tab.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSpotifyPlayerManager, saveSpotifyCredentials } from '@/lib/spotify';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const status = await getSpotifyPlayerManager().startPairing(user.id, {
      onCredentials: async (credentialsJson) => {
        await saveSpotifyCredentials({ userId: user.id, credentialsJson });
      },
    });
    if (status.state === 'error') {
      return NextResponse.json({ error: status.error ?? 'Could not start pairing' }, { status: 502 });
    }
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[spotify/connect]', error);
    return NextResponse.json({ error: 'Failed to start Spotify pairing' }, { status: 500 });
  }
}
