/**
 * CoinPayPortal Client Tests
 * 
 * Tests for the CoinPayPortal API client library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { CoinPayPortalClient, getCoinPayPortalClient, resetCoinPayPortalClient } from './client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CoinPayPortalClient', () => {
  let client: CoinPayPortalClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new CoinPayPortalClient({
      apiKey: 'cp_test_key',
      businessId: 'test-business-id',
      webhookSecret: 'test-webhook-secret',
    });
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const mockResponse = {
        success: true,
        payment: {
          id: 'pay_123',
          business_id: 'test-business-id',
          payment_address: 'bc1qtest123',
          amount: 10,
          currency: 'USD',
          crypto_amount: '0.00025',
          blockchain: 'BTC',
          status: 'pending',
          expires_at: '2024-01-01T01:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.createPayment({
        amount: 10,
        blockchain: 'BTC',
        description: 'Test payment',
      });

      expect(result.success).toBe(true);
      expect(result.payment.id).toBe('pay_123');
      expect(result.paymentUrl).toBe('https://coinpayportal.com/pay/pay_123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://coinpayportal.com/api/payments/create',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer cp_test_key',
          }),
        })
      );
    });

    it('should include metadata in payment request', async () => {
      const mockResponse = {
        success: true,
        payment: {
          id: 'pay_456',
          business_id: 'test-business-id',
          payment_address: 'bc1qtest456',
          amount: 5,
          currency: 'USD',
          crypto_amount: '0.00012',
          blockchain: 'BTC',
          status: 'pending',
          expires_at: '2024-01-01T01:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.createPayment({
        amount: 5,
        blockchain: 'BTC',
        metadata: { orderId: 'order-123', userId: 'user-456' },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.metadata).toEqual({ orderId: 'order-123', userId: 'user-456' });
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid amount' }),
      });

      await expect(client.createPayment({
        amount: -10,
        blockchain: 'BTC',
      })).rejects.toThrow('CoinPayPortal API error: 400 - Invalid amount');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.createPayment({
        amount: 10,
        blockchain: 'BTC',
      })).rejects.toThrow('Network error');
    });
  });

  describe('getPaymentStatus', () => {
    it('should get payment status successfully', async () => {
      const mockResponse = {
        success: true,
        payment: {
          id: 'pay_123',
          status: 'confirmed',
          tx_hash: '0xabc123',
          confirmed_at: '2024-01-01T00:30:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getPaymentStatus('pay_123');

      expect(result.success).toBe(true);
      expect(result.payment.status).toBe('confirmed');
      expect(result.payment.tx_hash).toBe('0xabc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://coinpayportal.com/api/payments/pay_123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer cp_test_key',
          }),
        })
      );
    });

    it('should throw error for non-existent payment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Payment not found' }),
      });

      await expect(client.getPaymentStatus('invalid_id')).rejects.toThrow(
        'CoinPayPortal API error: 404 - Payment not found'
      );
    });
  });

  describe('getPaymentUrl', () => {
    it('should return correct payment URL', () => {
      const url = client.getPaymentUrl('pay_123');
      expect(url).toBe('https://coinpayportal.com/pay/pay_123');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ type: 'payment.confirmed', data: {} });
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(signedPayload)
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ type: 'payment.confirmed', data: {} });
      const signatureHeader = `t=${timestamp},v1=invalidsignature`;

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);
      expect(isValid).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
      const payload = JSON.stringify({ type: 'payment.confirmed', data: {} });
      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(signedPayload)
        .digest('hex');

      const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

      const isValid = client.verifyWebhookSignature(payload, signatureHeader);
      expect(isValid).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const signature = 'somesignature';
      const signatureHeader = `v1=${signature}`;

      const isValid = client.verifyWebhookSignature('{}', signatureHeader);
      expect(isValid).toBe(false);
    });

    it('should reject missing signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signatureHeader = `t=${timestamp}`;

      const isValid = client.verifyWebhookSignature('{}', signatureHeader);
      expect(isValid).toBe(false);
    });
  });

  describe('parseWebhook', () => {
    it('should parse valid webhook payload', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'payment.confirmed',
        data: { payment_id: 'pay_123' },
        created_at: '2024-01-01T00:00:00.000Z',
        business_id: 'test-business-id',
      });
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(signedPayload)
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const result = client.parseWebhook(payload, signatureHeader);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('payment.confirmed');
      expect(result?.data.payment_id).toBe('pay_123');
    });

    it('should return null for invalid signature', () => {
      const payload = JSON.stringify({ type: 'payment.confirmed' });
      const signatureHeader = 't=123,v1=invalid';

      const result = client.parseWebhook(payload, signatureHeader);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = 'not valid json';
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(signedPayload)
        .digest('hex');

      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const result = client.parseWebhook(payload, signatureHeader);
      expect(result).toBeNull();
    });
  });
});

describe('getCoinPayPortalClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetCoinPayPortalClient();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetCoinPayPortalClient();
  });

  it('should throw error when API key is missing', () => {
    process.env.COINPAYPORTAL_API_KEY = '';
    process.env.COINPAYPORTAL_BUSINESS_ID = 'test-business';
    process.env.COINPAYPORTAL_WEBHOOK_SECRET = 'test-secret';

    expect(() => getCoinPayPortalClient()).toThrow('Missing CoinPayPortal configuration');
  });

  it('should throw error when business ID is missing', () => {
    process.env.COINPAYPORTAL_API_KEY = 'test-key';
    process.env.COINPAYPORTAL_BUSINESS_ID = '';
    process.env.COINPAYPORTAL_WEBHOOK_SECRET = 'test-secret';

    expect(() => getCoinPayPortalClient()).toThrow('Missing CoinPayPortal configuration');
  });

  it('should create client with valid configuration', () => {
    process.env.COINPAYPORTAL_API_KEY = 'cp_test_key';
    process.env.COINPAYPORTAL_BUSINESS_ID = 'test-business-id';
    process.env.COINPAYPORTAL_WEBHOOK_SECRET = 'test-secret';

    const client = getCoinPayPortalClient();
    expect(client).toBeInstanceOf(CoinPayPortalClient);
  });

  it('should return same instance on subsequent calls', () => {
    process.env.COINPAYPORTAL_API_KEY = 'cp_test_key';
    process.env.COINPAYPORTAL_BUSINESS_ID = 'test-business-id';
    process.env.COINPAYPORTAL_WEBHOOK_SECRET = 'test-secret';

    const client1 = getCoinPayPortalClient();
    const client2 = getCoinPayPortalClient();
    expect(client1).toBe(client2);
  });
});
