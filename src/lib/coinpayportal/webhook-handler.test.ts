/**
 * CoinPayPortal Webhook Handler Tests
 * 
 * TDD tests for the webhook handler that processes CoinPayPortal webhooks
 * and persists payment data to the database
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebhookPayload } from './types';
import type { PaymentHistoryRepository } from '../payments/repository';
import type { SubscriptionRepository } from '../subscription/repository';
import type { PaymentHistory, UserSubscription } from '../supabase/types';

// Mock repositories
function createMockPaymentRepository(): PaymentHistoryRepository & {
  _mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    createPayment: vi.fn(),
    getPaymentByExternalId: vi.fn(),
    getUserPayments: vi.fn(),
    updatePaymentStatus: vi.fn(),
    completePayment: vi.fn(),
    getLastCompletedPayment: vi.fn(),
    getPendingPayments: vi.fn(),
  };

  return {
    ...mocks,
    _mocks: mocks,
  };
}

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

describe('WebhookHandler', () => {
  let mockPaymentRepo: ReturnType<typeof createMockPaymentRepository>;
  let mockSubscriptionRepo: ReturnType<typeof createMockSubscriptionRepository>;

  beforeEach(() => {
    mockPaymentRepo = createMockPaymentRepository();
    mockSubscriptionRepo = createMockSubscriptionRepository();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handlePaymentDetected', () => {
    it('should update payment status when payment is detected', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.detected',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'detected',
          confirmations: 1,
          tx_hash: '0xabc123',
          metadata: { user_id: 'user-123', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'detected',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.detected',
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockPaymentRepo._mocks.updatePaymentStatus).toHaveBeenCalledWith(
        'cpp-pay-123',
        expect.objectContaining({
          status: 'detected',
          txHash: '0xabc123',
          amountCrypto: '0.0015',
          cryptoCurrency: 'ETH',
          webhookEventType: 'payment.detected',
        })
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('payment_updated');
    });
  });

  describe('handlePaymentConfirmed', () => {
    it('should activate subscription when payment is confirmed', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.confirmed',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'confirmed',
          confirmations: 6,
          tx_hash: '0xabc123',
          metadata: { user_id: 'user-123', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.confirmed',
        metadata: { user_id: 'user-123', plan: 'premium' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      const mockSubscription: UserSubscription = {
        id: 'sub-123',
        user_id: 'user-123',
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

      mockPaymentRepo._mocks.getPaymentByExternalId.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.completePayment.mockResolvedValue({
        ...mockPayment,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date().toISOString(),
      });
      mockSubscriptionRepo._mocks.activateSubscription.mockResolvedValue(mockSubscription);

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockPaymentRepo._mocks.updatePaymentStatus).toHaveBeenCalled();
      expect(mockSubscriptionRepo._mocks.activateSubscription).toHaveBeenCalledWith(
        'user-123',
        'premium',
        12
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('subscription_activated');
    });

    it('should handle family plan activation', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.confirmed',
        data: {
          payment_id: 'cpp-pay-456',
          amount_crypto: '0.003',
          amount_usd: '9.99',
          currency: 'ETH',
          status: 'confirmed',
          confirmations: 6,
          tx_hash: '0xdef456',
          metadata: { user_id: 'user-456', plan: 'family' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-456',
        user_id: 'user-456',
        coinpayportal_payment_id: 'cpp-pay-456',
        amount_usd: 9.99,
        amount_crypto: '0.003',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xdef456',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'family',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.confirmed',
        metadata: { user_id: 'user-456', plan: 'family' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      const mockSubscription: UserSubscription = {
        id: 'sub-456',
        user_id: 'user-456',
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

      mockPaymentRepo._mocks.getPaymentByExternalId.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.completePayment.mockResolvedValue({
        ...mockPayment,
        completed_at: new Date().toISOString(),
      });
      mockSubscriptionRepo._mocks.activateSubscription.mockResolvedValue(mockSubscription);

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockSubscriptionRepo._mocks.activateSubscription).toHaveBeenCalledWith(
        'user-456',
        'family',
        12
      );
      expect(result.success).toBe(true);
    });
  });

  describe('handlePaymentFailed', () => {
    it('should update payment status to failed', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.failed',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'failed',
          message: 'Transaction reverted',
          metadata: { user_id: 'user-123', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'ETH',
        tx_hash: null,
        payment_address: '0x1234567890abcdef',
        status: 'failed',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.failed',
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockPaymentRepo._mocks.updatePaymentStatus).toHaveBeenCalledWith(
        'cpp-pay-123',
        expect.objectContaining({
          status: 'failed',
          webhookEventType: 'payment.failed',
        })
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('payment_failed');
    });
  });

  describe('handlePaymentExpired', () => {
    it('should update payment status to expired', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.expired',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'expired',
          metadata: { user_id: 'user-123', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'ETH',
        tx_hash: null,
        payment_address: '0x1234567890abcdef',
        status: 'expired',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.expired',
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockPaymentRepo._mocks.updatePaymentStatus).toHaveBeenCalledWith(
        'cpp-pay-123',
        expect.objectContaining({
          status: 'expired',
          webhookEventType: 'payment.expired',
        })
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('payment_expired');
    });
  });

  describe('handleTestWebhook', () => {
    it('should acknowledge test webhooks without processing', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-test',
        type: 'test.webhook',
        data: {
          payment_id: 'test-123',
          amount_crypto: '0',
          amount_usd: '0',
          currency: 'TEST',
          status: 'test',
          message: 'Test webhook',
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(mockPaymentRepo._mocks.updatePaymentStatus).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo._mocks.activateSubscription).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.action).toBe('test_acknowledged');
    });
  });

  describe('error handling', () => {
    it('should return error result when payment update fails', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.detected',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'detected',
          metadata: { user_id: 'user-123', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      mockPaymentRepo._mocks.updatePaymentStatus.mockRejectedValue(
        new Error('Database connection failed')
      );

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should return error for unknown webhook type', async () => {
      const payload = {
        id: 'webhook-123',
        type: 'unknown.event',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0',
          amount_usd: '0',
          currency: 'ETH',
          status: 'unknown',
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      } as unknown as WebhookPayload;

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      const result = await handler.handleWebhook(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown webhook type');
    });
  });

  describe('getUserIdFromPayment', () => {
    it('should extract user_id from payment metadata', async () => {
      const payload: WebhookPayload = {
        id: 'webhook-123',
        type: 'payment.confirmed',
        data: {
          payment_id: 'cpp-pay-123',
          amount_crypto: '0.0015',
          amount_usd: '4.99',
          currency: 'ETH',
          status: 'confirmed',
          confirmations: 6,
          tx_hash: '0xabc123',
          metadata: { user_id: 'user-from-metadata', plan: 'premium' },
        },
        created_at: new Date().toISOString(),
        business_id: 'biz-123',
      };

      const mockPayment: PaymentHistory = {
        id: 'pay-123',
        user_id: 'user-from-db',
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: { user_id: 'user-from-metadata', plan: 'premium' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockPaymentRepo._mocks.getPaymentByExternalId.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.updatePaymentStatus.mockResolvedValue(mockPayment);
      mockPaymentRepo._mocks.completePayment.mockResolvedValue(mockPayment);
      mockSubscriptionRepo._mocks.activateSubscription.mockResolvedValue({
        id: 'sub-123',
        user_id: 'user-from-db',
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
      });

      const { createWebhookHandler } = await import('./webhook-handler');
      const handler = createWebhookHandler(mockPaymentRepo, mockSubscriptionRepo);
      await handler.handleWebhook(payload);

      // Should use user_id from the database payment record
      expect(mockSubscriptionRepo._mocks.activateSubscription).toHaveBeenCalledWith(
        'user-from-db',
        'premium',
        12
      );
    });
  });
});
