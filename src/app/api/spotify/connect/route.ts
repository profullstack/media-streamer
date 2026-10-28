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
import { dataKeyFor, getVaultSeal, VaultLockedError, vaultErrorBody } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // The credentials librespot writes are sealed under the user's vault, so it
  // must be unlocked before pairing starts.
  if (!dataKeyFor(user.id)) {
    const locked = vaultErrorBody(
      new VaultLockedError((await getVaultSeal(user.id)) ? 'vault_locked' : 'vault_missing')
    )!;
    return NextResponse.json(locked.body, { status: locked.status });
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
