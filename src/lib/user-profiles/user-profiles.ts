/**
 * User Profile Service
 *
 * Server-side service for managing user profiles with unique usernames.
 * All Supabase operations are performed server-side only.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
  PublicUserProfile,
} from '@/lib/supabase/types';

/**
 * Reserved usernames that cannot be used
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'info',
  'contact',
  'api',
  'www',
  'mail',
  'ftp',
  'localhost',
  'null',
  'undefined',
  'anonymous',
  'user',
  'users',
  'profile',
  'profiles',
  'settings',
  'account',
  'accounts',
  'login',
  'logout',
  'signup',
  'register',
  'auth',
  'oauth',
  'callback',
  'webhook',
  'static',
  'assets',
  'public',
  'private',
  'internal',
]);

/**
 * Username validation regex
 * - Must start with a letter
 * - Can contain letters, numbers, underscores, and hyphens
 * - 3-30 characters long
 */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{2,29}$/;

/**
 * User Profile Service
 *
 * Manages user profiles with unique usernames.
 */
export class UserProfileService {
  private getSupabase() {
    return createServerClient();
  }

  /**
   * Validate username format
   *
   * @param username - Username to validate
   * @returns True if valid, false otherwise
   */
  validateUsername(username: string): boolean {
    return USERNAME_REGEX.test(username);
  }

  /**
   * Check if username is reserved
   *
   * @param username - Username to check
   * @returns True if reserved, false otherwise
   */
  isReservedUsername(username: string): boolean {
    return RESERVED_USERNAMES.has(username.toLowerCase());
  }

  /**
   * Get profile by user ID
   *
   * @param userId - User ID
   * @returns User profile or null if not found
   */
  async getProfileByUserId(userId: string): Promise<UserProfile | null> {
    const supabase = this.getSupabase();
    
    // Use type assertion since user_profiles table isn't in generated types yet
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            single: () => Promise<{ data: UserProfile | null; error: { code?: string; message: string } | null }>;
          };
        };
      };
    }).from('user_profiles')
      .select('*')
      .eq('user_id', userId)
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
   * Get profile by username (case-insensitive)
   *
   * @param username - Username to look up
   * @returns User profile or null if not found
   */
  async getProfileByUsername(username: string): Promise<UserProfile | null> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          ilike: (column: string, value: string) => {
            eq: (column: string, value: boolean) => {
              single: () => Promise<{ data: UserProfile | null; error: { code?: string; message: string } | null }>;
            };
          };
        };
      };
    }).from('user_profiles')
      .select('*')
      .ilike('username', username)
      .eq('is_public', true)
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
   * Check if username is available
   *
   * @param username - Username to check
   * @returns True if available, false if taken
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: { check_username: string }) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    }).rpc('check_username_available', {
      check_username: username,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data as boolean;
  }

  /**
   * Create a new user profile
   *
   * @param input - Profile data
   * @returns Created profile
   * @throws Error if username is invalid, reserved, or taken
   */
  async createProfile(input: UserProfileInsert): Promise<UserProfile> {
    // Validate username format
    if (!this.validateUsername(input.username)) {
      throw new Error('Invalid username format');
    }

    // Check if username is reserved
    if (this.isReservedUsername(input.username)) {
      throw new Error('Username is reserved');
    }

    // Check if username is available
    const isAvailable = await this.isUsernameAvailable(input.username);
    if (!isAvailable) {
      throw new Error('Username is already taken');
    }

    // Create profile
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        insert: (data: UserProfileInsert) => {
          select: () => {
            single: () => Promise<{ data: UserProfile | null; error: { message: string } | null }>;
          };
        };
      };
    }).from('user_profiles')
      .insert(input)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as UserProfile;
  }

  /**
   * Update user profile
   *
   * @param userId - User ID
   * @param update - Profile updates
   * @returns Updated profile
   * @throws Error if username is invalid, reserved, or taken
   */
  async updateProfile(userId: string, update: UserProfileUpdate): Promise<UserProfile> {
    // If updating username, validate it
    if (update.username) {
      if (!this.validateUsername(update.username)) {
        throw new Error('Invalid username format');
      }

      if (this.isReservedUsername(update.username)) {
        throw new Error('Username is reserved');
      }

      const isAvailable = await this.isUsernameAvailable(update.username);
      if (!isAvailable) {
        throw new Error('Username is already taken');
      }
    }

    // Update profile
    const supabase = this.getSupabase();
    
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        update: (data: UserProfileUpdate) => {
          eq: (column: string, value: string) => {
            select: () => {
              single: () => Promise<{ data: UserProfile | null; error: { message: string } | null }>;
            };
          };
        };
      };
    }).from('user_profiles')
      .update(update)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as UserProfile;
  }

  /**
   * Get public profile by username
   *
   * Returns only public information, excludes user_id and private fields.
   *
   * @param username - Username to look up
   * @returns Public profile or null if not found or private
   */
  async getPublicProfile(username: string): Promise<PublicUserProfile | null> {
    const profile = await this.getProfileByUsername(username);

    if (!profile || !profile.is_public) {
      return null;
    }

    // Return only public fields
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
      comment_count: profile.comment_count,
      favorite_count: profile.favorite_count,
      created_at: profile.created_at,
    };
  }

  /**
   * Delete user profile
   *
   * @param userId - User ID
   */
  async deleteProfile(userId: string): Promise<void> {
    const supabase = this.getSupabase();
    
    const { error } = await (supabase as unknown as {
      from: (table: string) => {
        delete: () => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    }).from('user_profiles')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

// Singleton instance
let userProfileServiceInstance: UserProfileService | null = null;

/**
 * Get the UserProfileService singleton instance
 */
export function getUserProfileService(): UserProfileService {
  if (!userProfileServiceInstance) {
    userProfileServiceInstance = new UserProfileService();
  }
  return userProfileServiceInstance;
}
