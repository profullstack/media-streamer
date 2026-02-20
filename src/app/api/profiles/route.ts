/**
 * Profiles API Route
 *
 * GET - List profiles for current user
 * POST - Create a new profile (max 5 per account)
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getProfilesService } from '@/lib/profiles';
import type { Profile, CreateProfileInput } from '@/lib/profiles/types';

/**
 * Profiles response
 */
interface ProfilesResponse {
  profiles: Profile[];
}

/**
 * Single profile response
 */
interface ProfileResponse {
  profile: Profile;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * Request body for creating a profile
 */
interface CreateProfileBody {
  name?: string;
  avatar_url?: string;
  avatar_emoji?: string;
}

/**
 * GET /api/profiles
 *
 * Get current user's profiles
 */
export async function GET(): Promise<
  NextResponse<ProfilesResponse | ErrorResponse>
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

    // Get profiles
    const profilesService = getProfilesService();
    const profiles = await profilesService.getAccountProfiles(user.id);

    return NextResponse.json(
      { profiles },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Profiles fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profiles
 *
 * Create a new profile (max 5 per account)
 */
export async function POST(
  request: Request
): Promise<NextResponse<ProfileResponse | ErrorResponse>> {
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
    const body = (await request.json()) as CreateProfileBody;
    const { name, avatar_url, avatar_emoji } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }

    // Validate name length
    if (name.length > 50) {
      return NextResponse.json(
        { error: 'Profile name must be 50 characters or less' },
        { status: 400 }
      );
    }

    // Build input
    const input: CreateProfileInput = {
      account_id: user.id,
      name: name.trim(),
      avatar_url,
      avatar_emoji,
    };

    // Create profile
    const profilesService = getProfilesService();
    const profile = await profilesService.createProfile(input);

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error('Create profile error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Maximum 5 profiles')) {
        return NextResponse.json(
          { error: 'Maximum 5 profiles per account allowed' },
          { status: 400 }
        );
      }
      if (error.message.includes('duplicate key')) {
        return NextResponse.json(
          { error: 'A profile with this name already exists' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    );
  }
}