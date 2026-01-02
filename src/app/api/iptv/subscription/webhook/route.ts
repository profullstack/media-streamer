/**
 * IPTV Subscription Webhook Route
 * 
 * Receives payment notifications from CoinPayPortal and processes them
 * to create or extend IPTV subscriptions via ArgonTV.
 * 
 * @route POST /api/iptv/subscription/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getIPTVSubscriptionService,
  getIPTVSubscriptionRepository,
} from '@/lib/argontv';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// ============================================================================
// Types
// ============================================================================

interface WebhookRequestBody {
  id?: string;
  type?: string;
  data?: {
    payment_id?: string;
    amount_crypto?: string;
    amount_usd?: string;
    currency?: string;
    status?: string;
    confirmations?: number;
    tx_hash?: string;
    message?: string;
    metadata?: Record<string, string>;
  };
  created_at?: string;
  business_id?: string;
}

// ============================================================================
// Validation
// ============================================================================

function validateWebhookPayload(body: unknown): { valid: true; payload: WebhookPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const data = body as WebhookRequestBody;

  if (!data.type) {
    return { valid: false, error: 'Missing required field: type' };
  }

  if (!data.data) {
    return { valid: false, error: 'Missing required field: data' };
  }

  if (!data.data.payment_id) {
    return { valid: false, error: 'Missing required field: data.payment_id' };
  }

  // Validate type is one of the expected values
  const validTypes = ['payment.detected', 'payment.confirmed', 'payment.forwarded', 'payment.failed', 'payment.expired', 'test.webhook'];
  if (!validTypes.includes(data.type)) {
    return { valid: false, error: `Invalid webhook type: ${data.type}` };
  }

  return {
    valid: true,
    payload: {
      id: data.id ?? '',
      type: data.type as WebhookPayload['type'],
      data: {
        payment_id: data.data.payment_id,
        amount_crypto: data.data.amount_crypto ?? '0',
        amount_usd: data.data.amount_usd ?? '0',
        currency: data.data.currency ?? '',
        status: data.data.status ?? '',
        confirmations: data.data.confirmations,
        tx_hash: data.data.tx_hash,
        message: data.data.message,
        metadata: data.data.metadata,
      },
      created_at: data.created_at ?? new Date().toISOString(),
      business_id: data.business_id ?? '',
    },
  };
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * Handle incoming webhook from CoinPayPortal for IPTV payments
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;

  // Parse JSON body
  try {
    body = await request.json();
  } catch {
    console.error('[IPTV Webhook] Failed to parse JSON body');
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate payload structure
  const validation = validateWebhookPayload(body);
  if (!validation.valid) {
    console.error(`[IPTV Webhook] Validation failed: ${validation.error}`);
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const payload = validation.payload;
  console.log(`[IPTV Webhook] Received ${payload.type} for payment ${payload.data.payment_id}`);

  // Process the webhook
  try {
    const repository = getIPTVSubscriptionRepository();
    const service = getIPTVSubscriptionService();

    // Get the payment record
    const payment = await repository.getPaymentByExternalId(payload.data.payment_id);
    if (!payment) {
      console.error(`[IPTV Webhook] Payment not found: ${payload.data.payment_id}`);
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Handle different webhook types
    switch (payload.type) {
      case 'payment.detected': {
        // Payment detected but not yet confirmed
        await repository.updatePaymentStatus(payload.data.payment_id, {
          status: 'detected',
          amountCrypto: payload.data.amount_crypto,
          cryptoCurrency: payload.data.currency,
          webhookEventType: payload.type,
        });

        console.log(`[IPTV Webhook] Payment detected: ${payload.data.payment_id}`);
        return NextResponse.json({
          success: true,
          action: 'payment_detected',
          paymentId: payload.data.payment_id,
        });
      }

      case 'payment.confirmed':
      case 'payment.forwarded': {
        // Payment confirmed - create or extend subscription
        await repository.updatePaymentStatus(payload.data.payment_id, {
          status: 'confirmed',
          txHash: payload.data.tx_hash,
          amountCrypto: payload.data.amount_crypto,
          cryptoCurrency: payload.data.currency,
          webhookEventType: payload.type,
        });

        // Process the payment completion
        const result = await service.processPaymentCompletion(payload.data.payment_id);

        console.log(`[IPTV Webhook] Payment confirmed and processed: ${payload.data.payment_id}, action: ${result.action}`);
        return NextResponse.json({
          success: true,
          action: result.action,
          paymentId: payload.data.payment_id,
          subscriptionId: result.subscription?.id,
        });
      }

      case 'payment.failed': {
        // Payment failed
        await repository.updatePaymentStatus(payload.data.payment_id, {
          status: 'failed',
          webhookEventType: payload.type,
          metadata: { failureMessage: payload.data.message },
        });

        console.log(`[IPTV Webhook] Payment failed: ${payload.data.payment_id}`);
        return NextResponse.json({
          success: true,
          action: 'payment_failed',
          paymentId: payload.data.payment_id,
        });
      }

      case 'payment.expired': {
        // Payment expired
        await repository.updatePaymentStatus(payload.data.payment_id, {
          status: 'expired',
          webhookEventType: payload.type,
        });

        console.log(`[IPTV Webhook] Payment expired: ${payload.data.payment_id}`);
        return NextResponse.json({
          success: true,
          action: 'payment_expired',
          paymentId: payload.data.payment_id,
        });
      }

      case 'test.webhook': {
        // Test webhook - just acknowledge
        console.log(`[IPTV Webhook] Test webhook received`);
        return NextResponse.json({
          success: true,
          action: 'test_acknowledged',
        });
      }

      default: {
        console.log(`[IPTV Webhook] Unknown webhook type: ${payload.type}`);
        return NextResponse.json({
          success: false,
          error: `Unknown webhook type: ${payload.type}`,
        }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('[IPTV Webhook] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
