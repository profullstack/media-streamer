/**
 * Subscription Module Tests
 * 
 * Tests for trial and subscription management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SubscriptionStatus,
  createTrialSubscription,
  isTrialActive,
  isTrialExpired,
  getTrialDaysRemaining,
  isSubscriptionActive,
  getSubscriptionStatus,
  calculateTrialExpiry,
  TRIAL_DURATION_DAYS,
} from './subscription';

describe('Subscription Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createTrialSubscription', () => {
    it('should create a trial subscription with 3-day expiry', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      vi.setSystemTime(now);

      const trial = createTrialSubscription('user-123');

      expect(trial.userId).toBe('user-123');
      expect(trial.tier).toBe('trial');
      expect(trial.status).toBe('active');
      expect(trial.trialStartedAt).toEqual(now);
      expect(trial.trialExpiresAt).toEqual(new Date('2024-01-04T00:00:00Z'));
    });

    it('should set trial duration to 3 days', () => {
      expect(TRIAL_DURATION_DAYS).toBe(3);
    });
  });

  describe('calculateTrialExpiry', () => {
    it('should calculate expiry 3 days from start', () => {
      const start = new Date('2024-01-01T12:00:00Z');
      const expiry = calculateTrialExpiry(start);

      expect(expiry).toEqual(new Date('2024-01-04T12:00:00Z'));
    });
  });

  describe('isTrialActive', () => {
    it('should return true when trial has not expired', () => {
      const now = new Date('2024-01-02T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialActive(subscription)).toBe(true);
    });

    it('should return false when trial has expired', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialActive(subscription)).toBe(false);
    });

    it('should return false for non-trial subscriptions', () => {
      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialActive(subscription)).toBe(false);
    });
  });

  describe('isTrialExpired', () => {
    it('should return true when trial has expired', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialExpired(subscription)).toBe(true);
    });

    it('should return false when trial is still active', () => {
      const now = new Date('2024-01-02T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialExpired(subscription)).toBe(false);
    });

    it('should return false for non-trial subscriptions', () => {
      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isTrialExpired(subscription)).toBe(false);
    });
  });

  describe('getTrialDaysRemaining', () => {
    it('should return correct days remaining', () => {
      const now = new Date('2024-01-02T12:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getTrialDaysRemaining(subscription)).toBe(2);
    });

    it('should return 0 when trial has expired', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getTrialDaysRemaining(subscription)).toBe(0);
    });

    it('should return 0 for non-trial subscriptions', () => {
      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getTrialDaysRemaining(subscription)).toBe(0);
    });
  });

  describe('isSubscriptionActive', () => {
    it('should return true for active trial', () => {
      const now = new Date('2024-01-02T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return false for expired trial', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(false);
    });

    it('should return true for active premium subscription', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return false for expired premium subscription', () => {
      const now = new Date('2025-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(false);
    });

    it('should return true for active family subscription', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'family' as const,
        status: 'active' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(true);
    });

    it('should return false for cancelled subscription', () => {
      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'cancelled' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(isSubscriptionActive(subscription)).toBe(false);
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return trial_active for active trial', () => {
      const now = new Date('2024-01-02T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getSubscriptionStatus(subscription)).toBe('trial_active');
    });

    it('should return trial_expired for expired trial', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'trial' as const,
        status: 'active' as const,
        trialStartedAt: new Date('2024-01-01T00:00:00Z'),
        trialExpiresAt: new Date('2024-01-04T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getSubscriptionStatus(subscription)).toBe('trial_expired');
    });

    it('should return active for active paid subscription', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getSubscriptionStatus(subscription)).toBe('active');
    });

    it('should return expired for expired paid subscription', () => {
      const now = new Date('2025-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'active' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getSubscriptionStatus(subscription)).toBe('expired');
    });

    it('should return cancelled for cancelled subscription', () => {
      const subscription = {
        userId: 'user-123',
        tier: 'premium' as const,
        status: 'cancelled' as const,
        subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(getSubscriptionStatus(subscription)).toBe('cancelled');
    });
  });
});
