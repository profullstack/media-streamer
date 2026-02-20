/**
 * Library Favorites API Route
 *
 * GET - Get user's favorites
 * POST - Add file to favorites
 * DELETE - Remove file from favorites
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLibraryRepository } from '@/lib/library';
import { getCurrentProfileIdWithFallback } from '@/lib/profiles';
import type { Favorite } from '@/lib/library';

/**
 * Favorites response
 */
interface FavoritesResponse {
  favorites: Favorite[];
}

/**
 * Single favorite response
 */
interface FavoriteResponse {
  favorite: Favorite;
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
 * Check favorite response
 */
interface CheckFavoriteResponse {
  isFavorited: boolean;
}

/**
 * GET /api/library/favorites
 *
 * Get current user's favorites, or check if a specific file is favorited
 * Query params:
 *   - fileId: Check if this specific file is favorited (returns { isFavorited: boolean })
 */
export async function GET(
  request: Request
): Promise<NextResponse<FavoritesResponse | CheckFavoriteResponse | ErrorResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check for fileId query param
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    const libraryRepo = getLibraryRepository();

    // If fileId is provided, check if that specific file is favorited
    if (fileId) {
      const profileId = await getCurrentProfileIdWithFallback();
      if (!profileId) {
        return NextResponse.json({ error: 'No active profile' }, { status: 400 });
      }
      const isFavorited = await libraryRepo.isFavorite(profileId, fileId);
      return NextResponse.json(
        { isFavorited },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    // Otherwise, get all favorites
    const profileId2 = await getCurrentProfileIdWithFallback();
    if (!profileId2) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    const favorites = await libraryRepo.getUserFavorites(profileId2);

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
    console.error('Favorites fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch favorites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/favorites
 *
 * Add a file to favorites
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
    const body = (await request.json()) as { fileId?: string };
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

    // Add to favorites
    const libraryRepo = getLibraryRepository();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    const favorite = await libraryRepo.addFavorite(profileId, fileId);

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    console.error('Add favorite error:', error);

    if (error instanceof Error && error.message === 'File already in favorites') {
      return NextResponse.json(
        { error: 'File already in favorites' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add favorite' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/favorites
 *
 * Remove a file from favorites
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
    const body = (await request.json()) as { fileId?: string };
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

    // Remove from favorites
    const libraryRepo = getLibraryRepository();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    await libraryRepo.removeFavorite(profileId, fileId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Remove favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
