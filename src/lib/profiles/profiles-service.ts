/**
 * Profiles Service
 *
 * Server-side service for managing Netflix-style profiles.
 * All Supabase operations are performed server-side only.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  Profile,
  CreateProfileInput,
  UpdateProfileInput,
} from './types';

/**
 * Profiles Service
 *
 * Manages Netflix-style profiles for accounts.
 */
export class ProfilesService {
  private getSupabase() {
    return createServerClient();
  }

  /**
   * Get all profiles for an account
   *
   * @param accountId - Account ID (auth.users.id)
   * @returns Array of profiles ordered by default first, then creation date
   */
  async getAccountProfiles(accountId: string): Promise<Profile[]> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('account_id', accountId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get default profile for an account
   *
   * @param accountId - Account ID (auth.users.id)
   * @returns Default profile or null if none exists
   */
  async getDefaultProfile(accountId: string): Promise<Profile | null> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get a specific profile by ID
   *
   * @param accountId - Account ID (for security)
   * @param profileId - Profile ID
   * @returns Profile or null if not found
   */
  async getProfileById(accountId: string, profileId: string): Promise<Profile | null> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', profileId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Create a new profile
   *
   * @param input - Profile creation data
   * @returns Created profile
   * @throws Error if max profiles reached or name conflict
   */
  async createProfile(input: CreateProfileInput): Promise<Profile> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .insert(input)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update a profile
   *
   * @param accountId - Account ID (for security)
   * @param profileId - Profile ID
   * @param input - Profile updates
   * @returns Updated profile
   * @throws Error if profile not found or name conflict
   */
  async updateProfile(
    accountId: string,
    profileId: string,
    input: UpdateProfileInput
  ): Promise<Profile> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .update(input)
      .eq('account_id', accountId)
      .eq('id', profileId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Profile not found');
      }
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Delete a profile
   *
   * Cannot delete the last profile. If deleting the default profile,
   * another profile is promoted to default automatically.
   *
   * @param accountId - Account ID (for security)
   * @param profileId - Profile ID
   * @throws Error if profile not found or is last profile
   */
  async deleteProfile(accountId: string, profileId: string): Promise<void> {
    const supabase = this.getSupabase();

    // First check if this profile exists and belongs to the account
    const profile = await this.getProfileById(accountId, profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    // Check if it's the last profile
    const profiles = await this.getAccountProfiles(accountId);
    if (profiles.length <= 1) {
      throw new Error('Cannot delete last profile');
    }

    const { error } = await (supabase as any)
      .from('profiles')
      .delete()
      .eq('account_id', accountId)
      .eq('id', profileId);

    if (error) {
      throw new Error(error.message);
    }

    // If we deleted the default profile, promote the oldest remaining one
    if (profile.is_default) {
      const remaining = profiles.filter(p => p.id !== profileId);
      if (remaining.length > 0) {
        await this.setDefaultProfile(accountId, remaining[0].id);
      }
    }
  }

  /**
   * Set a profile as the default for an account
   *
   * @param accountId - Account ID (for security)
   * @param profileId - Profile ID to set as default
   * @returns Updated profile
   * @throws Error if profile not found
   */
  async setDefaultProfile(accountId: string, profileId: string): Promise<Profile> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as any)
      .from('profiles')
      .update({ is_default: true })
      .eq('account_id', accountId)
      .eq('id', profileId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Profile not found');
      }
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Clear the default flag on a profile.
   * This means the profile selector will always be shown on login.
   */
  async clearDefaultProfile(accountId: string, profileId: string): Promise<void> {
    const supabase = this.getSupabase();

    const { error } = await (supabase as any)
      .from('profiles')
      .update({ is_default: false })
      .eq('account_id', accountId)
      .eq('id', profileId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Ensure an account has at least one profile
   * Creates a default profile if none exists
   *
   * @param accountId - Account ID
   * @param name - Profile name (defaults to "Profile 1")
   * @returns Default profile (existing or newly created)
   */
  async ensureDefaultProfile(accountId: string, name?: string): Promise<Profile> {
    // Check if default profile exists
    let defaultProfile = await this.getDefaultProfile(accountId);
    
    if (!defaultProfile) {
      // Create default profile
      const input: CreateProfileInput = {
        account_id: accountId,
        name: name || 'Profile 1',
        is_default: true,
      } as CreateProfileInput & { is_default: boolean };

      defaultProfile = await this.createProfile(input);
    }

    return defaultProfile;
  }
}

// Singleton instance
let profilesServiceInstance: ProfilesService | null = null;

/**
 * Get the ProfilesService singleton instance
 */
export function getProfilesService(): ProfilesService {
  if (!profilesServiceInstance) {
    profilesServiceInstance = new ProfilesService();
  }
  return profilesServiceInstance;
}