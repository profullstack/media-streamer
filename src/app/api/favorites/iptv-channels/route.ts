/**
 * IPTV Channel Favorites API Route
 *
 * GET - Get user's IPTV channel favorites
 * POST - Add IPTV channel to favorites
 * DELETE - Remove IPTV channel from favorites
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFavoritesService } from '@/lib/favorites';
import type { IptvChannelFavoriteWithDetails, AddIptvChannelFavoriteInput } from '@/lib/favorites';
import type { IptvChannelFavorite } from '@/lib/supabase/types';

/**
 * Favorites response
 */
interface FavoritesResponse {
  favorites: IptvChannelFavoriteWithDetails[] | IptvChannelFavorite[];
}

/**
 * Single favorite response
 */
interface FavoriteResponse {
  favorite: IptvChannelFavorite;
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
 * Request body for adding IPTV channel favorite
 */
interface AddChannelFavoriteBody {
  playlistId?: string;
  channelId?: string;
  channelName?: string;
  channelUrl?: string;
  channelLogo?: string;
  channelGroup?: string;
  tvgId?: string;
  tvgName?: string;
}

/**
 * Request body for removing IPTV channel favorite
 */
interface RemoveChannelFavoriteBody {
  playlistId?: string;
  channelId?: string;
}

/**
 * GET /api/favorites/iptv-channels
 *
 * Get current user's IPTV channel favorites
 * Query params:
 * - playlistId (optional): Filter by playlist ID
 */
export async function GET(
  request: Request
): Promise<NextResponse<FavoritesResponse | ErrorResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('playlistId');

    // Get favorites
    const favoritesService = getFavoritesService();
    
    let favorites: IptvChannelFavoriteWithDetails[] | IptvChannelFavorite[];
    if (playlistId) {
      favorites = await favoritesService.getIptvChannelFavoritesByPlaylist(
        user.id,
        playlistId
      );
    } else {
      favorites = await favoritesService.getIptvChannelFavorites(user.id);
    }

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
    console.error('IPTV channel favorites fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IPTV channel favorites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/favorites/iptv-channels
 *
 * Add an IPTV channel to favorites
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
    const body = (await request.json()) as AddChannelFavoriteBody;
    const {
      playlistId,
      channelId,
      channelName,
      channelUrl,
      channelLogo,
      channelGroup,
      tvgId,
      tvgName,
    } = body;

    // Validate required fields
    if (!playlistId || !channelId || !channelName || !channelUrl) {
      return NextResponse.json(
        { error: 'playlistId, channelId, channelName, and channelUrl are required' },
        { status: 400 }
      );
    }

    // Build input
    const input: AddIptvChannelFavoriteInput = {
      playlistId,
      channelId,
      channelName,
      channelUrl,
      channelLogo,
      channelGroup,
      tvgId,
      tvgName,
    };

    // Add to favorites
    const favoritesService = getFavoritesService();
    const favorite = await favoritesService.addIptvChannelFavorite(user.id, input);

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    console.error('Add IPTV channel favorite error:', error);

    if (error instanceof Error && error.message === 'Channel already in favorites') {
      return NextResponse.json(
        { error: 'Channel already in favorites' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add IPTV channel favorite' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/favorites/iptv-channels
 *
 * Remove an IPTV channel from favorites
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
    const body = (await request.json()) as RemoveChannelFavoriteBody;
    const { playlistId, channelId } = body;

    if (!playlistId || !channelId) {
      return NextResponse.json(
        { error: 'playlistId and channelId are required' },
        { status: 400 }
      );
    }

    // Remove from favorites
    const favoritesService = getFavoritesService();
    await favoritesService.removeIptvChannelFavorite(user.id, playlistId, channelId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Remove IPTV channel favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove IPTV channel favorite' },
      { status: 500 }
    );
  }
}
