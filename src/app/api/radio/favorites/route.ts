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
import { createServerClient } from '@/lib/supabase';
import { getRadioService } from '@/lib/radio';
import { getCurrentProfileIdWithFallback } from '@/lib/profiles';
import type { RadioStation } from '@/lib/radio';

/**
 * Cookie name for auth token
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

/**
 * Session token structure stored in cookie
 */
interface SessionToken {
  access_token: string;
  refresh_token: string;
}

/**
 * Request body for adding a favorite
 */
interface AddFavoriteRequest {
  stationId: string;
  stationName: string;
  stationImageUrl?: string | null;
  stationGenre?: string | null;
}

/**
 * Type guard for AddFavoriteRequest
 */
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
 * Parse session token from cookie
 */
function parseSessionCookie(cookieValue: string | undefined): SessionToken | null {
  if (!cookieValue) return null;

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'access_token' in parsed &&
      'refresh_token' in parsed &&
      typeof (parsed as SessionToken).access_token === 'string' &&
      typeof (parsed as SessionToken).refresh_token === 'string'
    ) {
      return parsed as SessionToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract user ID from session cookie or Authorization header
 */
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  // First try cookie-based auth (browser)
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionToken = parseSessionCookie(cookieValue);

  if (sessionToken) {
    const supabase = createServerClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: sessionToken.access_token,
      refresh_token: sessionToken.refresh_token,
    });

    if (!sessionError) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user) {
        return user.id;
      }
    }
  }

  // Fall back to Authorization header (for tests and API clients)
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const sessionData = JSON.parse(token) as { access_token?: string };
    if (!sessionData.access_token) {
      return null;
    }

    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(sessionData.access_token);

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch {
    try {
      const supabase = createServerClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      return user.id;
    } catch {
      return null;
    }
  }
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
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getCurrentProfileIdWithFallback();

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
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getCurrentProfileIdWithFallback();

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
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const profileId = await getCurrentProfileIdWithFallback();

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
