/**
 * Radio Favorites API Route
 *
 * GET /api/radio/favorites - Get user's favorite stations
 * POST /api/radio/favorites - Add a station to favorites
 * DELETE /api/radio/favorites - Remove a station from favorites
 *
 * All endpoints require authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRadioService } from '@/lib/radio';
import { getActiveProfileId } from '@/lib/profiles';
import type { RadioStation } from '@/lib/radio';

interface AddFavoriteRequest {
  stationId: string;
  stationName: string;
  stationImageUrl?: string | null;
  stationGenre?: string | null;
}

function isAddFavoriteRequest(body: unknown): body is AddFavoriteRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.stationId === 'string' &&
    typeof obj.stationName === 'string' &&
    (obj.stationImageUrl === undefined || obj.stationImageUrl === null || typeof obj.stationImageUrl === 'string') &&
    (obj.stationGenre === undefined || obj.stationGenre === null || typeof obj.stationGenre === 'string')
  );
}

/**
 * GET /api/radio/favorites
 *
 * Get user's favorite radio stations. Requires authentication.
 *
 * Query parameters:
 * - stationId: Optional station ID to check if favorited
 */
export async function GET(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getActiveProfileId();

  if (!profileId) {

    return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  }

  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');

  try {
    const service = getRadioService();

    // If stationId is provided, check if it's favorited
    if (stationId) {
      const isFavorited = await service.isFavorite(profileId, stationId);
      return NextResponse.json({ isFavorited });
    }

    // Otherwise, return all favorites
    const favorites = await service.getUserFavorites(profileId);

    return NextResponse.json({
      favorites,
      total: favorites.length,
    });
  } catch (error) {
    console.error('[Radio API] Get favorites error:', error);
    return NextResponse.json(
      { error: 'Failed to get favorites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/radio/favorites
 *
 * Add a station to favorites. Requires authentication.
 *
 * Request body:
 * - stationId: Station ID (required)
 * - stationName: Station name (required)
 * - stationImageUrl: Station image URL (optional)
 * - stationGenre: Station genre (optional)
 */
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getActiveProfileId();

  if (!profileId) {

    return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!isAddFavoriteRequest(body)) {
    return NextResponse.json(
      { error: 'Invalid request body. Required: stationId, stationName' },
      { status: 400 }
    );
  }

  try {
    const service = getRadioService();

    // Convert request to RadioStation format
    const station: RadioStation = {
      id: body.stationId,
      name: body.stationName,
      imageUrl: body.stationImageUrl ?? undefined,
      genre: body.stationGenre ?? undefined,
    };

    const favorite = await service.addToFavorites(profileId, station);

    return NextResponse.json(
      { favorite },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Radio API] Add favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to add favorite' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/radio/favorites
 *
 * Remove a station from favorites. Requires authentication.
 *
 * Request body:
 * - stationId: Station ID to remove (required)
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getActiveProfileId();

  if (!profileId) {

    return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (typeof body !== 'object' || body === null || !('stationId' in body) || typeof (body as Record<string, unknown>).stationId !== 'string') {
    return NextResponse.json(
      { error: 'Invalid request body. Required: stationId' },
      { status: 400 }
    );
  }

  const { stationId } = body as { stationId: string };

  try {
    const service = getRadioService();
    await service.removeFromFavorites(profileId, stationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Radio API] Remove favorite error:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
