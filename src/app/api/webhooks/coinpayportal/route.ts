/**
 * CoinPayPortal Webhook Route
 *
 * Receives payment notifications from CoinPayPortal and processes them
 * to update payment status and activate subscriptions.
 *
 * @route POST /api/webhooks/coinpayportal
 * @route GET /api/webhooks/coinpayportal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWebhookHandler } from '@/lib/coinpayportal/webhook-handler';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import type { WebhookPayload } from '@/lib/coinpayportal/types';

// ============================================================================
// Logging Utilities
// ============================================================================

const LOG_PREFIX = '[Webhook:CoinPayPortal]';

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log with structured format
 */
function log(
  requestId: string,
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  data?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: getTimestamp(),
    requestId,
    level,
    message: `${LOG_PREFIX} ${message}`,
    ...(data && { data }),
  };

  const logString = JSON.stringify(logEntry);

  switch (level) {
    case 'ERROR':
      console.error(logString);
      break;
    case 'WARN':
      console.warn(logString);
      break;
    case 'DEBUG':
      console.debug(logString);
      break;
    default:
      console.log(logString);
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * CoinPayPortal sends webhooks in a flat format:
 * {
 *   "event": "payment.forwarded",
 *   "payment_id": "uuid",
 *   "business_id": "uuid",
 *   "amount_crypto": "0.00154297",
 *   "currency": "ETH",
 *   "status": "forwarded",
 *   "timestamp": "2026-01-06T20:58:17.411Z"
 * }
 */
interface CoinPayPortalWebhookBody {
  // CoinPayPortal uses 'event' for the webhook type
  event?: string;
  // Legacy field name (keeping for backwards compatibility)
  type?: string;
  // Payment ID at root level
  payment_id?: string;
  // Business ID
  business_id?: string;
  // Amount in crypto
  amount_crypto?: string;
  // Amount in USD
  amount_usd?: string;
  // Cryptocurrency code (ETH, BTC, etc.)
  currency?: string;
  // Payment status
  status?: string;
  // Number of confirmations
  confirmations?: number;
  // Transaction hash (incoming payment)
  tx_hash?: string;
  // Merchant transaction hash (forwarded payment)
  merchant_tx_hash?: string;
  // Platform fee transaction hash
  platform_tx_hash?: string;
  // Error or info message
  message?: string;
  // Timestamp (CoinPayPortal uses 'timestamp')
  timestamp?: string;
  // Legacy field name
  created_at?: string;
  // Webhook ID
  id?: string;
  // Metadata passed when creating payment
  metadata?: Record<string, string>;
  // Legacy nested data format (for backwards compatibility)
  data?: {
    payment_id?: string;
    amount_crypto?: string;
    amount_usd?: string;
    currency?: string;
    status?: string;
    confirmations?: number;
    tx_hash?: string;
    merchant_tx_hash?: string;
    platform_tx_hash?: string;
    message?: string;
    metadata?: Record<string, string>;
  };
}

// ============================================================================
// Validation
// ============================================================================

function validateWebhookPayload(
  body: unknown,
  requestId: string
): { valid: true; payload: WebhookPayload } | { valid: false; error: string } {
  log(requestId, 'DEBUG', 'Starting payload validation');

  if (!body || typeof body !== 'object') {
    log(requestId, 'ERROR', 'Invalid request body - not an object', {
      bodyType: typeof body,
      bodyValue: body === null ? 'null' : body === undefined ? 'undefined' : 'other',
    });
    return { valid: false, error: 'Invalid request body' };
  }

  const rawData = body as CoinPayPortalWebhookBody;

  // CoinPayPortal uses 'event' instead of 'type'
  const eventType = rawData.event || rawData.type;

  // CoinPayPortal sends flat payloads, not nested in 'data'
  // Support both flat format and legacy nested format
  const paymentId = rawData.payment_id || rawData.data?.payment_id;
  const amountCrypto = rawData.amount_crypto || rawData.data?.amount_crypto;
  const amountUsd = rawData.amount_usd || rawData.data?.amount_usd;
  const currency = rawData.currency || rawData.data?.currency;
  const status = rawData.status || rawData.data?.status;
  const confirmations = rawData.confirmations ?? rawData.data?.confirmations;
  const txHash = rawData.tx_hash || rawData.data?.tx_hash;
  const merchantTxHash = rawData.merchant_tx_hash || rawData.data?.merchant_tx_hash;
  const platformTxHash = rawData.platform_tx_hash || rawData.data?.platform_tx_hash;
  const message = rawData.message || rawData.data?.message;
  const metadata = rawData.metadata || rawData.data?.metadata;
  const createdAt = rawData.timestamp || rawData.created_at;

  // Log the raw payload structure
  log(requestId, 'DEBUG', 'Raw payload received', {
    hasEvent: !!rawData.event,
    hasType: !!rawData.type,
    eventType,
    hasPaymentId: !!paymentId,
    paymentId,
    hasData: !!rawData.data,
    hasBusinessId: !!rawData.business_id,
    businessId: rawData.business_id,
    timestamp: rawData.timestamp,
    createdAt: rawData.created_at,
  });

  if (!eventType) {
    log(requestId, 'ERROR', 'Missing required field: event/type');
    return { valid: false, error: 'Missing required field: event/type' };
  }

  if (!paymentId) {
    log(requestId, 'ERROR', 'Missing required field: payment_id', {
      rawKeys: Object.keys(rawData),
    });
    return { valid: false, error: 'Missing required field: payment_id' };
  }

  // Validate type is one of the expected values
  const validTypes = [
    'payment.detected',
    'payment.confirmed',
    'payment.forwarded',
    'payment.failed',
    'payment.expired',
    'test.webhook',
  ];
  if (!validTypes.includes(eventType)) {
    log(requestId, 'ERROR', 'Invalid webhook type', {
      receivedType: eventType,
      validTypes,
    });
    return { valid: false, error: `Invalid webhook type: ${eventType}` };
  }

  log(requestId, 'INFO', 'Payload validation successful', {
    type: eventType,
    paymentId,
  });

  return {
    valid: true,
    payload: {
      id: rawData.id ?? '',
      type: eventType as WebhookPayload['type'],
      data: {
        payment_id: paymentId,
        amount_crypto: amountCrypto ?? '0',
        amount_usd: amountUsd ?? '0',
        currency: currency ?? '',
        status: status ?? '',
        confirmations,
        tx_hash: txHash,
        merchant_tx_hash: merchantTxHash,
        platform_tx_hash: platformTxHash,
        message,
        metadata,
      },
      created_at: createdAt ?? new Date().toISOString(),
      business_id: rawData.business_id ?? '',
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
  const requestId = generateRequestId();
  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // Log request metadata
  // -------------------------------------------------------------------------
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Don't log sensitive headers
    if (!key.toLowerCase().includes('authorization') && !key.toLowerCase().includes('cookie')) {
      headers[key] = value;
    }
  });

  log(requestId, 'INFO', '=== WEBHOOK REQUEST RECEIVED ===', {
    method: request.method,
    url: request.url,
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    contentType: request.headers.get('content-type') || 'unknown',
    contentLength: request.headers.get('content-length') || 'unknown',
  });

  log(requestId, 'DEBUG', 'Request headers', { headers });

  // -------------------------------------------------------------------------
  // Read raw body for signature verification
  // -------------------------------------------------------------------------
  let body: unknown;
  let rawBody: string;

  try {
    rawBody = await request.text();

    log(requestId, 'DEBUG', 'Raw request body', {
      length: rawBody.length,
      preview: rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''),
    });
  } catch (readError) {
    const errorMessage = readError instanceof Error ? readError.message : 'Unknown read error';
    log(requestId, 'ERROR', 'Failed to read request body', {
      error: errorMessage,
    });
    return NextResponse.json({ error: 'Failed to read request body', requestId }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Verify webhook signature
  // -------------------------------------------------------------------------
  const signatureHeader = request.headers.get('x-coinpay-signature');

  if (!signatureHeader) {
    log(requestId, 'ERROR', 'Missing X-CoinPay-Signature header');
    return NextResponse.json({ error: 'Missing signature', requestId }, { status: 401 });
  }

  try {
    const client = getCoinPayPortalClient();
    const isValid = client.verifyWebhookSignature(rawBody, signatureHeader);

    if (!isValid) {
      log(requestId, 'ERROR', 'Invalid webhook signature', {
        signatureHeader: signatureHeader.substring(0, 50) + '...',
      });
      return NextResponse.json({ error: 'Invalid signature', requestId }, { status: 401 });
    }

    log(requestId, 'INFO', 'Webhook signature verified successfully');
  } catch (signatureError) {
    const errorMessage = signatureError instanceof Error ? signatureError.message : 'Unknown signature error';
    log(requestId, 'ERROR', 'Signature verification failed', {
      error: errorMessage,
    });
    return NextResponse.json({ error: 'Signature verification failed', requestId }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse JSON body
  // -------------------------------------------------------------------------
  try {
    body = JSON.parse(rawBody);
    log(requestId, 'INFO', 'JSON body parsed successfully');
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
    log(requestId, 'ERROR', 'Failed to parse JSON body', {
      error: errorMessage,
      rawBodyPreview: rawBody?.substring(0, 200),
    });
    return NextResponse.json({ error: 'Invalid JSON body', requestId }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Validate payload structure
  // -------------------------------------------------------------------------
  log(requestId, 'INFO', 'Validating webhook payload...');
  const validation = validateWebhookPayload(body, requestId);

  if (!validation.valid) {
    log(requestId, 'ERROR', 'Payload validation failed', {
      error: validation.error,
      rawBody: rawBody?.substring(0, 1000),
    });
    return NextResponse.json({ error: validation.error, requestId }, { status: 400 });
  }

  const payload = validation.payload;

  // -------------------------------------------------------------------------
  // Log validated payload details
  // -------------------------------------------------------------------------
  log(requestId, 'INFO', '=== WEBHOOK PAYLOAD VALIDATED ===', {
    webhookId: payload.id,
    type: payload.type,
    paymentId: payload.data.payment_id,
    amountUsd: payload.data.amount_usd,
    amountCrypto: payload.data.amount_crypto,
    currency: payload.data.currency,
    status: payload.data.status,
    confirmations: payload.data.confirmations,
    txHash: payload.data.tx_hash,
    businessId: payload.business_id,
    createdAt: payload.created_at,
  });

  if (payload.data.metadata) {
    log(requestId, 'DEBUG', 'Webhook metadata', {
      metadata: payload.data.metadata,
    });
  }

  // -------------------------------------------------------------------------
  // Process the webhook
  // -------------------------------------------------------------------------
  log(requestId, 'INFO', 'Processing webhook with handler...');

  try {
    const handler = getWebhookHandler();
    log(requestId, 'DEBUG', 'Webhook handler obtained');

    const result = await handler.handleWebhook(payload);

    if (!result.success) {
      log(requestId, 'ERROR', '=== WEBHOOK HANDLER FAILED ===', {
        error: result.error,
        paymentId: result.paymentId,
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json({ success: false, error: result.error, requestId }, { status: 422 });
    }

    log(requestId, 'INFO', '=== WEBHOOK PROCESSED SUCCESSFULLY ===', {
      action: result.action,
      paymentId: result.paymentId,
      userId: result.userId,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      action: result.action,
      paymentId: result.paymentId,
      userId: result.userId,
      requestId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    log(requestId, 'ERROR', '=== WEBHOOK INTERNAL ERROR ===', {
      error: errorMessage,
      stack: errorStack,
      paymentId: payload.data.payment_id,
      type: payload.type,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({ error: 'Internal server error', requestId }, { status: 500 });
  }
}

/**
 * GET handler for webhook verification
 * Used to test that the webhook endpoint is reachable
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();

  log(requestId, 'INFO', 'Webhook endpoint health check', {
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
  });

  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/coinpayportal',
    message: 'CoinPayPortal webhook endpoint is reachable. Send POST requests with payment notifications.',
    timestamp: getTimestamp(),
    requestId,
  });
}
