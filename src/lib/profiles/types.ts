/**
 * Profile Types
 *
 * Types for Netflix-style profiles system
 */

export interface Profile {
  id: string;
  account_id: string;
  name: string;
  avatar_url?: string | null;
  avatar_emoji?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileInput {
  account_id: string;
  name: string;
  avatar_url?: string | null;
  avatar_emoji?: string | null;
}

export interface UpdateProfileInput {
  name?: string;
  avatar_url?: string | null;
  avatar_emoji?: string | null;
}

export interface ProfileWithStats extends Profile {
  favorite_count?: number;
  comment_count?: number;
}