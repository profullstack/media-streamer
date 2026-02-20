/**
 * Profile Utilities
 *
 * Helper functions for profile management, especially server-side
 */

import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { getProfilesService } from './profiles-service';
import type { Profile } from './types';

/**
 * Get the current profile ID from the cookie
 * 
 * @returns Profile ID string or null if not set
 */
export async function getCurrentProfileId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const profileCookie = cookieStore.get('x-profile-id');
    return profileCookie?.value || null;
  } catch (error) {
    // cookies() can fail in some contexts (e.g., static generation)
    return null;
  }
}

/**
 * Get the current active profile for the authenticated user
 * 
 * @returns Profile object or null if not found
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const profileId = await getCurrentProfileId();
    if (!profileId) {
      // No profile selected, get default profile
      const profilesService = getProfilesService();
      return await profilesService.getDefaultProfile(user.id);
    }

    // Verify the profile exists and belongs to this user
    const profilesService = getProfilesService();
    return await profilesService.getProfileById(user.id, profileId);
  } catch (error) {
    console.error('Failed to get current profile:', error);
    return null;
  }
}

/**
 * Get the current profile ID or fallback to default profile ID
 * 
 * @returns Profile ID string or null if no profiles exist
 */
export async function getCurrentProfileIdWithFallback(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const profileId = await getCurrentProfileId();
    if (profileId) {
      // Verify the profile exists and belongs to this user
      const profilesService = getProfilesService();
      const profile = await profilesService.getProfileById(user.id, profileId);
      if (profile) return profileId;
    }

    // Fallback to default profile
    const profilesService = getProfilesService();
    const defaultProfile = await profilesService.getDefaultProfile(user.id);
    return defaultProfile?.id || null;
  } catch (error) {
    console.error('Failed to get current profile ID:', error);
    return null;
  }
}