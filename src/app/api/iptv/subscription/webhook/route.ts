/**
 * IPTV Subscription Webhook Route
 * 
 * Receives payment notifications from CoinPayPortal and processes them
 * to create or extend IPTV subscriptions via ArgonTV.
 * 
 * @route POST /api/iptv/subscription/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { processIptvWebhook } from '@/lib/argontv/webhook';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import { adoptSessionPayment } from '@/lib/coinpayportal/session-payments';
import { getServerClient } from '@/lib/supabase/client';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// ============================================================================
// Types
// ============================================================================

interface WebhookData {
  payment_id?: string;
  amount_crypto?: string;
  amount_usd?: string;
  currency?: string;
  status?: string;
  confirmations?: number;
  tx_hash?: string;
  message?: string;
  metadata?: Record<string, string>;
  checkout_session_id?: string;
}

interface WebhookRequestBody extends WebhookData {
  id?: string;
  type?: string;
  event?: string;
  data?: WebhookData;
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

  const raw = body as WebhookRequestBody;
  // CoinPay nests the payment under `data` (the top-level id is the EVENT);
  // the older test sender is flat.
  const d: WebhookData = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const data = { type: raw.type || raw.event, data: d, id: raw.id, created_at: raw.created_at, business_id: raw.business_id };

  if (!data.type) {
    return { valid: false, error: 'Missing required field: type' };
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
        checkout_session_id: data.data.checkout_session_id,
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
 * Handle incoming webhook from CoinPayPortal for IPTV payments.
 * Signed like every CoinPay webhook; an unsigned body is refused (it used to
 * be trusted, which would have handed out IPTV lines for a forged POST).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text().catch(() => '');
  const signature = request.headers.get('x-coinpay-signature');
  let verified = false;
  try {
    verified = !!signature && getCoinPayPortalClient().verifyWebhookSignature(rawBody, signature);
  } catch {
    verified = false;
  }
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error('[IPTV Webhook] Failed to parse JSON body');
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validateWebhookPayload(body);
  if (!validation.valid) {
    console.error(`[IPTV Webhook] Validation failed: ${validation.error}`);
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const payload = validation.payload;
  console.log(`[IPTV Webhook] Received ${payload.type} for payment ${payload.data.payment_id}`);

  try {
    const adopted = await adoptSessionPayment(getServerClient(), payload);
    if (adopted.abandonedAttempt) {
      return NextResponse.json({ success: true, action: 'session_attempt_ignored', paymentId: payload.data.payment_id });
    }
    const result = await processIptvWebhook(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[IPTV Webhook] Internal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
