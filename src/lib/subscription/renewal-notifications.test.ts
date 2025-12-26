/**
 * Renewal Notification Service Tests
 * 
 * TDD tests for the service that sends renewal reminders to users
 * whose subscriptions are about to expire
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SubscriptionRepository, SubscriptionNeedingReminder } from './repository';

// Mock email sender interface
interface EmailSender {
  sendRenewalReminder(params: {
    to: string;
    daysRemaining: number;
    tier: string;
    expiresAt: Date;
    renewalUrl: string;
  }): Promise<boolean>;
}

// Create mock subscription repository
function createMockSubscriptionRepository(): SubscriptionRepository & {
  _mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    getSubscription: vi.fn(),
    getSubscriptionStatus: vi.fn(),
    createSubscription: vi.fn(),
    activateSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    getSubscriptionsNeedingReminders: vi.fn(),
    markRenewalReminderSent: vi.fn(),
  };

  return {
    ...mocks,
    _mocks: mocks,
  };
}

// Create mock email sender
function createMockEmailSender(): EmailSender & {
  _mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    sendRenewalReminder: vi.fn(),
  };

  return {
    ...mocks,
    _mocks: mocks,
  };
}

describe('RenewalNotificationService', () => {
  let mockSubscriptionRepo: ReturnType<typeof createMockSubscriptionRepository>;
  let mockEmailSender: ReturnType<typeof createMockEmailSender>;

  beforeEach(() => {
    mockSubscriptionRepo = createMockSubscriptionRepository();
    mockEmailSender = createMockEmailSender();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processRenewalReminders', () => {
    it('should send 7-day reminders to expiring subscriptions', async () => {
      const subscriptions: SubscriptionNeedingReminder[] = [
        {
          userId: 'user-1',
          tier: 'premium',
          subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 7,
          userEmail: 'user1@example.com',
        },
        {
          userId: 'user-2',
          tier: 'family',
          subscriptionExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 6,
          userEmail: 'user2@example.com',
        },
      ];

      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue(subscriptions);
      mockEmailSender._mocks.sendRenewalReminder.mockResolvedValue(true);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processRenewalReminders(7);

      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(7);
      expect(mockEmailSender._mocks.sendRenewalReminder).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionRepo._mocks.markRenewalReminderSent).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should send 3-day reminders', async () => {
      const subscriptions: SubscriptionNeedingReminder[] = [
        {
          userId: 'user-1',
          tier: 'premium',
          subscriptionExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 3,
          userEmail: 'user1@example.com',
        },
      ];

      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue(subscriptions);
      mockEmailSender._mocks.sendRenewalReminder.mockResolvedValue(true);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processRenewalReminders(3);

      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(3);
      expect(mockEmailSender._mocks.sendRenewalReminder).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('should send 1-day reminders', async () => {
      const subscriptions: SubscriptionNeedingReminder[] = [
        {
          userId: 'user-1',
          tier: 'premium',
          subscriptionExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 1,
          userEmail: 'user1@example.com',
        },
      ];

      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue(subscriptions);
      mockEmailSender._mocks.sendRenewalReminder.mockResolvedValue(true);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processRenewalReminders(1);

      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(1);
      expect(mockEmailSender._mocks.sendRenewalReminder).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('should handle email send failures gracefully', async () => {
      const subscriptions: SubscriptionNeedingReminder[] = [
        {
          userId: 'user-1',
          tier: 'premium',
          subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 7,
          userEmail: 'user1@example.com',
        },
        {
          userId: 'user-2',
          tier: 'family',
          subscriptionExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 6,
          userEmail: 'user2@example.com',
        },
      ];

      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue(subscriptions);
      // First email succeeds, second fails
      mockEmailSender._mocks.sendRenewalReminder
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processRenewalReminders(7);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      // Should only mark the successful one as sent
      expect(mockSubscriptionRepo._mocks.markRenewalReminderSent).toHaveBeenCalledTimes(1);
    });

    it('should return zero counts when no subscriptions need reminders', async () => {
      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue([]);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processRenewalReminders(7);

      expect(mockEmailSender._mocks.sendRenewalReminder).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should include correct renewal URL in email', async () => {
      const subscriptions: SubscriptionNeedingReminder[] = [
        {
          userId: 'user-1',
          tier: 'premium',
          subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 7,
          userEmail: 'user1@example.com',
        },
      ];

      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue(subscriptions);
      mockEmailSender._mocks.sendRenewalReminder.mockResolvedValue(true);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender, {
        renewalBaseUrl: 'https://example.com/pricing',
      });
      await service.processRenewalReminders(7);

      expect(mockEmailSender._mocks.sendRenewalReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          renewalUrl: 'https://example.com/pricing',
        })
      );
    });
  });

  describe('processAllReminders', () => {
    it('should process 7-day, 3-day, and 1-day reminders', async () => {
      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders.mockResolvedValue([]);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processAllReminders();

      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(7);
      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(3);
      expect(mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders).toHaveBeenCalledWith(1);
      expect(result.totalSent).toBe(0);
      expect(result.totalFailed).toBe(0);
    });

    it('should aggregate results from all reminder types', async () => {
      // 7-day reminders
      mockSubscriptionRepo._mocks.getSubscriptionsNeedingReminders
        .mockResolvedValueOnce([
          {
            userId: 'user-1',
            tier: 'premium',
            subscriptionExpiresAt: new Date(),
            daysUntilExpiry: 7,
            userEmail: 'user1@example.com',
          },
        ])
        // 3-day reminders
        .mockResolvedValueOnce([
          {
            userId: 'user-2',
            tier: 'family',
            subscriptionExpiresAt: new Date(),
            daysUntilExpiry: 3,
            userEmail: 'user2@example.com',
          },
        ])
        // 1-day reminders
        .mockResolvedValueOnce([
          {
            userId: 'user-3',
            tier: 'premium',
            subscriptionExpiresAt: new Date(),
            daysUntilExpiry: 1,
            userEmail: 'user3@example.com',
          },
        ]);

      mockEmailSender._mocks.sendRenewalReminder.mockResolvedValue(true);
      mockSubscriptionRepo._mocks.markRenewalReminderSent.mockResolvedValue(undefined);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.processAllReminders();

      expect(result.totalSent).toBe(3);
      expect(result.totalFailed).toBe(0);
      expect(result.byDays[7].sent).toBe(1);
      expect(result.byDays[3].sent).toBe(1);
      expect(result.byDays[1].sent).toBe(1);
    });
  });

  describe('getRenewalStatus', () => {
    it('should return subscription status with renewal info', async () => {
      const mockStatus = {
        subscription_id: 'sub-123',
        tier: 'premium',
        status: 'active',
        is_active: true,
        days_remaining: 5,
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        needs_renewal: true,
      };

      mockSubscriptionRepo._mocks.getSubscriptionStatus.mockResolvedValue(mockStatus);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.getRenewalStatus('user-123');

      expect(result).toEqual({
        isActive: true,
        tier: 'premium',
        daysRemaining: 5,
        expiresAt: expect.any(Date),
        needsRenewal: true,
        renewalUrl: expect.any(String),
      });
    });

    it('should return null for non-existent subscription', async () => {
      mockSubscriptionRepo._mocks.getSubscriptionStatus.mockResolvedValue(null);

      const { createRenewalNotificationService } = await import('./renewal-notifications');
      const service = createRenewalNotificationService(mockSubscriptionRepo, mockEmailSender);
      const result = await service.getRenewalStatus('non-existent');

      expect(result).toBeNull();
    });
  });
});
