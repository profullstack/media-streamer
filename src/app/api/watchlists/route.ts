/**
 * Watchlist API - List & Create
 *
 * GET  /api/watchlists - Get all user watchlists
 * POST /api/watchlists - Create a new watchlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getWatchlistRepository } from '@/lib/watchlist';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  try {
    const repo = getWatchlistRepository();
    let watchlists = await repo.getUserWatchlists(profileId);

    // Auto-create default watchlist if none exist
    if (watchlists.length === 0) {
      const defaultWatchlist = await repo.getOrCreateDefaultWatchlist(profileId);
      watchlists = [defaultWatchlist];
    }

    return NextResponse.json({ watchlists });
  } catch (error) {
    console.error('[Watchlists] Error fetching watchlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlists' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  try {
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 characters)' }, { status: 400 });
    }

    const repo = getWatchlistRepository();
    const watchlist = await repo.createWatchlist(profileId, name);

    return NextResponse.json({ watchlist }, { status: 201 });
  } catch (error) {
    console.error('[Watchlists] Error creating watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to create watchlist' },
      { status: 500 },
    );
  }
}
