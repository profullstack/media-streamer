/**
 * Torrent Favorites API Route
 *
 * GET - Get user's torrent favorites
 * POST - Add torrent to favorites
 * DELETE - Remove torrent from favorites
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFavoritesService } from '@/lib/favorites';
import type { TorrentFavoriteWithDetails } from '@/lib/favorites';
import type { TorrentFavorite } from '@/lib/supabase/types';

/**
 * Favorites response
 */
interface FavoritesResponse {
  favorites: TorrentFavoriteWithDetails[];
}

/**
 * Single favorite response
 */
interface FavoriteResponse {
  favorite: TorrentFavorite;
}

/**
 * Success response
 */
interface SuccessResponse {
  success: boolean;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/favorites/torrents
 *
 * Get current user's torrent favorites
 */
export async function GET(): Promise<
  NextResponse<FavoritesResponse | ErrorResponse>
> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get favorites
    const favoritesService = getFavoritesService();
    const favorites = await favoritesService.getTorrentFavorites(user.id);

    return NextResponse.json(
      { favorites },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Torrent favorites fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch torrent favorites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/favorites/torrents
 *
 * Add a torrent to favorites
 */
export async function POST(
  request: Request
): Promise<NextResponse<FavoriteResponse | ErrorResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = (await request.json()) as { torrentId?: string };
    const { torrentId } = body;

    if (!torrentId) {
      return NextResponse.json(
        { error: 'torrentId is required' },
        { status: 400 }
      );
    }

    // Add to favorites
    const favoritesService = getFavoritesService();
    const favorite = await favoritesService.addTorrentFavorite(user.id, torrentId);

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    console.error('Add torrent favorite error:', error);

    if (error instanceof Error && error.message === 'Torrent already in favorites') {
      return NextResponse.json(
        { error: 'Torrent already in favorites' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add torrent favorite' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/favorites/torrents
 *
 * Remove a torrent from favorites
 */
export async function DELETE(
  request: Request
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = (await request.json()) as { torrentId?: string };
    const { torrentId } = body;

    if (!torrentId) {
      return NextResponse.json(
        { error: 'torrentId is required' },
        { status: 400 }
      );
    }

    // Remove from favorites
    const favoritesService = getFavoritesService();
    await favoritesService.removeTorrentFavorite(user.id, torrentId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Remove torrent favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove torrent favorite' },
      { status: 500 }
    );
  }
}
