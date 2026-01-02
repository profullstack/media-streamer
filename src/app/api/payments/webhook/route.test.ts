/**
 * CoinPayPortal Webhook Route Tests
 * 
 * Tests for the webhook endpoint that receives payment notifications
 * from CoinPayPortal and updates payment/subscription status.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import * as webhookHandlerModule from '@/lib/coinpayportal/webhook-handler';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// Mock the webhook handler module
vi.mock('@/lib/coinpayportal/webhook-handler', () => ({
  getWebhookHandler: vi.fn(),
}));

describe('POST /api/payments/webhook', () => {
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
    return new NextRequest('http://localhost:3000/api/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

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

  describe('successful webhook processing', () => {
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
  });

  describe('webhook validation errors', () => {
    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/payments/webhook', {
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
    });

    it('should return 400 for missing type field', async () => {
      const request = new NextRequest('http://localhost:3000/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'webhook-123',
          data: { payment_id: 'pay-456' },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: type');
    });

    it('should return 400 for missing data field', async () => {
      const request = new NextRequest('http://localhost:3000/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'webhook-123',
          type: 'payment.confirmed',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: data');
    });

    it('should return 400 for missing payment_id in data', async () => {
      const request = new NextRequest('http://localhost:3000/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'webhook-123',
          type: 'payment.confirmed',
          data: { amount_crypto: '0.001' },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: data.payment_id');
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
    });

    it('should return 500 when handler throws an error', async () => {
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockRejectedValue(new Error('Database connection failed'));

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('logging', () => {
    it('should log webhook receipt', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      await POST(request);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Webhook] Received payment.confirmed')
      );
      consoleSpy.mockRestore();
    });

    it('should log webhook processing result', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const payload = createValidPayload('payment.confirmed');
      mockHandleWebhook.mockResolvedValue({
        success: true,
        action: 'subscription_activated',
        paymentId: 'pay-456',
      });

      const request = createWebhookRequest(payload);
      await POST(request);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Webhook] Processed successfully')
      );
      consoleSpy.mockRestore();
    });
  });
});
