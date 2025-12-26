/**
 * Payment API Route Tests
 * 
 * Tests for creating payment sessions via CoinPayPortal
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the payments module
vi.mock('@/lib/payments', () => ({
  createPaymentRequest: vi.fn((options) => ({
    id: 'pay-test-123',
    userId: options.userId,
    plan: options.plan,
    cryptoType: options.cryptoType,
    amountUsd: options.plan === 'premium' ? 4.99 : 9.99,
    status: 'pending',
    createdAt: new Date(),
  })),
  validatePaymentRequest: vi.fn(() => true),
  getSubscriptionPrice: vi.fn((plan) => ({
    plan,
    usd: plan === 'premium' ? 4.99 : 9.99,
  })),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-123', email: 'test@example.com' })),
}));

describe('Payment API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/payments', () => {
    it('should create a payment request for premium plan', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
          cryptoType: 'BTC',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payment).toBeDefined();
      expect(data.payment.plan).toBe('premium');
    });

    it('should create a payment request for family plan', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'family',
          cryptoType: 'ETH',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payment).toBeDefined();
      expect(data.payment.plan).toBe('family');
    });

    it('should reject invalid plan', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'invalid',
          cryptoType: 'BTC',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should reject free plan (no longer supported)', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'free',
          cryptoType: 'BTC',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid plan');
    });

    it('should reject invalid crypto type', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
          cryptoType: 'DOGE',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid crypto type');
    });

    it('should accept all valid crypto types', async () => {
      const { POST } = await import('./route');
      const validCryptos = ['BTC', 'ETH', 'LTC', 'USDT', 'USDC'];

      for (const cryptoType of validCryptos) {
        const request = new Request('http://localhost:3000/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: 'premium',
            cryptoType,
          }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });

    it('should require authentication', async () => {
      // Mock unauthenticated user
      const authModule = await import('@/lib/auth');
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);

      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
          cryptoType: 'BTC',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authentication required');
    });

    it('should handle missing request body', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should return payment URL for CoinPayPortal', async () => {
      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
          cryptoType: 'BTC',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.paymentUrl).toBeDefined();
      expect(data.paymentUrl).toContain('coinpayportal');
    });
  });

  describe('GET /api/payments', () => {
    it('should return user payment history', async () => {
      const { GET } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.payments).toBeDefined();
      expect(Array.isArray(data.payments)).toBe(true);
    });

    it('should require authentication for payment history', async () => {
      const authModule = await import('@/lib/auth');
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);

      const { GET } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authentication required');
    });
  });
});
