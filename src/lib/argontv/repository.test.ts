/**
 * IPTV Subscription Repository Tests
 * 
 * Tests for IPTV subscription database operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createIPTVSubscriptionRepository,
  type IPTVSubscriptionRepository,
} from './repository';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// Mock Supabase client
function createMockSupabaseClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();

  const chainMock = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    limit: mockLimit,
  };

  // Chain all methods to return the chain mock
  mockSelect.mockReturnValue(chainMock);
  mockInsert.mockReturnValue(chainMock);
  mockUpdate.mockReturnValue(chainMock);
  mockEq.mockReturnValue(chainMock);
  mockOrder.mockReturnValue(chainMock);
  mockLimit.mockReturnValue(chainMock);

  const mockFrom = vi.fn().mockReturnValue(chainMock);

  return {
    from: mockFrom,
    _mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      eq: mockEq,
      single: mockSingle,
      order: mockOrder,
      limit: mockLimit,
    },
  } as unknown as SupabaseClient<Database> & { _mocks: Record<string, ReturnType<typeof vi.fn>> };
}

describe('IPTVSubscriptionRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let repository: IPTVSubscriptionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    repository = createIPTVSubscriptionRepository(mockClient);
  });

  describe('createSubscription', () => {
    it('should create a new IPTV subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });

      const result = await repository.createSubscription('user-456', {
        argontvLineId: 3559,
        username: '125950677866',
        password: '204437619472',
        m3uDownloadLink: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
        packageKey: '1_month',
        expiresAt: new Date('2026-02-02T10:00:00Z'),
      });

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('iptv_subscriptions');
      expect(mockClient._mocks.insert).toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      mockClient._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error', code: 'PGRST001' },
      });

      await expect(repository.createSubscription('user-456', {
        argontvLineId: 3559,
        username: '125950677866',
        password: '204437619472',
        m3uDownloadLink: 'https://example.com/m3u',
        packageKey: '1_month',
        expiresAt: new Date('2026-02-02T10:00:00Z'),
      })).rejects.toThrow('Database error');
    });
  });

  describe('getSubscriptionById', () => {
    it('should return subscription by ID', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });

      const result = await repository.getSubscriptionById('sub-123');

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('iptv_subscriptions');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('id', 'sub-123');
    });

    it('should return null for non-existent subscription', async () => {
      mockClient._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.getSubscriptionById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserSubscription', () => {
    it('should return active subscription for user', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });

      const result = await repository.getUserSubscription('user-456');

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('iptv_subscriptions');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', 'user-456');
    });

    it('should return null if user has no subscription', async () => {
      mockClient._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.getUserSubscription('user-no-sub');

      expect(result).toBeNull();
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should update subscription status', async () => {
      const mockUpdatedSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'expired' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T11:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockUpdatedSubscription,
        error: null,
      });

      const result = await repository.updateSubscriptionStatus('sub-123', 'expired');

      expect(result.status).toBe('expired');
      expect(mockClient._mocks.update).toHaveBeenCalled();
    });
  });

  describe('extendSubscription', () => {
    it('should extend subscription expiry date', async () => {
      const newExpiresAt = new Date('2026-03-02T10:00:00Z');
      const mockExtendedSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: newExpiresAt.toISOString(),
        updated_at: '2026-01-02T11:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockExtendedSubscription,
        error: null,
      });

      const result = await repository.extendSubscription('sub-123', newExpiresAt);

      expect(result.expires_at).toBe(newExpiresAt.toISOString());
      expect(mockClient._mocks.update).toHaveBeenCalled();
    });
  });

  describe('getSubscriptionByLineId', () => {
    it('should return subscription by ArgonTV line ID', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });

      const result = await repository.getSubscriptionByLineId(3559);

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('argontv_line_id', 3559);
    });
  });
});

describe('IPTVPaymentHistoryRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let repository: IPTVSubscriptionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    repository = createIPTVSubscriptionRepository(mockClient);
  });

  describe('createPayment', () => {
    it('should create a new IPTV payment record', async () => {
      const mockPayment = {
        id: 'pay-123',
        user_id: 'user-456',
        iptv_subscription_id: null,
        coinpayportal_payment_id: 'cpp-789',
        amount_usd: 14.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'ETH',
        tx_hash: null,
        payment_address: '0x123...',
        status: 'pending' as const,
        payment_type: 'new_subscription' as const,
        package_key: '1_month' as const,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: null,
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockPayment,
        error: null,
      });

      const result = await repository.createPayment('user-456', {
        coinpayportalPaymentId: 'cpp-789',
        amountUsd: 14.99,
        packageKey: '1_month',
        paymentType: 'new_subscription',
        blockchain: 'ETH',
        paymentAddress: '0x123...',
      });

      expect(result).toEqual(mockPayment);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('iptv_payment_history');
    });

    it('should create extension payment with subscription ID', async () => {
      const mockPayment = {
        id: 'pay-124',
        user_id: 'user-456',
        iptv_subscription_id: 'sub-123',
        coinpayportal_payment_id: 'cpp-790',
        amount_usd: 14.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'BTC',
        tx_hash: null,
        payment_address: 'bc1q...',
        status: 'pending' as const,
        payment_type: 'extension' as const,
        package_key: '1_month' as const,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: null,
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockPayment,
        error: null,
      });

      const result = await repository.createPayment('user-456', {
        coinpayportalPaymentId: 'cpp-790',
        amountUsd: 14.99,
        packageKey: '1_month',
        paymentType: 'extension',
        subscriptionId: 'sub-123',
        blockchain: 'BTC',
        paymentAddress: 'bc1q...',
      });

      expect(result.payment_type).toBe('extension');
      expect(result.iptv_subscription_id).toBe('sub-123');
    });
  });

  describe('getPaymentByExternalId', () => {
    it('should return payment by CoinPayPortal ID', async () => {
      const mockPayment = {
        id: 'pay-123',
        user_id: 'user-456',
        iptv_subscription_id: null,
        coinpayportal_payment_id: 'cpp-789',
        amount_usd: 14.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'ETH',
        tx_hash: null,
        payment_address: '0x123...',
        status: 'pending' as const,
        payment_type: 'new_subscription' as const,
        package_key: '1_month' as const,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: null,
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockPayment,
        error: null,
      });

      const result = await repository.getPaymentByExternalId('cpp-789');

      expect(result).toEqual(mockPayment);
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('coinpayportal_payment_id', 'cpp-789');
    });

    it('should return null for non-existent payment', async () => {
      mockClient._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.getPaymentByExternalId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status with webhook data', async () => {
      const mockUpdatedPayment = {
        id: 'pay-123',
        user_id: 'user-456',
        iptv_subscription_id: null,
        coinpayportal_payment_id: 'cpp-789',
        amount_usd: 14.99,
        amount_crypto: '0.005',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc...',
        payment_address: '0x123...',
        status: 'confirmed' as const,
        payment_type: 'new_subscription' as const,
        package_key: '1_month' as const,
        webhook_received_at: '2026-01-02T10:30:00Z',
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:30:00Z',
        completed_at: '2026-01-02T10:30:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockUpdatedPayment,
        error: null,
      });

      const result = await repository.updatePaymentStatus('cpp-789', {
        status: 'confirmed',
        txHash: '0xabc...',
        amountCrypto: '0.005',
        cryptoCurrency: 'ETH',
        webhookEventType: 'payment.confirmed',
      });

      expect(result.status).toBe('confirmed');
      expect(result.tx_hash).toBe('0xabc...');
    });
  });

  describe('getUserPayments', () => {
    it('should return all payments for a user', async () => {
      const mockPayments = [
        {
          id: 'pay-123',
          user_id: 'user-456',
          coinpayportal_payment_id: 'cpp-789',
          amount_usd: 14.99,
          status: 'confirmed' as const,
          payment_type: 'new_subscription' as const,
          package_key: '1_month' as const,
          created_at: '2026-01-02T10:00:00Z',
        },
        {
          id: 'pay-124',
          user_id: 'user-456',
          coinpayportal_payment_id: 'cpp-790',
          amount_usd: 14.99,
          status: 'pending' as const,
          payment_type: 'extension' as const,
          package_key: '1_month' as const,
          created_at: '2026-02-02T10:00:00Z',
        },
      ];

      // For getUserPayments, we need to mock the chain differently
      mockClient._mocks.order.mockResolvedValueOnce({
        data: mockPayments,
        error: null,
      });

      const result = await repository.getUserPayments('user-456');

      expect(result).toHaveLength(2);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('iptv_payment_history');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', 'user-456');
    });
  });

  describe('linkPaymentToSubscription', () => {
    it('should link payment to subscription after creation', async () => {
      const mockUpdatedPayment = {
        id: 'pay-123',
        user_id: 'user-456',
        iptv_subscription_id: 'sub-123',
        coinpayportal_payment_id: 'cpp-789',
        amount_usd: 14.99,
        status: 'confirmed' as const,
        payment_type: 'new_subscription' as const,
        package_key: '1_month' as const,
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:30:00Z',
      };

      mockClient._mocks.single.mockResolvedValueOnce({
        data: mockUpdatedPayment,
        error: null,
      });

      const result = await repository.linkPaymentToSubscription('pay-123', 'sub-123');

      expect(result.iptv_subscription_id).toBe('sub-123');
    });
  });
});
