/**
 * Auth Module Tests
 *
 * TDD tests for Supabase Auth integration (server-side only)
 */

import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  validateSessionToken,
  createUserProfile,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  formatUserResponse,
  isValidSubscriptionTier,
  getSubscriptionFeatures,
  canAccessFeature,
  type SessionToken,
  type AuthError,
  type AuthErrorCode,
} from './auth';

describe('Auth Module', () => {
  describe('Email Validation', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('user.name@example.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@.com')).toBe(false);
    });

    it('should reject emails with spaces', () => {
      expect(validateEmail('user @example.com')).toBe(false);
      expect(validateEmail(' user@example.com')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(validateEmail('USER@EXAMPLE.COM')).toBe(true);
    });
  });

  describe('Password Validation', () => {
    it('should validate strong passwords', () => {
      expect(validatePassword('SecurePass123!')).toBe(true);
      expect(validatePassword('MyP@ssw0rd')).toBe(true);
    });

    it('should reject short passwords', () => {
      expect(validatePassword('Short1!')).toBe(false);
      expect(validatePassword('Ab1!')).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      expect(validatePassword('SecurePassword!')).toBe(false);
    });

    it('should reject passwords without uppercase', () => {
      expect(validatePassword('securepass123!')).toBe(false);
    });

    it('should reject passwords without lowercase', () => {
      expect(validatePassword('SECUREPASS123!')).toBe(false);
    });

    it('should reject empty passwords', () => {
      expect(validatePassword('')).toBe(false);
    });
  });

  describe('Password Hashing', () => {
    it('should hash password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'SecurePass123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('Session Token', () => {
    it('should generate session token', () => {
      const token = generateSessionToken('user-123');

      expect(token.token).toBeDefined();
      expect(token.userId).toBe('user-123');
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique tokens', () => {
      const token1 = generateSessionToken('user-123');
      const token2 = generateSessionToken('user-123');

      expect(token1.token).not.toBe(token2.token);
    });

    it('should set expiration in the future', () => {
      const token = generateSessionToken('user-123');
      const now = new Date();

      expect(token.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should validate valid token', () => {
      const token = generateSessionToken('user-123');
      const result = validateSessionToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('should reject expired token', () => {
      const token: SessionToken = {
        token: 'test-token',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 1000), // Expired
        createdAt: new Date(Date.now() - 86400000),
      };

      const result = validateSessionToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });
  });

  describe('User Profile', () => {
    it('should create user profile', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        name: 'John Doe',
      });

      expect(profile.id).toBe('user-123');
      expect(profile.email).toBe('user@example.com');
      expect(profile.name).toBe('John Doe');
      expect(profile.subscriptionTier).toBe('trial');
      expect(profile.createdAt).toBeInstanceOf(Date);
    });

    it('should create profile with custom subscription tier', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        subscriptionTier: 'premium',
      });

      expect(profile.subscriptionTier).toBe('premium');
    });

    it('should update user profile', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
      });

      const updated = updateUserProfile(profile, {
        name: 'Jane Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      expect(updated.name).toBe('Jane Doe');
      expect(updated.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('should not modify original profile on update', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        name: 'Original',
      });

      updateUserProfile(profile, { name: 'Updated' });

      expect(profile.name).toBe('Original');
    });
  });

  describe('User Lookup', () => {
    it('should get user by ID', () => {
      const user = getUserById('user-123');
      
      // Returns null for non-existent user (mock)
      expect(user).toBeNull();
    });

    it('should get user by email', () => {
      const user = getUserByEmail('user@example.com');
      
      // Returns null for non-existent user (mock)
      expect(user).toBeNull();
    });
  });

  describe('User Response Formatting', () => {
    it('should format user response without sensitive data', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        name: 'John Doe',
      });

      const response = formatUserResponse(profile);

      expect(response.id).toBe('user-123');
      expect(response.email).toBe('user@example.com');
      expect(response.name).toBe('John Doe');
      expect(response).not.toHaveProperty('passwordHash');
    });

    it('should include subscription info', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        subscriptionTier: 'premium',
      });

      const response = formatUserResponse(profile);

      expect(response.subscriptionTier).toBe('premium');
    });
  });

  describe('Subscription Tiers', () => {
    it('should validate subscription tiers', () => {
      expect(isValidSubscriptionTier('trial')).toBe(true);
      expect(isValidSubscriptionTier('premium')).toBe(true);
      expect(isValidSubscriptionTier('family')).toBe(true);
      expect(isValidSubscriptionTier('invalid')).toBe(false);
    });

    it('should get features for trial tier (same as premium)', () => {
      const features = getSubscriptionFeatures('trial');

      expect(features.maxStreams).toBe(3);
      expect(features.downloadEnabled).toBe(true);
      expect(features.watchPartyEnabled).toBe(true);
      expect(features.maxFamilyMembers).toBe(0);
    });

    it('should get features for premium tier', () => {
      const features = getSubscriptionFeatures('premium');

      expect(features.maxStreams).toBe(3);
      expect(features.downloadEnabled).toBe(true);
      expect(features.watchPartyEnabled).toBe(true);
      expect(features.maxFamilyMembers).toBe(0);
    });

    it('should get features for family tier', () => {
      const features = getSubscriptionFeatures('family');

      expect(features.maxStreams).toBe(5);
      expect(features.downloadEnabled).toBe(true);
      expect(features.watchPartyEnabled).toBe(true);
      expect(features.maxFamilyMembers).toBe(10);
    });
  });

  describe('Feature Access', () => {
    it('should check download access (trial has full access)', () => {
      expect(canAccessFeature('trial', 'download')).toBe(true);
      expect(canAccessFeature('premium', 'download')).toBe(true);
      expect(canAccessFeature('family', 'download')).toBe(true);
    });

    it('should check watch party access (trial has full access)', () => {
      expect(canAccessFeature('trial', 'watchParty')).toBe(true);
      expect(canAccessFeature('premium', 'watchParty')).toBe(true);
      expect(canAccessFeature('family', 'watchParty')).toBe(true);
    });

    it('should check family members access', () => {
      expect(canAccessFeature('trial', 'familyMembers')).toBe(false);
      expect(canAccessFeature('premium', 'familyMembers')).toBe(false);
      expect(canAccessFeature('family', 'familyMembers')).toBe(true);
    });

    it('should allow streaming for all tiers', () => {
      expect(canAccessFeature('trial', 'streaming')).toBe(true);
      expect(canAccessFeature('premium', 'streaming')).toBe(true);
      expect(canAccessFeature('family', 'streaming')).toBe(true);
    });
  });

  describe('Auth Errors', () => {
    it('should create auth error with code', () => {
      const error: AuthError = {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      };

      expect(error.code).toBe('INVALID_CREDENTIALS');
      expect(error.message).toBe('Invalid email or password');
    });

    it('should have correct error codes', () => {
      const codes: AuthErrorCode[] = [
        'INVALID_CREDENTIALS',
        'USER_NOT_FOUND',
        'EMAIL_ALREADY_EXISTS',
        'INVALID_TOKEN',
        'TOKEN_EXPIRED',
        'UNAUTHORIZED',
        'FORBIDDEN',
      ];

      codes.forEach(code => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty user ID in token generation', () => {
      const token = generateSessionToken('');
      expect(token.userId).toBe('');
    });

    it('should handle special characters in email', () => {
      expect(validateEmail("user+tag@example.com")).toBe(true);
      expect(validateEmail("user.name@sub.example.com")).toBe(true);
    });

    it('should handle unicode in name', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        name: '日本語ユーザー',
      });

      expect(profile.name).toBe('日本語ユーザー');
    });

    it('should handle profile update with empty object', () => {
      const profile = createUserProfile({
        id: 'user-123',
        email: 'user@example.com',
        name: 'Original',
      });

      const updated = updateUserProfile(profile, {});

      expect(updated.name).toBe('Original');
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });
  });
});
