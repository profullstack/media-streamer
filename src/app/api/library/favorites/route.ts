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
 * GET /api/library/favorites
 *
 * Get current user's favorites
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
    const libraryRepo = getLibraryRepository();
    const favorites = await libraryRepo.getUserFavorites(user.id);

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
    const favorite = await libraryRepo.addFavorite(user.id, fileId);

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
    await libraryRepo.removeFavorite(user.id, fileId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Remove favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
