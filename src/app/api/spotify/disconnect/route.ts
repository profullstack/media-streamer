/**
 * POST /api/spotify/disconnect
 *
 * Stops the user's librespot process, wipes its state directory (cached
 * credentials, playlist, segments) and deletes the stored credentials. The
 * device disappears from their Spotify apps within a few seconds.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteSpotifyCredentials, getSpotifyPlayerManager } from '@/lib/spotify';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    getSpotifyPlayerManager().stop(user.id, { purge: true });
    await deleteSpotifyCredentials(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[spotify/disconnect]', error);
    return NextResponse.json({ error: 'Failed to disconnect Spotify' }, { status: 500 });
  }
}
