/**
 * Watchlist API - Single Watchlist Operations
 *
 * GET    /api/watchlists/:id - Get watchlist with items
 * PATCH  /api/watchlists/:id - Rename watchlist
 * DELETE /api/watchlists/:id - Delete watchlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getWatchlistRepository } from '@/lib/watchlist';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const { id } = await params;

  try {
    const repo = getWatchlistRepository();
    const watchlists = await repo.getUserWatchlists(profileId);
    const watchlist = watchlists.find(w => w.id === id);

    if (!watchlist) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    const items = await repo.getWatchlistItems(id);

    return NextResponse.json({ watchlist, items });
  } catch (error) {
    console.error('[Watchlists] Error fetching watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlist' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const { id } = await params;

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
    const watchlist = await repo.renameWatchlist(profileId, id, name);

    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error('[Watchlists] Error renaming watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to rename watchlist' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const { id } = await params;

  try {
    const repo = getWatchlistRepository();
    await repo.deleteWatchlist(profileId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Watchlists] Error deleting watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete watchlist' },
      { status: 500 },
    );
  }
}
