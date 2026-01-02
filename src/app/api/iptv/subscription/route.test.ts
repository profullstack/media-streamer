/**
 * IPTV Subscription API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock IPTV subscription service
vi.mock('@/lib/argontv', () => ({
  getIPTVSubscriptionService: vi.fn(),
  getIPTVSubscriptionRepository: vi.fn(),
  getPackagePrice: vi.fn(),
  isValidPackageKey: vi.fn(),
  IPTV_PACKAGE_PRICES: {
    '1_month': 14.99,
    '3_months': 34.99,
    '6_months': 59.99,
    '12_months': 99.99,
    '24_hour_test': 1.99,
    '3_hour_test': 0.99,
  },
}));

// Mock CoinPayPortal
vi.mock('@/lib/coinpayportal', () => ({
  getCoinPayPortalClient: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth';
import { getIPTVSubscriptionService, getIPTVSubscriptionRepository, isValidPackageKey } from '@/lib/argontv';
import { getCoinPayPortalClient } from '@/lib/coinpayportal';

describe('IPTV Subscription API', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/iptv/subscription', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return user subscription info', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockUser);

      const mockSubscriptionInfo = {
        subscription: {
          id: 'sub-123',
          user_id: 'user-123',
          argontv_line_id: 3559,
          username: '125950677866',
          password: '204437619472',
          m3u_download_link: 'https://example.com/m3u',
          package_key: '1_month',
          status: 'active',
          created_at: '2026-01-02T10:00:00Z',
          expires_at: '2026-02-02T10:00:00Z',
          updated_at: '2026-01-02T10:00:00Z',
        },
        isActive: true,
        daysRemaining: 30,
      };

      const mockService = {
        getUserSubscription: vi.fn().mockResolvedValueOnce(mockSubscriptionInfo),
        getPackagePricing: vi.fn().mockReturnValue([]),
      };

      vi.mocked(getIPTVSubscriptionService).mockReturnValue(mockService as never);

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription).toBeDefined();
      expect(data.isActive).toBe(true);
      expect(data.daysRemaining).toBe(30);
    });

    it('should return null subscription if user has none', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockUser);

      const mockService = {
        getUserSubscription: vi.fn().mockResolvedValueOnce(null),
        getPackagePricing: vi.fn().mockReturnValue([
          { packageKey: '1_month', priceUsd: 14.99 },
        ]),
      };

      vi.mocked(getIPTVSubscriptionService).mockReturnValue(mockService as never);

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.subscription).toBeNull();
      expect(data.packages).toBeDefined();
    });
  });

  describe('POST /api/iptv/subscription', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/iptv/subscription', {
        method: 'POST',
        body: JSON.stringify({ packageKey: '1_month', cryptoType: 'ETH' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid package key', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockUser);
      vi.mocked(isValidPackageKey).mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/iptv/subscription', {
        method: 'POST',
        body: JSON.stringify({ packageKey: 'invalid', cryptoType: 'ETH' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid package');
    });

    it('should create payment for new subscription', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockUser);
      vi.mocked(isValidPackageKey).mockReturnValue(true);

      const mockService = {
        getUserSubscription: vi.fn().mockResolvedValueOnce(null),
      };

      const mockRepository = {
        createPayment: vi.fn().mockResolvedValueOnce({
          id: 'pay-123',
          coinpayportal_payment_id: 'cpp-789',
        }),
      };

      const mockCoinPayPortal = {
        createPayment: vi.fn().mockResolvedValueOnce({
          success: true,
          payment: {
            id: 'cpp-789',
            blockchain: 'ETH',
            payment_address: '0x123...',
            crypto_amount: '0.005',
            status: 'pending',
            expires_at: '2026-01-02T11:00:00Z',
          },
          paymentUrl: 'https://coinpayportal.com/pay/cpp-789',
        }),
      };

      vi.mocked(getIPTVSubscriptionService).mockReturnValue(mockService as never);
      vi.mocked(getIPTVSubscriptionRepository).mockReturnValue(mockRepository as never);
      vi.mocked(getCoinPayPortalClient).mockReturnValue(mockCoinPayPortal as never);

      const request = new NextRequest('http://localhost/api/iptv/subscription', {
        method: 'POST',
        body: JSON.stringify({ packageKey: '1_month', cryptoType: 'ETH' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.paymentUrl).toBeDefined();
    });

    it('should return 400 if user already has active subscription', async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockUser);
      vi.mocked(isValidPackageKey).mockReturnValue(true);

      const mockService = {
        getUserSubscription: vi.fn().mockResolvedValueOnce({
          subscription: { id: 'sub-123', status: 'active' },
          isActive: true,
          daysRemaining: 30,
        }),
      };

      vi.mocked(getIPTVSubscriptionService).mockReturnValue(mockService as never);

      const request = new NextRequest('http://localhost/api/iptv/subscription', {
        method: 'POST',
        body: JSON.stringify({ packageKey: '1_month', cryptoType: 'ETH' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('already have an active');
    });
  });
});
