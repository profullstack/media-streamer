/**
 * IPTV Subscription Service Tests
 * 
 * Tests for IPTV subscription business logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IPTVSubscriptionService,
  createIPTVSubscriptionService,
} from './service';
import type { ArgonTVClient } from './client';
import type { IPTVSubscriptionRepository } from './repository';
import { ARGONTV_PACKAGES, PACKAGE_DURATION_DAYS, IPTV_PACKAGE_PRICES } from './types';

// Mock ArgonTV client
function createMockArgonTVClient(): ArgonTVClient {
  return {
    createLine: vi.fn(),
    extendLine: vi.fn(),
    getLine: vi.fn(),
    getTemplates: vi.fn(),
  } as unknown as ArgonTVClient;
}

// Mock repository
function createMockRepository(): IPTVSubscriptionRepository {
  return {
    createSubscription: vi.fn(),
    getSubscriptionById: vi.fn(),
    getUserSubscription: vi.fn(),
    getSubscriptionByLineId: vi.fn(),
    updateSubscriptionStatus: vi.fn(),
    extendSubscription: vi.fn(),
    createPayment: vi.fn(),
    getPaymentByExternalId: vi.fn(),
    getUserPayments: vi.fn(),
    updatePaymentStatus: vi.fn(),
    linkPaymentToSubscription: vi.fn(),
    completePayment: vi.fn(),
  };
}

describe('IPTVSubscriptionService', () => {
  let mockClient: ReturnType<typeof createMockArgonTVClient>;
  let mockRepository: ReturnType<typeof createMockRepository>;
  let service: IPTVSubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockArgonTVClient();
    mockRepository = createMockRepository();
    service = createIPTVSubscriptionService(mockClient, mockRepository);
  });

  describe('getPackagePricing', () => {
    it('should return pricing for all packages', () => {
      const pricing = service.getPackagePricing();

      expect(pricing).toHaveLength(6);
      expect(pricing.find(p => p.packageKey === '1_month')?.priceUsd).toBe(14.99);
      expect(pricing.find(p => p.packageKey === '12_months')?.priceUsd).toBe(99.99);
    });

    it('should include package IDs and duration', () => {
      const pricing = service.getPackagePricing();
      const oneMonth = pricing.find(p => p.packageKey === '1_month');

      expect(oneMonth?.packageId).toBe(ARGONTV_PACKAGES['1_month']);
      expect(oneMonth?.durationDays).toBe(PACKAGE_DURATION_DAYS['1_month']);
    });
  });

  describe('getUserSubscription', () => {
    it('should return user subscription with status', async () => {
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

      vi.mocked(mockRepository.getUserSubscription).mockResolvedValueOnce(mockSubscription);

      const result = await service.getUserSubscription('user-456');

      expect(result).not.toBeNull();
      expect(result?.subscription).toEqual(mockSubscription);
      expect(result?.isActive).toBe(true);
      expect(result?.daysRemaining).toBeGreaterThan(0);
    });

    it('should return null if user has no subscription', async () => {
      vi.mocked(mockRepository.getUserSubscription).mockResolvedValueOnce(null);

      const result = await service.getUserSubscription('user-no-sub');

      expect(result).toBeNull();
    });

    it('should mark expired subscription as inactive', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2025-01-02T10:00:00Z',
        expires_at: '2025-02-02T10:00:00Z', // Past date
        updated_at: '2025-01-02T10:00:00Z',
      };

      vi.mocked(mockRepository.getUserSubscription).mockResolvedValueOnce(mockSubscription);

      const result = await service.getUserSubscription('user-456');

      expect(result?.isActive).toBe(false);
      expect(result?.daysRemaining).toBe(0);
    });
  });

  describe('createSubscription', () => {
    it('should create new IPTV subscription via ArgonTV API', async () => {
      const mockArgonTVResponse = {
        error: false,
        id: 3559,
        creation_time: 1700242788,
        expiration_time: 1702834788,
        username: '125950677866',
        password: '204437619472',
        xtream_codes_username: '125950677866',
        xtream_codes_password: '204437619472',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
      };

      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: mockArgonTVResponse.m3u_download_link,
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      vi.mocked(mockClient.createLine).mockResolvedValueOnce(mockArgonTVResponse);
      vi.mocked(mockRepository.createSubscription).mockResolvedValueOnce(mockSubscription);

      const result = await service.createSubscription('user-456', '1_month', 12345);

      expect(mockClient.createLine).toHaveBeenCalledWith({
        package: ARGONTV_PACKAGES['1_month'],
        template: 12345,
      });
      expect(mockRepository.createSubscription).toHaveBeenCalled();
      expect(result).toEqual(mockSubscription);
    });

    it('should throw error if ArgonTV API fails', async () => {
      vi.mocked(mockClient.createLine).mockRejectedValueOnce(
        new Error('ArgonTV API error: Insufficient credits')
      );

      await expect(
        service.createSubscription('user-456', '1_month', 12345)
      ).rejects.toThrow('ArgonTV API error: Insufficient credits');
    });

    it('should throw error if user already has active subscription', async () => {
      const mockExistingSubscription = {
        id: 'sub-existing',
        user_id: 'user-456',
        argontv_line_id: 3558,
        username: 'existing',
        password: 'existing',
        m3u_download_link: 'https://example.com/m3u',
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      vi.mocked(mockRepository.getUserSubscription).mockResolvedValueOnce(mockExistingSubscription);

      await expect(
        service.createSubscription('user-456', '1_month', 12345)
      ).rejects.toThrow('User already has an active IPTV subscription');
    });
  });

  describe('extendSubscription', () => {
    it('should extend existing subscription via ArgonTV API', async () => {
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

      const mockExtendResponse = {
        error: false,
        failed: 0,
        successful: 1,
      };

      const mockExtendedSubscription = {
        ...mockSubscription,
        expires_at: '2026-03-02T10:00:00Z',
      };

      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(mockSubscription);
      vi.mocked(mockClient.extendLine).mockResolvedValueOnce(mockExtendResponse);
      vi.mocked(mockRepository.extendSubscription).mockResolvedValueOnce(mockExtendedSubscription);

      const result = await service.extendSubscription('sub-123', '1_month');

      expect(mockClient.extendLine).toHaveBeenCalledWith({
        lines: [3559],
        package: ARGONTV_PACKAGES['1_month'],
      });
      expect(result.expires_at).toBe('2026-03-02T10:00:00Z');
    });

    it('should throw error if subscription not found', async () => {
      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(null);

      await expect(
        service.extendSubscription('non-existent', '1_month')
      ).rejects.toThrow('Subscription not found');
    });

    it('should throw error if ArgonTV extension fails', async () => {
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

      const mockExtendResponse = {
        error: false,
        failed: 1,
        successful: 0,
      };

      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(mockSubscription);
      vi.mocked(mockClient.extendLine).mockResolvedValueOnce(mockExtendResponse);

      await expect(
        service.extendSubscription('sub-123', '1_month')
      ).rejects.toThrow('Failed to extend subscription via ArgonTV');
    });
  });

  describe('processPaymentCompletion', () => {
    it('should create new subscription when payment completes for new subscription', async () => {
      const mockPayment = {
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
        metadata: { templateId: '12345' },
        created_at: '2026-01-02T10:00:00Z',
        updated_at: '2026-01-02T10:30:00Z',
        completed_at: '2026-01-02T10:30:00Z',
      };

      const mockArgonTVResponse = {
        error: false,
        id: 3559,
        creation_time: 1700242788,
        expiration_time: 1702834788,
        username: '125950677866',
        password: '204437619472',
        xtream_codes_username: '125950677866',
        xtream_codes_password: '204437619472',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
      };

      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-456',
        argontv_line_id: 3559,
        username: '125950677866',
        password: '204437619472',
        m3u_download_link: mockArgonTVResponse.m3u_download_link,
        package_key: '1_month' as const,
        status: 'active' as const,
        created_at: '2026-01-02T10:00:00Z',
        expires_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-01-02T10:00:00Z',
      };

      vi.mocked(mockRepository.getPaymentByExternalId).mockResolvedValueOnce(mockPayment);
      vi.mocked(mockRepository.getUserSubscription).mockResolvedValueOnce(null);
      vi.mocked(mockClient.createLine).mockResolvedValueOnce(mockArgonTVResponse);
      vi.mocked(mockRepository.createSubscription).mockResolvedValueOnce(mockSubscription);
      vi.mocked(mockRepository.linkPaymentToSubscription).mockResolvedValueOnce({
        ...mockPayment,
        iptv_subscription_id: 'sub-123',
      });

      const result = await service.processPaymentCompletion('cpp-789', 12345);

      expect(result.action).toBe('subscription_created');
      expect(result.subscription).toEqual(mockSubscription);
    });

    it('should extend subscription when payment completes for extension', async () => {
      const mockPayment = {
        id: 'pay-124',
        user_id: 'user-456',
        iptv_subscription_id: 'sub-123',
        coinpayportal_payment_id: 'cpp-790',
        amount_usd: 14.99,
        amount_crypto: '0.005',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xdef...',
        payment_address: '0x456...',
        status: 'confirmed' as const,
        payment_type: 'extension' as const,
        package_key: '1_month' as const,
        webhook_received_at: '2026-02-02T10:30:00Z',
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2026-02-02T10:00:00Z',
        updated_at: '2026-02-02T10:30:00Z',
        completed_at: '2026-02-02T10:30:00Z',
      };

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

      const mockExtendResponse = {
        error: false,
        failed: 0,
        successful: 1,
      };

      const mockExtendedSubscription = {
        ...mockSubscription,
        expires_at: '2026-03-02T10:00:00Z',
      };

      vi.mocked(mockRepository.getPaymentByExternalId).mockResolvedValueOnce(mockPayment);
      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(mockSubscription);
      vi.mocked(mockClient.extendLine).mockResolvedValueOnce(mockExtendResponse);
      vi.mocked(mockRepository.extendSubscription).mockResolvedValueOnce(mockExtendedSubscription);

      const result = await service.processPaymentCompletion('cpp-790');

      expect(result.action).toBe('subscription_extended');
      expect(result.subscription?.expires_at).toBe('2026-03-02T10:00:00Z');
    });

    it('should throw error if payment not found', async () => {
      vi.mocked(mockRepository.getPaymentByExternalId).mockResolvedValueOnce(null);

      await expect(
        service.processPaymentCompletion('non-existent')
      ).rejects.toThrow('Payment not found');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription', async () => {
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

      const mockCancelledSubscription = {
        ...mockSubscription,
        status: 'cancelled' as const,
      };

      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(mockSubscription);
      vi.mocked(mockRepository.updateSubscriptionStatus).mockResolvedValueOnce(mockCancelledSubscription);

      const result = await service.cancelSubscription('sub-123');

      expect(result.status).toBe('cancelled');
      expect(mockRepository.updateSubscriptionStatus).toHaveBeenCalledWith('sub-123', 'cancelled');
    });

    it('should throw error if subscription not found', async () => {
      vi.mocked(mockRepository.getSubscriptionById).mockResolvedValueOnce(null);

      await expect(
        service.cancelSubscription('non-existent')
      ).rejects.toThrow('Subscription not found');
    });
  });

  describe('getPaymentHistory', () => {
    it('should return user payment history', async () => {
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
      ];

      vi.mocked(mockRepository.getUserPayments).mockResolvedValueOnce(mockPayments as never);

      const result = await service.getPaymentHistory('user-456');

      expect(result).toHaveLength(1);
      expect(mockRepository.getUserPayments).toHaveBeenCalledWith('user-456', undefined);
    });
  });
});
