/**
 * Individual Profile API Route
 *
 * PATCH - Update profile name/avatar
 * DELETE - Delete profile (can't delete last/default)
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getCurrentUserWithSubscription } from '@/lib/auth';
import { getProfilesService } from '@/lib/profiles';
import type { Profile, UpdateProfileInput } from '@/lib/profiles/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Single profile response
 */
interface ProfileResponse {
  profile: Profile;
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
 * Request body for updating a profile
 */
interface UpdateProfileBody {
  name?: string;
  avatar_url?: string;
  avatar_emoji?: string;
  is_default?: boolean;
}

/**
 * PATCH /api/profiles/[id]
 *
 * Update profile name and/or avatar
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ProfileResponse | ErrorResponse>> {
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

    // Parse request body
    const body = (await request.json()) as UpdateProfileBody;
    const { name, avatar_url, avatar_emoji, is_default } = body;

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Profile name cannot be empty' },
          { status: 400 }
        );
      }
      if (name.length > 50) {
        return NextResponse.json(
          { error: 'Profile name must be 50 characters or less' },
          { status: 400 }
        );
      }
    }

    // Build update input
    const input: UpdateProfileInput = {};
    if (name !== undefined) input.name = name.trim();
    if (avatar_url !== undefined) input.avatar_url = avatar_url;
    if (avatar_emoji !== undefined) input.avatar_emoji = avatar_emoji;

    const profilesService = getProfilesService();

    // Handle is_default toggle
    if (is_default === true) {
      const profile = await profilesService.setDefaultProfile(user.id, profileId);
      return NextResponse.json({ profile }, { status: 200 });
    }
    if (is_default === false) {
      // Clear default flag — no profile will be default (selector always shown)
      await profilesService.clearDefaultProfile(user.id, profileId);
      const profile = await profilesService.getProfileById(user.id, profileId);
      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ profile }, { status: 200 });
    }

    // Nothing to update
    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Update profile
    const profile = await profilesService.updateProfile(user.id, profileId, input);

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    console.error('Update profile error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Profile not found')) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }
      if (error.message.includes('duplicate key')) {
        return NextResponse.json(
          { error: 'A profile with this name already exists' },
          { status: 409 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'You can only update your own profiles' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/profiles/[id]
 *
 * Delete a profile (can't delete the last one; default auto-promotes)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { id: profileId } = await params;

    // Check authentication and get subscription info
    const user = await getCurrentUserWithSubscription();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check subscription tier - only family tier can delete additional profiles
    if (user.subscription_tier !== 'family') {
      return NextResponse.json(
        { error: 'Profile management is only available on the Family plan' },
        { status: 403 }
      );
    }

    // Delete profile
    const profilesService = getProfilesService();
    await profilesService.deleteProfile(user.id, profileId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete profile error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Profile not found')) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }
      if (error.message.includes('Cannot delete last profile')) {
        return NextResponse.json(
          { error: 'Cannot delete the last profile. Create another profile first.' },
          { status: 400 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'You can only delete your own profiles' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
}