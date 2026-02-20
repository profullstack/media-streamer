/**
 * Library Collections API Route
 *
 * GET - Get user's collections
 * POST - Create a new collection
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLibraryRepository } from '@/lib/library';
import { getCurrentProfileIdWithFallback } from '@/lib/profiles';
import type { Collection, CollectionType } from '@/lib/library';

/**
 * Valid collection types
 */
const VALID_COLLECTION_TYPES: CollectionType[] = [
  'playlist',
  'watchlist',
  'reading_list',
  'mixed',
];

/**
 * Collections response
 */
interface CollectionsResponse {
  collections: Collection[];
}

/**
 * Single collection response
 */
interface CollectionResponse {
  collection: Collection;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/library/collections
 *
 * Get current user's collections
 */
export async function GET(): Promise<
  NextResponse<CollectionsResponse | ErrorResponse>
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

    // Get collections
    const libraryRepo = getLibraryRepository();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    const collections = await libraryRepo.getUserCollections(profileId);

    return NextResponse.json(
      { collections },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Collections fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/library/collections
 *
 * Create a new collection
 */
export async function POST(
  request: Request
): Promise<NextResponse<CollectionResponse | ErrorResponse>> {
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
    const body = (await request.json()) as {
      name?: string;
      type?: string;
    };
    const { name, type = 'mixed' } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Validate collection type
    if (!VALID_COLLECTION_TYPES.includes(type as CollectionType)) {
      return NextResponse.json(
        { error: 'Invalid collection type' },
        { status: 400 }
      );
    }

    // Create collection
    const libraryRepo = getLibraryRepository();
    const profileId = await getCurrentProfileIdWithFallback();
    if (!profileId) {
      return NextResponse.json({ error: 'No active profile' }, { status: 400 });
    }
    const collection = await libraryRepo.createCollection(
      profileId,
      name,
      type as CollectionType
    );

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error('Create collection error:', error);
    return NextResponse.json(
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}
