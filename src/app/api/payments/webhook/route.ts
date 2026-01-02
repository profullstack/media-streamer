/**
 * CoinPayPortal Webhook Route
 * 
 * Receives payment notifications from CoinPayPortal and processes them
 * to update payment status and activate subscriptions.
 * 
 * @route POST /api/payments/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWebhookHandler } from '@/lib/coinpayportal/webhook-handler';
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
 * Handle incoming webhook from CoinPayPortal
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;

  // Parse JSON body
  try {
    body = await request.json();
  } catch {
    console.error('[Webhook] Failed to parse JSON body');
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate payload structure
  const validation = validateWebhookPayload(body);
  if (!validation.valid) {
    console.error(`[Webhook] Validation failed: ${validation.error}`);
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const payload = validation.payload;
  console.log(`[Webhook] Received ${payload.type} for payment ${payload.data.payment_id}`);

  // Process the webhook
  try {
    const handler = getWebhookHandler();
    const result = await handler.handleWebhook(payload);

    if (!result.success) {
      console.error(`[Webhook] Handler failed: ${result.error}`);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    console.log(`[Webhook] Processed successfully: ${result.action} for payment ${result.paymentId}`);
    return NextResponse.json({
      success: true,
      action: result.action,
      paymentId: result.paymentId,
      userId: result.userId,
    });
  } catch (error) {
    console.error('[Webhook] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
