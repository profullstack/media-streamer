/**
 * Subscription API Route Tests
 * 
 * Tests for the subscription status and payment history API endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock the subscription repository
vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: vi.fn(),
  getRenewalNotificationService: vi.fn(),
}));

// Mock the payment repository
vi.mock('@/lib/payments', () => ({
  getPaymentHistoryRepository: vi.fn(),
}));

describe('Subscription API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/subscription', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return subscription status for authenticated user', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockSubscriptionRepo = {
        getSubscriptionStatus: vi.fn().mockResolvedValue({
          subscription_id: 'sub-123',
          tier: 'premium',
          status: 'active',
          is_active: true,
          days_remaining: 30,
          expires_at: '2025-01-01T00:00:00Z',
          needs_renewal: false,
        }),
        getSubscription: vi.fn(),
        createSubscription: vi.fn(),
        activateSubscription: vi.fn(),
        cancelSubscription: vi.fn(),
        getSubscriptionsNeedingReminders: vi.fn(),
        markRenewalReminderSent: vi.fn(),
      };

      const { getSubscriptionRepository } = await import('@/lib/subscription');
      vi.mocked(getSubscriptionRepository).mockReturnValue(mockSubscriptionRepo);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription).toBeDefined();
      expect(data.subscription.tier).toBe('premium');
      expect(data.subscription.isActive).toBe(true);
      expect(data.subscription.daysRemaining).toBe(30);
    });

    it('should return trial status for new user', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-new',
        email: 'new@example.com',
      });

      const mockSubscriptionRepo = {
        getSubscriptionStatus: vi.fn().mockResolvedValue({
          subscription_id: 'sub-new',
          tier: 'trial',
          status: 'active',
          is_active: true,
          days_remaining: 2,
          expires_at: '2024-12-28T00:00:00Z',
          needs_renewal: false,
        }),
        getSubscription: vi.fn(),
        createSubscription: vi.fn(),
        activateSubscription: vi.fn(),
        cancelSubscription: vi.fn(),
        getSubscriptionsNeedingReminders: vi.fn(),
        markRenewalReminderSent: vi.fn(),
      };

      const { getSubscriptionRepository } = await import('@/lib/subscription');
      vi.mocked(getSubscriptionRepository).mockReturnValue(mockSubscriptionRepo);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription.tier).toBe('trial');
      expect(data.subscription.daysRemaining).toBe(2);
    });

    it('should indicate needs_renewal when subscription is expiring soon', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockSubscriptionRepo = {
        getSubscriptionStatus: vi.fn().mockResolvedValue({
          subscription_id: 'sub-123',
          tier: 'premium',
          status: 'active',
          is_active: true,
          days_remaining: 5,
          expires_at: '2024-12-31T00:00:00Z',
          needs_renewal: true,
        }),
        getSubscription: vi.fn(),
        createSubscription: vi.fn(),
        activateSubscription: vi.fn(),
        cancelSubscription: vi.fn(),
        getSubscriptionsNeedingReminders: vi.fn(),
        markRenewalReminderSent: vi.fn(),
      };

      const { getSubscriptionRepository } = await import('@/lib/subscription');
      vi.mocked(getSubscriptionRepository).mockReturnValue(mockSubscriptionRepo);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription.needsRenewal).toBe(true);
      expect(data.subscription.daysRemaining).toBe(5);
    });

    it('should return null subscription when user has no subscription', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-no-sub',
        email: 'nosub@example.com',
      });

      const mockSubscriptionRepo = {
        getSubscriptionStatus: vi.fn().mockResolvedValue(null),
        getSubscription: vi.fn(),
        createSubscription: vi.fn(),
        activateSubscription: vi.fn(),
        cancelSubscription: vi.fn(),
        getSubscriptionsNeedingReminders: vi.fn(),
        markRenewalReminderSent: vi.fn(),
      };

      const { getSubscriptionRepository } = await import('@/lib/subscription');
      vi.mocked(getSubscriptionRepository).mockReturnValue(mockSubscriptionRepo);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription).toBeNull();
    });
  });

  describe('GET /api/subscription/history', () => {
    it('should return payment history for authenticated user', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockPaymentRepo = {
        getUserPayments: vi.fn().mockResolvedValue([
          {
            id: 'pay-1',
            user_id: 'user-123',
            coinpayportal_payment_id: 'cpp-1',
            amount_usd: 4.99,
            plan: 'premium',
            status: 'confirmed',
            created_at: '2024-01-01T00:00:00Z',
            completed_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'pay-2',
            user_id: 'user-123',
            coinpayportal_payment_id: 'cpp-2',
            amount_usd: 4.99,
            plan: 'premium',
            status: 'confirmed',
            created_at: '2023-01-01T00:00:00Z',
            completed_at: '2023-01-01T00:00:00Z',
          },
        ]),
        createPayment: vi.fn(),
        getPaymentByExternalId: vi.fn(),
        updatePaymentStatus: vi.fn(),
        completePayment: vi.fn(),
        getLastCompletedPayment: vi.fn(),
        getPendingPayments: vi.fn(),
      };

      const { getPaymentHistoryRepository } = await import('@/lib/payments');
      vi.mocked(getPaymentHistoryRepository).mockReturnValue(mockPaymentRepo);

      // Import the history route handler
      const { GET: getHistory } = await import('./history/route');
      const response = await getHistory();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.payments).toHaveLength(2);
      expect(data.payments[0].plan).toBe('premium');
    });
  });
});
