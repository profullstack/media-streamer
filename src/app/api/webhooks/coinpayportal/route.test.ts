/**
 * CoinPayPortal Webhook Route Tests
 *
 * Tests for the webhook endpoint that receives payment notifications
 * from CoinPayPortal and updates payment/subscription status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST, GET } from './route';
import * as webhookHandlerModule from '@/lib/coinpayportal/webhook-handler';
import * as clientModule from '@/lib/coinpayportal/client';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// Mock the webhook handler module
vi.mock('@/lib/coinpayportal/webhook-handler', () => ({
  getWebhookHandler: vi.fn(),
}));

// Mock the CoinPayPortal client module
vi.mock('@/lib/coinpayportal/client', () => ({
  getCoinPayPortalClient: vi.fn(),
}));

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

/**
 * Generate a valid signature header for testing
 */
function generateSignature(payload: string, secret: string = TEST_WEBHOOK_SECRET): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('POST /api/webhooks/coinpayportal', () => {
  const mockHandleWebhook = vi.fn();
  const mockVerifyWebhookSignature = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(webhookHandlerModule.getWebhookHandler).mockReturnValue({
      handleWebhook: mockHandleWebhook,
    });
    // Default: signature verification passes
    mockVerifyWebhookSignature.mockReturnValue(true);
    vi.mocked(clientModule.getCoinPayPortalClient).mockReturnValue({
      verifyWebhookSignature: mockVerifyWebhookSignature,
    } as unknown as ReturnType<typeof clientModule.getCoinPayPortalClient>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWebhookRequest(payload: WebhookPayload): NextRequest {
    const body = JSON.stringify(payload);
    return new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CoinPay-Signature': generateSignature(body),
      },
      body,
    });
  }

  /**
   * Create a payload in CoinPayPortal's actual flat format
   */
  function createFlatPayload(
    event: string = 'payment.confirmed',
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      event,
      payment_id: 'pay-456',
      business_id: 'biz-789',
      amount_crypto: '0.001',
      amount_usd: '50.00',
      currency: 'BTC',
      status: 'confirmed',
      tx_hash: 'tx-abc123',
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Create a payload in the legacy nested format (for backwards compatibility tests)
   */
  function createValidPayload(
    type: WebhookPayload['type'] = 'payment.confirmed',
    overrides: Partial<WebhookPayload['data']> = {}
  ): WebhookPayload {
    return {
      id: 'webhook-123',
      type,
      data: {
        payment_id: 'pay-456',
        amount_crypto: '0.001',
        amount_usd: '50.00',
        currency: 'BTC',
        status: 'confirmed',
        tx_hash: 'tx-abc123',
        ...overrides,
      },
      created_at: new Date().toISOString(),
      business_id: 'biz-789',
    };
  }

  describe('CoinPayPortal flat format webhooks', () => {
    it('should process flat format payment.confirmed webhook', async () => {
      const payload = createFlatPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
        userId: 'user-123',
      });

      const body = JSON.stringify(payload);
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('subscription_activated');
    });

    it('should process flat format payment.forwarded webhook', async () => {
      const payload = createFlatPayload('payment.forwarded', { status: 'forwarded' });
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_forwarded',
        paymentId: 'pay-456',
      });

      const body = JSON.stringify(payload);
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('payment_forwarded');
    });

    it('should process flat format payment.detected webhook', async () => {
      const payload = createFlatPayload('payment.detected', { status: 'detected' });
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_updated',
        paymentId: 'pay-456',
      });

      const body = JSON.stringify(payload);
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('successful webhook processing (legacy nested format)', () => {
    it('should process payment.confirmed webhook and return 200', async () => {
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
        userId: 'user-123',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('subscription_activated');
      expect(data.requestId).toBeDefined();
      expect(mockHandleWebhook).toHaveBeenCalledWith(payload);
    });

    it('should process payment.detected webhook and return 200', async () => {
      const payload = createValidPayload('payment.detected');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_updated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('payment_updated');
    });

    it('should process payment.forwarded webhook and return 200', async () => {
      const payload = createValidPayload('payment.forwarded');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_forwarded',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('payment_forwarded');
    });

    it('should process payment.failed webhook and return 200', async () => {
      const payload = createValidPayload('payment.failed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_failed',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('payment_failed');
    });

    it('should process payment.expired webhook and return 200', async () => {
      const payload = createValidPayload('payment.expired');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'payment_expired',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('payment_expired');
    });

    it('should process test.webhook and return 200', async () => {
      const payload = createValidPayload('test.webhook');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'test_acknowledged',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe('test_acknowledged');
    });

    it('should include requestId in successful response', async () => {
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
        userId: 'user-123',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(data.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });

  describe('signature verification', () => {
    it('should return 401 for missing signature header', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'payment.confirmed', data: { payment_id: 'pay-456' } }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing signature');
      expect(data.requestId).toBeDefined();
    });

    it('should return 401 for invalid signature', async () => {
      mockVerifyWebhookSignature.mockReturnValue(false);

      const body = JSON.stringify({ type: 'payment.confirmed', data: { payment_id: 'pay-456' } });
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': 't=123,v1=invalidsignature',
        },
        body,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
      expect(data.requestId).toBeDefined();
    });

    it('should pass when signature is valid', async () => {
      mockVerifyWebhookSignature.mockReturnValue(true);
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockVerifyWebhookSignature).toHaveBeenCalled();
    });
  });

  describe('webhook validation errors', () => {
    it('should return 400 for invalid JSON body', async () => {
      const body = 'invalid json';
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
      expect(data.requestId).toBeDefined();
    });

    it('should return 400 for missing event/type field', async () => {
      const body = JSON.stringify({
        payment_id: 'pay-456',
        business_id: 'biz-789',
      });
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: event/type');
    });

    it('should return 400 for missing payment_id', async () => {
      const body = JSON.stringify({
        event: 'payment.confirmed',
        business_id: 'biz-789',
      });
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: payment_id');
    });

    it('should return 400 for invalid webhook type', async () => {
      const body = JSON.stringify({
        id: 'webhook-123',
        type: 'invalid.type',
        data: { payment_id: 'pay-456' },
      });
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CoinPay-Signature': generateSignature(body),
        },
        body,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid webhook type: invalid.type');
    });
  });

  describe('webhook handler errors', () => {
    it('should return 422 when handler returns success: false', async () => {
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: false,
        error: 'Payment record not found',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Payment record not found');
      expect(data.requestId).toBeDefined();
    });

    it('should return 500 when handler throws an error', async () => {
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockRejectedValue(new Error('Database connection failed'));

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.requestId).toBeDefined();
    });
  });

  describe('logging', () => {
    it('should log webhook receipt with structured JSON', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      await POST(request);

      // Check that structured JSON logs were created
      const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
      const webhookReceivedLog = logCalls.find(
        (log) => typeof log === 'string' && log.includes('WEBHOOK REQUEST RECEIVED')
      );
      expect(webhookReceivedLog).toBeDefined();

      // Verify it's valid JSON
      if (webhookReceivedLog) {
        const parsed = JSON.parse(webhookReceivedLog);
        expect(parsed.requestId).toBeDefined();
        expect(parsed.level).toBe('INFO');
        expect(parsed.message).toContain('[Webhook:CoinPayPortal]');
      }

      consoleSpy.mockRestore();
    });

    it('should log successful processing', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      await POST(request);

      const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
      const successLog = logCalls.find(
        (log) => typeof log === 'string' && log.includes('WEBHOOK PROCESSED SUCCESSFULLY')
      );
      expect(successLog).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should log errors with ERROR level', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockRejectedValue(new Error('Database error'));

      const request = createWebhookRequest(payload);
      await POST(request);

      const errorCalls = consoleErrorSpy.mock.calls.map((call) => call[0]);
      const internalErrorLog = errorCalls.find(
        (log) => typeof log === 'string' && log.includes('WEBHOOK INTERNAL ERROR')
      );
      expect(internalErrorLog).toBeDefined();

      if (internalErrorLog) {
        const parsed = JSON.parse(internalErrorLog);
        expect(parsed.level).toBe('ERROR');
        expect(parsed.data.error).toBe('Database error');
      }

      consoleErrorSpy.mockRestore();
    });
  });
});

describe('GET /api/webhooks/coinpayportal', () => {
  it('should return health check response', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.endpoint).toBe('/api/webhooks/coinpayportal');
    expect(data.message).toContain('CoinPayPortal webhook endpoint is reachable');
    expect(data.timestamp).toBeDefined();
    expect(data.requestId).toBeDefined();
  });

  it('should log health check requests', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
      },
    });

    await GET(request);

    const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
    const healthCheckLog = logCalls.find(
      (log) => typeof log === 'string' && log.includes('health check')
    );
    expect(healthCheckLog).toBeDefined();

    consoleSpy.mockRestore();
  });
});
