/**
 * GET /api/spotify/status
 *
 * Reports the current user's Spotify device: whether an account is paired,
 * what the librespot process is doing, and what is playing. If credentials
 * exist but the process is not running (first request after a deploy), this
 * is also where it gets started, so a restart needs no user action.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSpotifyCredentials, getSpotifyPlayerManager } from '@/lib/spotify';

export const dynamic = 'force-dynamic';

export const STREAM_URL = '/api/spotify/stream/index.m3u8';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const manager = getSpotifyPlayerManager();
    let status = manager.getStatus(user.id);
    let connected = status.state !== 'stopped' && status.state !== 'error';
    let username: string | null = null;

    if (status.state !== 'pairing') {
      const creds = await getSpotifyCredentials(user.id);
      if (creds) {
        connected = true;
        username = creds.username;
        if (status.state === 'stopped') {
          status = manager.ensureRunning(user.id, creds.credentialsJson);
        }
      } else if (status.state !== 'error') {
        connected = false;
      }
    }

    return NextResponse.json(
      { connected, username, streamUrl: STREAM_URL, ...status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[spotify/status]', error);
    return NextResponse.json({ error: 'Failed to load Spotify status' }, { status: 500 });
  }
}
