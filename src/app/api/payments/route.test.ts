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
const mockCreateCheckoutSession = vi.fn();
vi.mock('@/lib/coinpayportal', () => ({
  getCoinPayPortalClient: vi.fn(function() {
    return {
      createCheckoutSession: mockCreateCheckoutSession,
    };
  }),
}));

const SESSION_ID = 'cs_AbCdEfGhIjKlMnOpQrStUvWx';

function post(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Payment API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckoutSession.mockResolvedValue({
      id: SESSION_ID,
      url: `https://coinpayportal.com/checkout/${SESSION_ID}`,
    });
  });

  describe('POST /api/payments', () => {
    it('opens a CoinPay hosted checkout session for the premium plan', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'premium' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payment.plan).toBe('premium');
      expect(data.payment.checkoutSessionId).toBe(SESSION_ID);
      expect(data.paymentUrl).toBe(`https://coinpayportal.com/checkout/${SESSION_ID}`);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        amount: 4.99,
        description: 'BitTorrented premium subscription',
        customerEmail: 'test@example.com',
        accountId: 'user-123',
        metadata: { orderId: 'pay-test-123', userId: 'user-123', plan: 'premium', userEmail: 'test@example.com' },
        successUrl: expect.stringMatching(/\/account\?payment=success$/),
        cancelUrl: expect.stringMatching(/\/pricing$/),
      });
    });

    it('stores the order keyed by the session id until the webhook re-keys it', async () => {
      const { POST } = await import('./route');
      await POST(post({ plan: 'family' }));
      expect(mockPaymentHistoryRepository.createPayment).toHaveBeenCalledWith('user-123', {
        coinpayportalPaymentId: SESSION_ID,
        amountUsd: 9.99,
        plan: 'family',
        metadata: { orderId: 'pay-test-123', userEmail: 'test@example.com', checkoutSessionId: SESSION_ID },
      });
    });

    it('needs no coin: an old tab that still sends one gets the same session', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'premium', cryptoType: 'BTC' }));
      expect(response.status).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid plan', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'invalid' }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeDefined();
    });

    it('should reject free plan (no longer supported)', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'free' }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('Invalid plan');
    });

    it('refuses an account with no email (CoinPay needs it for the receipt)', async () => {
      const authModule = await import('@/lib/auth');
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: 'user-123', email: '' });
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'premium' }));
      expect(response.status).toBe(400);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const authModule = await import('@/lib/auth');
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'premium' }));
      expect(response.status).toBe(401);
      expect((await response.json()).error).toContain('Authentication required');
    });

    it('should handle missing request body', async () => {
      const { POST } = await import('./route');
      const request = new Request('http://localhost:3000/api/payments', { method: 'POST' });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should return the actual CoinPay error with 502 status', async () => {
      const errorMessage = 'CoinPayPortal API error: 400 - customer_email is required';
      mockCreateCheckoutSession.mockRejectedValueOnce(new Error(errorMessage));
      const { POST } = await import('./route');
      const response = await POST(post({ plan: 'premium' }));
      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe(errorMessage);
      expect(mockPaymentHistoryRepository.createPayment).not.toHaveBeenCalled();
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
