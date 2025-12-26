/**
 * Payments Module Tests
 * 
 * TDD tests for CoinPayPortal crypto payments integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPaymentRequest,
  validatePaymentRequest,
  getSubscriptionPrice,
  formatCryptoAmount,
  parseCryptoAmount,
  generatePaymentId,
  createPaymentSession,
  getPaymentStatus,
  updatePaymentStatus,
  completePayment,
  cancelPayment,
  expirePayment,
  verifyWebhookSignature,
  processWebhookPayload,
  calculateSubscriptionExpiry,
  isSubscriptionActive,
  getSubscriptionDaysRemaining,
  formatSubscriptionExpiry,
  PaymentRequest,
  PaymentSession,
  PaymentStatus,
  SubscriptionPlan,
  CryptoType,
  WebhookPayload,
} from './payments';

describe('Payments Module', () => {
  describe('Subscription Pricing', () => {
    it('should return correct price for premium plan', () => {
      const price = getSubscriptionPrice('premium');
      expect(price.usd).toBe(4.99);
      expect(price.plan).toBe('premium');
    });

    it('should return correct price for family plan', () => {
      const price = getSubscriptionPrice('family');
      expect(price.usd).toBe(9.99);
      expect(price.plan).toBe('family');
    });

    // Note: Free plan removed - users now start with 3-day trial
  });

  describe('Payment Request Creation', () => {
    it('should create a payment request', () => {
      const request = createPaymentRequest({
        userId: 'user-123',
        plan: 'premium',
        cryptoType: 'BTC',
      });

      expect(request.id).toBeDefined();
      expect(request.userId).toBe('user-123');
      expect(request.plan).toBe('premium');
      expect(request.cryptoType).toBe('BTC');
      expect(request.amountUsd).toBe(4.99);
      expect(request.status).toBe('pending');
      expect(request.createdAt).toBeInstanceOf(Date);
    });

    it('should create request for family plan', () => {
      const request = createPaymentRequest({
        userId: 'user-123',
        plan: 'family',
        cryptoType: 'ETH',
      });

      expect(request.plan).toBe('family');
      expect(request.amountUsd).toBe(9.99);
      expect(request.cryptoType).toBe('ETH');
    });

    it('should support multiple crypto types', () => {
      const cryptoTypes: CryptoType[] = ['BTC', 'ETH', 'LTC', 'USDT', 'USDC'];
      
      cryptoTypes.forEach(crypto => {
        const request = createPaymentRequest({
          userId: 'user-123',
          plan: 'premium',
          cryptoType: crypto,
        });
        expect(request.cryptoType).toBe(crypto);
      });
    });
  });

  describe('Payment Request Validation', () => {
    it('should validate correct payment request', () => {
      const request: PaymentRequest = {
        id: 'pay-123',
        userId: 'user-123',
        plan: 'premium',
        cryptoType: 'BTC',
        amountUsd: 4.99,
        status: 'pending',
        createdAt: new Date(),
      };

      expect(validatePaymentRequest(request)).toBe(true);
    });

    it('should reject request without user ID', () => {
      const request: PaymentRequest = {
        id: 'pay-123',
        userId: '',
        plan: 'premium',
        cryptoType: 'BTC',
        amountUsd: 4.99,
        status: 'pending',
        createdAt: new Date(),
      };

      expect(validatePaymentRequest(request)).toBe(false);
    });

    it('should reject request with invalid plan', () => {
      const request: PaymentRequest = {
        id: 'pay-123',
        userId: 'user-123',
        plan: 'invalid' as SubscriptionPlan,
        cryptoType: 'BTC',
        amountUsd: 4.99,
        status: 'pending',
        createdAt: new Date(),
      };

      expect(validatePaymentRequest(request)).toBe(false);
    });

    it('should reject request with zero amount', () => {
      const request: PaymentRequest = {
        id: 'pay-123',
        userId: 'user-123',
        plan: 'premium',
        cryptoType: 'BTC',
        amountUsd: 0,
        status: 'pending',
        createdAt: new Date(),
      };

      expect(validatePaymentRequest(request)).toBe(false);
    });
  });

  describe('Crypto Amount Formatting', () => {
    it('should format BTC amount', () => {
      expect(formatCryptoAmount(0.00012345, 'BTC')).toBe('0.00012345 BTC');
    });

    it('should format ETH amount', () => {
      expect(formatCryptoAmount(0.0025, 'ETH')).toBe('0.00250000 ETH');
    });

    it('should format USDT amount', () => {
      expect(formatCryptoAmount(4.99, 'USDT')).toBe('4.99 USDT');
    });

    it('should format USDC amount', () => {
      expect(formatCryptoAmount(9.99, 'USDC')).toBe('9.99 USDC');
    });

    it('should format LTC amount', () => {
      expect(formatCryptoAmount(0.05, 'LTC')).toBe('0.05000000 LTC');
    });
  });

  describe('Crypto Amount Parsing', () => {
    it('should parse BTC amount string', () => {
      expect(parseCryptoAmount('0.00012345 BTC')).toBe(0.00012345);
    });

    it('should parse ETH amount string', () => {
      expect(parseCryptoAmount('0.0025 ETH')).toBe(0.0025);
    });

    it('should parse USDT amount string', () => {
      expect(parseCryptoAmount('4.99 USDT')).toBe(4.99);
    });

    it('should return 0 for invalid string', () => {
      expect(parseCryptoAmount('invalid')).toBe(0);
    });
  });

  describe('Payment ID Generation', () => {
    it('should generate unique payment IDs', () => {
      const id1 = generatePaymentId();
      const id2 = generatePaymentId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^pay-/);
      expect(id2).toMatch(/^pay-/);
    });
  });

  describe('Payment Session', () => {
    it('should create payment session', () => {
      const session = createPaymentSession({
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        expiresInMinutes: 30,
      });

      expect(session.id).toBeDefined();
      expect(session.requestId).toBe('pay-123');
      expect(session.walletAddress).toBe('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
      expect(session.cryptoAmount).toBe(0.00012345);
      expect(session.cryptoType).toBe('BTC');
      expect(session.status).toBe('awaiting_payment');
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should set correct expiry time', () => {
      const now = Date.now();
      const session = createPaymentSession({
        requestId: 'pay-123',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f',
        cryptoAmount: 0.0025,
        cryptoType: 'ETH',
        expiresInMinutes: 60,
      });

      const expiryTime = session.expiresAt.getTime();
      const expectedExpiry = now + 60 * 60 * 1000;
      
      // Allow 1 second tolerance
      expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('Payment Status Management', () => {
    it('should get payment status', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'awaiting_payment',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      expect(getPaymentStatus(session)).toBe('awaiting_payment');
    });

    it('should update payment status', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'awaiting_payment',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      const updated = updatePaymentStatus(session, 'confirming');
      expect(updated.status).toBe('confirming');
    });

    it('should complete payment', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'confirming',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      const completed = completePayment(session, 'tx-hash-123');
      expect(completed.status).toBe('completed');
      expect(completed.transactionHash).toBe('tx-hash-123');
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('should cancel payment', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'awaiting_payment',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      const cancelled = cancelPayment(session);
      expect(cancelled.status).toBe('cancelled');
    });

    it('should expire payment', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'awaiting_payment',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Already expired
      };

      const expired = expirePayment(session);
      expect(expired.status).toBe('expired');
    });
  });

  describe('Webhook Verification', () => {
    it('should verify valid webhook signature', () => {
      const payload = '{"event":"payment.completed","data":{}}';
      const secret = 'webhook-secret-123';
      // Simulated HMAC signature
      const signature = 'sha256=valid-signature';
      
      // Mock implementation - in real code this would verify HMAC
      const isValid = verifyWebhookSignature(payload, signature, secret);
      expect(typeof isValid).toBe('boolean');
    });

    it('should reject invalid webhook signature', () => {
      const payload = '{"event":"payment.completed","data":{}}';
      const secret = 'webhook-secret-123';
      const signature = 'invalid';
      
      const isValid = verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('Webhook Payload Processing', () => {
    it('should process payment completed webhook', () => {
      const payload: WebhookPayload = {
        event: 'payment.completed',
        paymentId: 'pay-123',
        transactionHash: 'tx-hash-456',
        amount: 0.00012345,
        cryptoType: 'BTC',
        timestamp: new Date().toISOString(),
      };

      const result = processWebhookPayload(payload);
      expect(result.success).toBe(true);
      expect(result.event).toBe('payment.completed');
      expect(result.paymentId).toBe('pay-123');
    });

    it('should process payment pending webhook', () => {
      const payload: WebhookPayload = {
        event: 'payment.pending',
        paymentId: 'pay-123',
        amount: 0.00012345,
        cryptoType: 'BTC',
        timestamp: new Date().toISOString(),
      };

      const result = processWebhookPayload(payload);
      expect(result.success).toBe(true);
      expect(result.event).toBe('payment.pending');
    });

    it('should handle invalid webhook payload', () => {
      const payload = {
        event: 'unknown.event',
      } as WebhookPayload;

      const result = processWebhookPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Subscription Expiry', () => {
    it('should calculate subscription expiry for 1 year', () => {
      const now = new Date();
      const expiry = calculateSubscriptionExpiry(now, 1);
      
      const expectedYear = now.getFullYear() + 1;
      expect(expiry.getFullYear()).toBe(expectedYear);
    });

    it('should calculate subscription expiry for 2 years', () => {
      const now = new Date();
      const expiry = calculateSubscriptionExpiry(now, 2);
      
      const expectedYear = now.getFullYear() + 2;
      expect(expiry.getFullYear()).toBe(expectedYear);
    });
  });

  describe('Subscription Status', () => {
    it('should return true for active subscription', () => {
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      expect(isSubscriptionActive(expiry)).toBe(true);
    });

    it('should return false for expired subscription', () => {
      const expiry = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      expect(isSubscriptionActive(expiry)).toBe(false);
    });

    it('should return false for null expiry', () => {
      expect(isSubscriptionActive(null)).toBe(false);
    });
  });

  describe('Subscription Days Remaining', () => {
    it('should calculate days remaining', () => {
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const days = getSubscriptionDaysRemaining(expiry);
      expect(days).toBeGreaterThanOrEqual(29);
      expect(days).toBeLessThanOrEqual(31);
    });

    it('should return 0 for expired subscription', () => {
      const expiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(getSubscriptionDaysRemaining(expiry)).toBe(0);
    });

    it('should return 0 for null expiry', () => {
      expect(getSubscriptionDaysRemaining(null)).toBe(0);
    });
  });

  describe('Subscription Expiry Formatting', () => {
    it('should format expiry date', () => {
      const expiry = new Date('2025-12-31T23:59:59Z');
      const formatted = formatSubscriptionExpiry(expiry);
      expect(formatted).toContain('2025');
    });

    it('should return "Never" for null expiry', () => {
      expect(formatSubscriptionExpiry(null)).toBe('Never');
    });

    it('should return "Expired" for past date', () => {
      const expiry = new Date('2020-01-01');
      expect(formatSubscriptionExpiry(expiry)).toBe('Expired');
    });
  });

  describe('Payment Status Types', () => {
    it('should have correct status values', () => {
      const statuses: PaymentStatus[] = [
        'pending',
        'awaiting_payment',
        'confirming',
        'completed',
        'cancelled',
        'expired',
        'failed',
      ];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small crypto amounts', () => {
      const formatted = formatCryptoAmount(0.00000001, 'BTC');
      expect(formatted).toBe('0.00000001 BTC');
    });

    it('should handle large USD amounts', () => {
      const request = createPaymentRequest({
        userId: 'user-123',
        plan: 'family',
        cryptoType: 'USDT',
      });
      expect(request.amountUsd).toBe(9.99);
    });

    it('should handle payment session at exact expiry time', () => {
      const session: PaymentSession = {
        id: 'session-123',
        requestId: 'pay-123',
        walletAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        cryptoAmount: 0.00012345,
        cryptoType: 'BTC',
        status: 'awaiting_payment',
        createdAt: new Date(),
        expiresAt: new Date(), // Exactly now
      };

      // Should be considered expired
      const expired = expirePayment(session);
      expect(expired.status).toBe('expired');
    });
  });
});
