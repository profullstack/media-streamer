/**
 * Watchlist Items API - Add & Remove Items
 *
 * POST   /api/watchlists/:id/items - Add TMDB item to watchlist
 * DELETE /api/watchlists/:id/items - Remove item from watchlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getWatchlistRepository } from '@/lib/watchlist';
import type { AddWatchlistItemInput } from '@/lib/watchlist';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const { id: watchlistId } = await params;

  try {
    const body = await request.json() as {
      tmdbId?: number;
      mediaType?: string;
      title?: string;
      posterPath?: string | null;
      overview?: string | null;
      releaseDate?: string | null;
      voteAverage?: number | null;
      genres?: string[] | null;
      castNames?: string[] | null;
      directors?: string[] | null;
    };

    if (!body.tmdbId || !body.mediaType || !body.title) {
      return NextResponse.json(
        { error: 'tmdbId, mediaType, and title are required' },
        { status: 400 },
      );
    }

    if (body.mediaType !== 'movie' && body.mediaType !== 'tv') {
      return NextResponse.json(
        { error: 'mediaType must be "movie" or "tv"' },
        { status: 400 },
      );
    }

    // Verify watchlist belongs to user
    const repo = getWatchlistRepository();
    const watchlists = await repo.getUserWatchlists(profileId);
    const watchlist = watchlists.find(w => w.id === watchlistId);

    if (!watchlist) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    const input: AddWatchlistItemInput = {
      tmdbId: body.tmdbId,
      mediaType: body.mediaType,
      title: body.title,
      posterPath: body.posterPath,
      overview: body.overview,
      releaseDate: body.releaseDate,
      voteAverage: body.voteAverage,
      genres: body.genres,
      castNames: body.castNames,
      directors: body.directors,
    };

    const item = await repo.addItem(watchlistId, input);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add item';

    if (message === 'Item already in watchlist') {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error('[Watchlists] Error adding item:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
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

  const { id: watchlistId } = await params;

  try {
    const body = await request.json() as { tmdbId?: number; mediaType?: string };

    if (!body.tmdbId || !body.mediaType) {
      return NextResponse.json(
        { error: 'tmdbId and mediaType are required' },
        { status: 400 },
      );
    }

    if (body.mediaType !== 'movie' && body.mediaType !== 'tv') {
      return NextResponse.json(
        { error: 'mediaType must be "movie" or "tv"' },
        { status: 400 },
      );
    }

    // Verify watchlist belongs to profile
    const repo = getWatchlistRepository();
    const watchlists = await repo.getUserWatchlists(profileId);
    const watchlist = watchlists.find(w => w.id === watchlistId);

    if (!watchlist) {
      return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    }

    await repo.removeItem(watchlistId, body.tmdbId, body.mediaType);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Watchlists] Error removing item:', error);
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
  }
}
