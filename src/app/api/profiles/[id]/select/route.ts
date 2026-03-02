/**
 * Profile Selection API Route
 *
 * POST - Set active profile in session/cookie
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getProfilesService } from '@/lib/profiles';
import { cookies } from 'next/headers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Success response
 */
interface SuccessResponse {
  success: boolean;
  profileId: string;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * POST /api/profiles/[id]/select
 *
 * Set active profile for the session
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { id: profileId } = await params;

    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify the profile exists and belongs to this user
    const profilesService = getProfilesService();
    const profiles = await profilesService.getAccountProfiles(user.id);
    const profile = profiles.find(p => p.id === profileId);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found or does not belong to you' },
        { status: 404 }
      );
    }

    // Set the profile ID in a cookie
    const cookieStore = await cookies();
    cookieStore.set('x-profile-id', profileId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return NextResponse.json(
      { success: true, profileId },
      { status: 200 }
    );
  } catch (error) {
    console.error('Select profile error:', error);
    return NextResponse.json(
      { error: 'Failed to select profile' },
      { status: 500 }
    );
  }
}