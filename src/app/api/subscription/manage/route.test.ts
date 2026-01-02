/**
 * Subscription Management API Route Tests
 *
 * Tests for upgrade, downgrade, and cancel subscription operations.
 * - Upgrades: Return redirect URL to CoinPayPortal payment flow
 * - Downgrades: Schedule for end of billing period
 * - Cancel: Immediate cancellation
 *
 * Server-side only - maintains Supabase security rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock modules before importing route handlers
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: vi.fn(),
}));

// Import after mocks
import { POST, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

// Type the mocks
const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetSubscriptionRepository = vi.mocked(getSubscriptionRepository);

describe('Subscription Management API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockActiveSubscription = {
    subscription_id: 'sub-123',
    tier: 'premium',
    status: 'active',
    is_active: true,
    days_remaining: 30,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    needs_renewal: false,
  };

  const mockTrialSubscription = {
    subscription_id: 'sub-456',
    tier: 'trial',
    status: 'active',
    is_active: true,
    days_remaining: 2,
    expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    needs_renewal: false,
  };

  const mockFamilySubscription = {
    subscription_id: 'sub-789',
    tier: 'family',
    status: 'active',
    is_active: true,
    days_remaining: 60,
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    needs_renewal: false,
  };

  const mockCancelledSubscription = {
    subscription_id: 'sub-cancelled',
    tier: 'premium',
    status: 'cancelled',
    is_active: false,
    days_remaining: 0,
    expires_at: null,
    needs_renewal: false,
  };

  let mockRepository: {
    getSubscriptionStatus: ReturnType<typeof vi.fn>;
    activateSubscription: ReturnType<typeof vi.fn>;
    cancelSubscription: ReturnType<typeof vi.fn>;
    getSubscription: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      getSubscriptionStatus: vi.fn(),
      activateSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      getSubscription: vi.fn(),
    };

    mockGetSubscriptionRepository.mockReturnValue(mockRepository as ReturnType<typeof getSubscriptionRepository>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/subscription/manage (Upgrade/Downgrade)', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when action is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Action is required');
    });

    it('should return 400 when action is invalid', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid action. Must be "upgrade" or "downgrade"');
    });

    it('should return 400 when targetTier is missing for upgrade', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Target tier is required');
    });

    it('should return 400 when targetTier is invalid', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid target tier. Must be "premium" or "family"');
    });

    it('should return 404 when user has no subscription', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('No subscription found');
    });

    it('should return 400 when trying to upgrade to same tier', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockActiveSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'premium' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Already on premium tier');
    });

    it('should return 400 when trying to upgrade from family (highest tier)', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockFamilySubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'premium' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot upgrade: premium is not higher than family');
    });

    it('should return 400 when trying to downgrade from trial', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockTrialSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'downgrade', targetTier: 'premium' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot downgrade from trial');
    });

    it('should return 400 when trying to downgrade to higher tier', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockActiveSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'downgrade', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot downgrade: family is not lower than premium');
    });

    it('should return redirect URL for upgrade from premium to family', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockActiveSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('upgrade');
      expect(data.message).toBe('To upgrade to family, please complete payment');
      expect(data.redirectUrl).toContain('/pricing?upgrade=family&from=premium');
      expect(data.targetTier).toBe('family');
      expect(data.currentTier).toBe('premium');
      // Upgrade should NOT call activateSubscription - payment goes through CoinPayPortal
      expect(mockRepository.activateSubscription).not.toHaveBeenCalled();
    });

    it('should return redirect URL for upgrade from trial to premium', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockTrialSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'premium' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('upgrade');
      expect(data.redirectUrl).toContain('/pricing?upgrade=premium&from=trial');
      expect(data.targetTier).toBe('premium');
      expect(data.currentTier).toBe('trial');
    });

    it('should schedule downgrade from family to premium for end of billing period', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockFamilySubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'downgrade', targetTier: 'premium' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('downgrade');
      expect(data.message).toBe('Your subscription will be downgraded to premium at the end of your current billing period');
      expect(data.targetTier).toBe('premium');
      expect(data.currentTier).toBe('family');
      expect(data.effectiveDate).toBe(mockFamilySubscription.expires_at);
      // Downgrade should NOT immediately activate - takes effect at renewal
      expect(mockRepository.activateSubscription).not.toHaveBeenCalled();
    });

    it('should return 500 when repository throws error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'POST',
        body: JSON.stringify({ action: 'upgrade', targetTier: 'family' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to manage subscription');
    });
  });

  describe('DELETE /api/subscription/manage (Cancel)', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 404 when user has no subscription', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('No subscription found');
    });

    it('should return 400 when subscription is already cancelled', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockCancelledSubscription);

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Subscription is already cancelled');
    });

    it('should successfully cancel an active subscription', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockActiveSubscription);
      mockRepository.cancelSubscription.mockResolvedValue({
        id: 'sub-123',
        user_id: mockUser.id,
        tier: 'premium',
        status: 'cancelled',
      });

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Subscription cancelled successfully');
      expect(data.subscription.status).toBe('cancelled');
      expect(mockRepository.cancelSubscription).toHaveBeenCalledWith(mockUser.id);
    });

    it('should successfully cancel a trial subscription', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockTrialSubscription);
      mockRepository.cancelSubscription.mockResolvedValue({
        id: 'sub-456',
        user_id: mockUser.id,
        tier: 'trial',
        status: 'cancelled',
      });

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Subscription cancelled successfully');
    });

    it('should return 500 when repository throws error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockRepository.getSubscriptionStatus.mockResolvedValue(mockActiveSubscription);
      mockRepository.cancelSubscription.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/subscription/manage', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to cancel subscription');
    });
  });
});
