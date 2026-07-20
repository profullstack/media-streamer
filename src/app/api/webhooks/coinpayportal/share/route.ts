/**
 * CoinPayPortal webhook — seedbox rentals.
 *
 * Receives payment notifications for seedbox-rental session passes (the
 * `webhookUrl` set at checkout points here). Verifies the signature, then flips
 * the matching grant to `paid` (setting its expiry from the rental's window) or
 * `expired`. Idempotent on the CoinPay payment id.
 *
 * Mirrors the signature-verifying pattern of the subscription webhook at
 * ../route.ts, but dispatches to the seedbox-rental handler.
 *
 * @route POST /api/webhooks/coinpayportal/share
 * @route GET  /api/webhooks/coinpayportal/share
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import { handleShareWebhook } from '@/lib/seedbox/shares';

const LOG_PREFIX = '[Webhook:SeedboxRental]';

interface FlatWebhookBody {
  event?: string;
  type?: string;
  payment_id?: string;
  amount_crypto?: string;
  currency?: string;
  blockchain?: string;
  tx_hash?: string;
  metadata?: Record<string, string>;
  data?: {
    payment_id?: string;
    amount_crypto?: string;
    currency?: string;
    blockchain?: string;
    tx_hash?: string;
    metadata?: Record<string, string>;
  };
}

const VALID_TYPES = new Set([
  'payment.detected',
  'payment.confirmed',
  'payment.forwarded',
  'payment.failed',
  'payment.expired',
  'test.webhook',
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 });
  }

  const signature = request.headers.get('x-coinpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }
  try {
    if (!getCoinPayPortalClient().verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  let body: FlatWebhookBody;
  try {
    body = JSON.parse(rawBody) as FlatWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = body.event || body.type;
  const paymentId = body.payment_id || body.data?.payment_id;
  const metadata = body.metadata || body.data?.metadata;

  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `Invalid webhook type: ${type ?? 'none'}` }, { status: 400 });
  }
  if (type === 'test.webhook') {
    return NextResponse.json({ success: true, action: 'test' }, { status: 200 });
  }
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment_id' }, { status: 400 });
  }
  // Defense in depth: only handle rental payments (the endpoint is dedicated,
  // but guard against misrouted events).
  if (metadata && metadata.type && metadata.type !== 'seedbox_share') {
    return NextResponse.json({ success: true, action: 'ignored:not_rental' }, { status: 200 });
  }

  try {
    const outcome = await handleShareWebhook({
      type,
      paymentId,
      amountCrypto: body.amount_crypto || body.data?.amount_crypto || null,
      currency: body.currency || body.data?.currency || null,
      blockchain: body.blockchain || body.data?.blockchain || body.currency || null,
      txHash: body.tx_hash || body.data?.tx_hash || null,
    });

    if (!outcome.handled) {
      console.warn(`${LOG_PREFIX} unhandled`, { type, paymentId, action: outcome.action });
      return NextResponse.json({ success: false, action: outcome.action }, { status: 422 });
    }
    console.log(`${LOG_PREFIX} ${outcome.action}`, {
      paymentId,
      grantId: outcome.grantId,
      ms: Date.now() - startedAt,
    });
    return NextResponse.json(
      { success: true, action: outcome.action, grantId: outcome.grantId },
      { status: 200 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} error`, { type, paymentId, error: detail });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/coinpayportal/share',
    message: 'Seedbox-rental webhook endpoint is reachable.',
  });
}
