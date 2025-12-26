/**
 * Subscription Repository Tests
 * 
 * TDD tests for the subscription repository that persists subscription data to Supabase
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserSubscription, PaymentPlan, SubscriptionTier } from '../supabase/types';

// Mock types for testing
interface MockSubscriptionRow {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'cancelled' | 'expired';
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  renewal_reminder_sent_at: string | null;
  renewal_reminder_7d_sent: boolean;
  renewal_reminder_3d_sent: boolean;
  renewal_reminder_1d_sent: boolean;
  created_at: string;
  updated_at: string;
}

interface SubscriptionStatusResult {
  subscription_id: string;
  tier: string;
  status: string;
  is_active: boolean;
  days_remaining: number;
  expires_at: string | null;
  needs_renewal: boolean;
}

// Create mock Supabase client
function createMockSupabaseClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockRpc = vi.fn();

  const chainableMock = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
  };

  // Make methods chainable
  mockSelect.mockReturnValue(chainableMock);
  mockInsert.mockReturnValue(chainableMock);
  mockUpdate.mockReturnValue(chainableMock);
  mockDelete.mockReturnValue(chainableMock);
  mockEq.mockReturnValue(chainableMock);

  const mockFrom = vi.fn().mockReturnValue(chainableMock);

  return {
    from: mockFrom,
    rpc: mockRpc,
    _mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      single: mockSingle,
      rpc: mockRpc,
    },
  } as unknown as SupabaseClient<Database> & {
    _mocks: {
      from: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      rpc: ReturnType<typeof vi.fn>;
    };
  };
}

// Import will be done after implementation
// For now, we define the expected interface
interface SubscriptionRepository {
  getSubscription(userId: string): Promise<UserSubscription | null>;
  getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult | null>;
  createSubscription(userId: string, tier?: SubscriptionTier): Promise<UserSubscription>;
  activateSubscription(userId: string, tier: PaymentPlan, durationMonths?: number): Promise<UserSubscription>;
  cancelSubscription(userId: string): Promise<UserSubscription>;
  getSubscriptionsNeedingReminders(daysBefore: number): Promise<Array<{
    userId: string;
    tier: string;
    subscriptionExpiresAt: Date;
    daysUntilExpiry: number;
    userEmail: string;
  }>>;
  markRenewalReminderSent(userId: string, daysBefore: number): Promise<void>;
}

describe('SubscriptionRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription for existing user', async () => {
      const userId = 'user-123';
      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-123',
        user_id: userId,
        tier: 'premium',
        status: 'active',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: '2024-01-01T00:00:00Z',
        subscription_expires_at: '2025-01-01T00:00:00Z',
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      // Import and test
      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.getSubscription(userId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('user_subscriptions');
      expect(mockClient._mocks.select).toHaveBeenCalledWith('*');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', userId);
      expect(result).toEqual(mockSubscription);
    });

    it('should return null for non-existent user', async () => {
      const userId = 'non-existent-user';

      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.getSubscription(userId);

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const userId = 'user-123';

      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'INTERNAL', message: 'Database connection failed' },
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);

      await expect(repo.getSubscription(userId)).rejects.toThrow('Database connection failed');
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return computed subscription status', async () => {
      const userId = 'user-123';
      const mockStatus: SubscriptionStatusResult = {
        subscription_id: 'sub-123',
        tier: 'premium',
        status: 'active',
        is_active: true,
        days_remaining: 30,
        expires_at: '2025-01-01T00:00:00Z',
        needs_renewal: false,
      };

      mockClient._mocks.rpc.mockResolvedValue({
        data: [mockStatus],
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.getSubscriptionStatus(userId);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('get_subscription_status', {
        p_user_id: userId,
      });
      expect(result).toEqual(mockStatus);
    });

    it('should return null when no subscription exists', async () => {
      const userId = 'non-existent-user';

      mockClient._mocks.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.getSubscriptionStatus(userId);

      expect(result).toBeNull();
    });

    it('should indicate needs_renewal when within 7 days of expiry', async () => {
      const userId = 'user-123';
      const mockStatus: SubscriptionStatusResult = {
        subscription_id: 'sub-123',
        tier: 'premium',
        status: 'active',
        is_active: true,
        days_remaining: 5,
        expires_at: '2024-12-31T00:00:00Z',
        needs_renewal: true,
      };

      mockClient._mocks.rpc.mockResolvedValue({
        data: [mockStatus],
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.getSubscriptionStatus(userId);

      expect(result?.needs_renewal).toBe(true);
      expect(result?.days_remaining).toBe(5);
    });
  });

  describe('createSubscription', () => {
    it('should create trial subscription by default', async () => {
      const userId = 'new-user-123';
      const now = new Date();
      const trialExpiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-new',
        user_id: userId,
        tier: 'trial',
        status: 'active',
        trial_started_at: now.toISOString(),
        trial_expires_at: trialExpiry.toISOString(),
        subscription_started_at: null,
        subscription_expires_at: null,
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.createSubscription(userId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('user_subscriptions');
      expect(mockClient._mocks.insert).toHaveBeenCalled();
      expect(result.tier).toBe('trial');
      expect(result.status).toBe('active');
    });

    it('should create subscription with specified tier', async () => {
      const userId = 'new-user-123';
      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-new',
        user_id: userId,
        tier: 'premium',
        status: 'active',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.createSubscription(userId, 'premium');

      expect(result.tier).toBe('premium');
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription using database function', async () => {
      const userId = 'user-123';
      const tier: PaymentPlan = 'premium';
      const durationMonths = 12;

      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-123',
        user_id: userId,
        tier: 'premium',
        status: 'active',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockClient._mocks.rpc.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.activateSubscription(userId, tier, durationMonths);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('activate_subscription', {
        p_user_id: userId,
        p_tier: tier,
        p_duration_months: durationMonths,
      });
      expect(result.tier).toBe('premium');
      expect(result.status).toBe('active');
    });

    it('should default to 12 months duration', async () => {
      const userId = 'user-123';
      const tier: PaymentPlan = 'family';

      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-123',
        user_id: userId,
        tier: 'family',
        status: 'active',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockClient._mocks.rpc.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      await repo.activateSubscription(userId, tier);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('activate_subscription', {
        p_user_id: userId,
        p_tier: tier,
        p_duration_months: 12,
      });
    });

    it('should extend existing subscription if still active', async () => {
      const userId = 'user-123';
      const tier: PaymentPlan = 'premium';
      
      // Subscription that expires in 30 days, extended by 12 months
      const currentExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const newExpiry = new Date(currentExpiry.getTime() + 365 * 24 * 60 * 60 * 1000);

      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-123',
        user_id: userId,
        tier: 'premium',
        status: 'active',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: newExpiry.toISOString(),
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockClient._mocks.rpc.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.activateSubscription(userId, tier);

      // The new expiry should be approximately 395 days from now (30 + 365)
      const resultExpiry = new Date(result.subscription_expires_at!);
      const expectedMinExpiry = new Date(Date.now() + 390 * 24 * 60 * 60 * 1000);
      expect(resultExpiry.getTime()).toBeGreaterThan(expectedMinExpiry.getTime());
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      const userId = 'user-123';

      const mockSubscription: MockSubscriptionRow = {
        id: 'sub-123',
        user_id: userId,
        tier: 'premium',
        status: 'cancelled',
        trial_started_at: null,
        trial_expires_at: null,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockSubscription,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const result = await repo.cancelSubscription(userId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('user_subscriptions');
      expect(mockClient._mocks.update).toHaveBeenCalledWith({ status: 'cancelled' });
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', userId);
      expect(result.status).toBe('cancelled');
    });
  });

  describe('getSubscriptionsNeedingReminders', () => {
    it('should return subscriptions expiring within specified days', async () => {
      const daysBefore = 7;
      const mockResults = [
        {
          user_id: 'user-1',
          tier: 'premium',
          subscription_expires_at: '2024-12-31T00:00:00Z',
          days_until_expiry: 5,
          user_email: 'user1@example.com',
        },
        {
          user_id: 'user-2',
          tier: 'family',
          subscription_expires_at: '2024-12-30T00:00:00Z',
          days_until_expiry: 4,
          user_email: 'user2@example.com',
        },
      ];

      mockClient._mocks.rpc.mockResolvedValue({
        data: mockResults,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const results = await repo.getSubscriptionsNeedingReminders(daysBefore);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('get_subscriptions_needing_reminders', {
        p_days_before: daysBefore,
      });
      expect(results).toHaveLength(2);
      expect(results[0].userId).toBe('user-1');
      expect(results[0].userEmail).toBe('user1@example.com');
    });

    it('should return empty array when no subscriptions need reminders', async () => {
      mockClient._mocks.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      const results = await repo.getSubscriptionsNeedingReminders(7);

      expect(results).toEqual([]);
    });
  });

  describe('markRenewalReminderSent', () => {
    it('should mark 7-day reminder as sent', async () => {
      const userId = 'user-123';
      const daysBefore = 7;

      mockClient._mocks.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      await repo.markRenewalReminderSent(userId, daysBefore);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('mark_renewal_reminder_sent', {
        p_user_id: userId,
        p_days_before: daysBefore,
      });
    });

    it('should mark 3-day reminder as sent', async () => {
      const userId = 'user-123';
      const daysBefore = 3;

      mockClient._mocks.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      await repo.markRenewalReminderSent(userId, daysBefore);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('mark_renewal_reminder_sent', {
        p_user_id: userId,
        p_days_before: daysBefore,
      });
    });

    it('should mark 1-day reminder as sent', async () => {
      const userId = 'user-123';
      const daysBefore = 1;

      mockClient._mocks.rpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const { createSubscriptionRepository } = await import('./repository');
      const repo = createSubscriptionRepository(mockClient);
      await repo.markRenewalReminderSent(userId, daysBefore);

      expect(mockClient._mocks.rpc).toHaveBeenCalledWith('mark_renewal_reminder_sent', {
        p_user_id: userId,
        p_days_before: daysBefore,
      });
    });
  });
});
