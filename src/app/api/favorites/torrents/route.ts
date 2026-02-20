/**
 * Torrent Favorites API Route
 *
 * GET - Get user's torrent favorites
 * POST - Add torrent to favorites
 * DELETE - Remove torrent from favorites
 *
 * Server-side only - maintains Supabase security rules.
 *
 * NOTE: Only user-submitted torrents can be favorited.
 * DHT torrents must be added to the library first.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCurrentProfileIdWithFallback } from '@/lib/profiles';
import { getFavoritesService } from '@/lib/favorites';
import { getTorrentById, getTorrentByInfohash } from '@/lib/supabase/queries';
import type { TorrentFavoriteWithDetails } from '@/lib/favorites';
import type { TorrentFavorite } from '@/lib/supabase/types';

/**
 * Check if a string is a valid UUID v4
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if a string is a valid infohash (40 hex characters)
 */
function isInfohash(str: string): boolean {
  const infohashRegex = /^[0-9a-f]{40}$/i;
  return infohashRegex.test(str);
}

/**
 * Verify the torrent exists in bt_torrents and get its UUID
 * Returns null if it's a DHT torrent or doesn't exist
 */
async function getUserTorrentId(id: string): Promise<string | null> {
  if (isUUID(id)) {
    const torrent = await getTorrentById(id);
    return torrent?.id ?? null;
  }

  if (isInfohash(id)) {
    const torrent = await getTorrentByInfohash(id);
    return torrent?.id ?? null;
  }

  const torrent = await getTorrentByInfohash(id);
  return torrent?.id ?? null;
}

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

    // Get current profile
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json(
        { error: 'No profile selected' },
        { status: 400 }
      );
    }

    // Get favorites for the profile
    const favoritesService = getFavoritesService();
    const favorites = await favoritesService.getTorrentFavorites(profileId);

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
 *
 * NOTE: Only user-submitted torrents can be favorited.
 * DHT torrents must be added to the library first.
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
    const { torrentId: torrentIdParam } = body;

    if (!torrentIdParam) {
      return NextResponse.json(
        { error: 'torrentId is required' },
        { status: 400 }
      );
    }

    // Get the user torrent ID (null if DHT torrent)
    const torrentId = await getUserTorrentId(torrentIdParam);

    if (!torrentId) {
      return NextResponse.json(
        { error: 'Cannot favorite DHT torrents. Add the torrent to your library first.' },
        { status: 400 }
      );
    }

    // Add to favorites
    const favoritesService = getFavoritesService();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    const favorite = await favoritesService.addTorrentFavorite(profileId, torrentId);

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
    const { torrentId: torrentIdParam } = body;

    if (!torrentIdParam) {
      return NextResponse.json(
        { error: 'torrentId is required' },
        { status: 400 }
      );
    }

    // Get the user torrent ID (null if DHT torrent)
    const torrentId = await getUserTorrentId(torrentIdParam);

    if (!torrentId) {
      // DHT torrents can't be favorited, so nothing to remove
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Remove from favorites
    const favoritesService = getFavoritesService();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    await favoritesService.removeTorrentFavorite(profileId, torrentId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Remove torrent favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove torrent favorite' },
      { status: 500 }
    );
  }
}
