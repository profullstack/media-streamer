/**
 * Auth Module
 *
 * Server-side authentication utilities for Supabase Auth
 */

export {
  // Types
  type SubscriptionTier,
  type AuthErrorCode,
  type FeatureName,
  type AuthError,
  type AuthUser,
  type UserProfile,
  type SessionToken,
  type TokenValidationResult,
  type SubscriptionFeatures,
  type CreateUserProfileOptions,
  type UpdateUserProfileOptions,
  type UserResponse,
  
  // Email Validation
  validateEmail,
  
  // Password Validation & Hashing
  validatePassword,
  hashPassword,
  verifyPassword,
  
  // Session Token
  generateSessionToken,
  validateSessionToken,
  
  // User Profile
  createUserProfile,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  formatUserResponse,
  
  // Subscription
  isValidSubscriptionTier,
  getSubscriptionFeatures,
  canAccessFeature,
  
  // Current User
  getCurrentUser,
} from './auth';
