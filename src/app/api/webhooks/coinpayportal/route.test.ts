/**
 * CoinPayPortal Webhook Route Tests
 *
 * Tests for the webhook endpoint that receives payment notifications
 * from CoinPayPortal and updates payment/subscription status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import * as webhookHandlerModule from '@/lib/coinpayportal/webhook-handler';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// Mock the webhook handler module
vi.mock('@/lib/coinpayportal/webhook-handler', () => ({
  getWebhookHandler: vi.fn(),
}));

describe('POST /api/webhooks/coinpayportal', () => {
  const mockHandleWebhook = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(webhookHandlerModule.getWebhookHandler).mockReturnValue({
      handleWebhook: mockHandleWebhook,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWebhookRequest(payload: WebhookPayload): NextRequest {
    return new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  describe('webhook validation errors', () => {
    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
      expect(data.requestId).toBeDefined();
    });

    it('should return 400 for missing event/type field', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_id: 'pay-456',
          business_id: 'biz-789',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: event/type');
    });

    it('should return 400 for missing payment_id', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'payment.confirmed',
          business_id: 'biz-789',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: payment_id');
    });

    it('should return 400 for invalid webhook type', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/coinpayportal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'webhook-123',
          type: 'invalid.type',
          data: { payment_id: 'pay-456' },
        }),
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
