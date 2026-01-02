/**
 * Auth Module
 *
 * Server-side authentication utilities for Supabase Auth
 */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';

const scryptAsync = promisify(scrypt);

/**
 * Cookie name for auth token (must match login route)
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription tier - no free tier, users start with trial
 */
export type SubscriptionTier = 'trial' | 'premium' | 'family';

/**
 * Auth error codes
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

/**
 * Feature names
 */
export type FeatureName = 'streaming' | 'download' | 'watchParty' | 'familyMembers';

/**
 * Auth error
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

/**
 * Auth user (from Supabase)
 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

/**
 * User profile
 */
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session token
 */
export interface SessionToken {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  error?: AuthErrorCode;
}

/**
 * Subscription features
 */
export interface SubscriptionFeatures {
  maxStreams: number;
  downloadEnabled: boolean;
  watchPartyEnabled: boolean;
  maxFamilyMembers: number;
}

/**
 * Create user profile options
 */
export interface CreateUserProfileOptions {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  subscriptionTier?: SubscriptionTier;
}

/**
 * Update user profile options
 */
export interface UpdateUserProfileOptions {
  name?: string;
  avatarUrl?: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionExpiresAt?: Date;
}

/**
 * User response (safe for client)
 */
export interface UserResponse {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt?: Date;
  createdAt: Date;
}

// ============================================================================
// Constants
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const TOKEN_EXPIRY_HOURS = 24 * 7; // 7 days
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Subscription tier features - trial has same features as premium
 */
const TIER_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  trial: {
    maxStreams: 3,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 0,
  },
  premium: {
    maxStreams: 3,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 0,
  },
  family: {
    maxStreams: 5,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 10,
  },
};

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();
  if (trimmed !== email) {
    return false; // Has leading/trailing spaces
  }

  return EMAIL_REGEX.test(email);
}

// ============================================================================
// Password Validation & Hashing
// ============================================================================

/**
 * Validate password strength
 */
export function validatePassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }

  // Must have at least one uppercase
  if (!/[A-Z]/.test(password)) {
    return false;
  }

  // Must have at least one lowercase
  if (!/[a-z]/.test(password)) {
    return false;
  }

  // Must have at least one number
  if (!/[0-9]/.test(password)) {
    return false;
  }

  return true;
}

/**
 * Hash password using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  const keyBuffer = Buffer.from(key, 'hex');
  return timingSafeEqual(derivedKey, keyBuffer);
}

// ============================================================================
// Session Token
// ============================================================================

/**
 * Generate session token
 */
export function generateSessionToken(userId: string): SessionToken {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  return {
    token,
    userId,
    expiresAt,
    createdAt: now,
  };
}

/**
 * Validate session token
 */
export function validateSessionToken(token: SessionToken): TokenValidationResult {
  const now = new Date();

  if (token.expiresAt < now) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  return { valid: true, userId: token.userId };
}

// ============================================================================
// User Profile
// ============================================================================

/**
 * Create user profile - new users start with trial
 */
export function createUserProfile(options: CreateUserProfileOptions): UserProfile {
  const now = new Date();

  return {
    id: options.id,
    email: options.email,
    name: options.name,
    avatarUrl: options.avatarUrl,
    subscriptionTier: options.subscriptionTier ?? 'trial',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update user profile
 */
export function updateUserProfile(
  profile: UserProfile,
  updates: UpdateUserProfileOptions
): UserProfile {
  return {
    ...profile,
    ...updates,
    updatedAt: new Date(),
  };
}

/**
 * Get user by ID (mock - actual implementation uses Supabase)
 */
export function getUserById(id: string): UserProfile | null {
  // This is a mock - actual implementation would query Supabase
  void id;
  return null;
}

/**
 * Get user by email (mock - actual implementation uses Supabase)
 */
export function getUserByEmail(email: string): UserProfile | null {
  // This is a mock - actual implementation would query Supabase
  void email;
  return null;
}

/**
 * Format user response (safe for client)
 */
export function formatUserResponse(profile: UserProfile): UserResponse {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    subscriptionTier: profile.subscriptionTier,
    subscriptionExpiresAt: profile.subscriptionExpiresAt,
    createdAt: profile.createdAt,
  };
}

// ============================================================================
// Subscription
// ============================================================================

/**
 * Check if subscription tier is valid
 */
export function isValidSubscriptionTier(tier: string): tier is SubscriptionTier {
  return tier === 'trial' || tier === 'premium' || tier === 'family';
}

/**
 * Get features for subscription tier
 */
export function getSubscriptionFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  return TIER_FEATURES[tier];
}

/**
 * Check if user can access feature
 */
export function canAccessFeature(tier: SubscriptionTier, feature: FeatureName): boolean {
  const features = getSubscriptionFeatures(tier);

  switch (feature) {
    case 'streaming':
      return true; // All tiers can stream
    case 'download':
      return features.downloadEnabled;
    case 'watchParty':
      return features.watchPartyEnabled;
    case 'familyMembers':
      return features.maxFamilyMembers > 0;
    default:
      return false;
  }
}

/**
 * Session token structure stored in cookie
 */
interface StoredSession {
  access_token: string;
  refresh_token: string;
}

/**
 * Get current user from session cookie
 * Validates the session with Supabase and returns user info
 * Returns null if not authenticated or session is invalid
 *
 * Server-side only - uses Next.js cookies() API
 */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  try {
    // Get the auth cookie
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(AUTH_COOKIE_NAME);

    if (!authCookie?.value) {
      return null;
    }

    // Parse the session from cookie
    let session: StoredSession;
    try {
      session = JSON.parse(decodeURIComponent(authCookie.value)) as StoredSession;
    } catch {
      console.error('[Auth] Failed to parse auth cookie');
      return null;
    }

    if (!session.access_token) {
      return null;
    }

    // Create Supabase client and get user from token
    const supabase = createServerClient();

    // Get user from the access token
    const { data, error } = await supabase.auth.getUser(session.access_token);

    if (error) {
      console.error('[Auth] Failed to get user from token:', error.message);
      return null;
    }

    if (!data.user || !data.user.email) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email,
    };
  } catch (error) {
    console.error('[Auth] Error getting current user:', error);
    return null;
  }
}
