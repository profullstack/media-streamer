/**
 * Payment API Route Tests
 * 
 * Tests for creating payment sessions via CoinPayPortal
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the payments module
const mockPaymentHistoryRepository = {
  createPayment: vi.fn().mockResolvedValue({
    id: 'payment-db-123',
    user_id: 'user-123',
    coinpay_payment_id: 'coinpay-payment-123',
    plan: 'premium',
    amount_usd: 4.99,
    crypto_type: 'BTC',
    status: 'pending',
    created_at: new Date().toISOString(),
  }),
  getUserPayments: vi.fn().mockResolvedValue([
    {
      id: 'payment-db-123',
      user_id: 'user-123',
      coinpay_payment_id: 'coinpay-payment-123',
      plan: 'premium',
      amount_usd: 4.99,
      crypto_type: 'BTC',
      status: 'completed',
      created_at: new Date().toISOString(),
    },
  ]),
  updatePaymentStatus: vi.fn().mockResolvedValue(undefined),
  completePayment: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/lib/payments', () => ({
  createPaymentRequest: vi.fn(function(options) {
    return {
      id: 'pay-test-123',
      userId: options.userId,
      plan: options.plan,
      cryptoType: options.cryptoType,
      amountUsd: options.plan === 'premium' ? 4.99 : 9.99,
      status: 'pending',
      createdAt: new Date(),
    };
  }),
  validatePaymentRequest: vi.fn(function() { return true; }),
  getSubscriptionPrice: vi.fn(function(plan) {
    return {
      plan,
      usd: plan === 'premium' ? 4.99 : 9.99,
    };
  }),
  getPaymentHistoryRepository: vi.fn(function() { return mockPaymentHistoryRepository; }),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-123', email: 'test@example.com' })),
}));

// Mock CoinPayPortal client
const mockCreatePayment = vi.fn();
vi.mock('@/lib/coinpayportal', () => ({
  getCoinPayPortalClient: vi.fn(function() {
    return {
      createPayment: mockCreatePayment,
    };
  }),
}));

describe('Payment API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful CoinPayPortal API response
    mockCreatePayment.mockResolvedValue({
      success: true,
      payment: {
        id: 'coinpay-payment-123',
        business_id: 'test-business-id',
        amount: 4.99,
        currency: 'USD',
        blockchain: 'BTC',
        crypto_amount: '0.00012345',
        payment_address: 'bc1qtest123',
        status: 'pending',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      },
      paymentUrl: 'https://coinpayportal.com/pay/coinpay-payment-123',
    });
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

    it('should reject missing crypto type', async () => {
      const { POST } = await import('./route');

      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Crypto type is required');
    });

    it('should accept any crypto type (validation done by CoinPayPortal API)', async () => {
      const { POST } = await import('./route');
      // These are the valid CryptoBlockchain types from CoinPayPortal
      const validCryptos = ['BTC', 'ETH', 'POL', 'SOL', 'USDC_ETH', 'USDC_POL', 'USDC_SOL'];

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

    it('should return payment URL for CoinPayPortal hosted page', async () => {
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
      expect(data.paymentUrl).toContain('coinpayportal.com/pay');
    });

    it('should include CoinPayPortal payment ID in response', async () => {
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
      expect(data.payment.coinPayId).toBe('coinpay-payment-123');
    });

    it('should handle CoinPayPortal API errors with 502 status', async () => {
      mockCreatePayment.mockRejectedValueOnce(new Error('CoinPayPortal API error: No BTC wallet configured'));

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

      // 502 Bad Gateway is returned for upstream service errors
      expect(response.status).toBe(502);
      expect(data.error).toBeDefined();
      expect(data.error).toContain('CoinPayPortal API error');
    });

    it('should return the actual error message from CoinPayPortal', async () => {
      const errorMessage = 'CoinPayPortal API error: No ETH wallet configured for this business. Please add a wallet address in the business settings.';
      mockCreatePayment.mockRejectedValueOnce(new Error(errorMessage));

      const { POST } = await import('./route');
      
      const request = new Request('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'premium',
          cryptoType: 'ETH',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe(errorMessage);
    });
  });

  describe('GET /api/payments', () => {
    it('should return user payment history', async () => {
      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.payments).toBeDefined();
      expect(Array.isArray(data.payments)).toBe(true);
    });

    it('should require authentication for payment history', async () => {
      const authModule = await import('@/lib/auth');
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);

      const { GET } = await import('./route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authentication required');
    });
  });
});
