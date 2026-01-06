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

  const data = body as WebhookRequestBody;

  // Log the raw payload structure
  log(requestId, 'DEBUG', 'Raw payload received', {
    hasId: !!data.id,
    hasType: !!data.type,
    type: data.type,
    hasData: !!data.data,
    hasBusinessId: !!data.business_id,
    businessId: data.business_id,
    createdAt: data.created_at,
  });

  if (!data.type) {
    log(requestId, 'ERROR', 'Missing required field: type');
    return { valid: false, error: 'Missing required field: type' };
  }

  if (!data.data) {
    log(requestId, 'ERROR', 'Missing required field: data');
    return { valid: false, error: 'Missing required field: data' };
  }

  if (!data.data.payment_id) {
    log(requestId, 'ERROR', 'Missing required field: data.payment_id', {
      dataKeys: Object.keys(data.data),
    });
    return { valid: false, error: 'Missing required field: data.payment_id' };
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
  if (!validTypes.includes(data.type)) {
    log(requestId, 'ERROR', 'Invalid webhook type', {
      receivedType: data.type,
      validTypes,
    });
    return { valid: false, error: `Invalid webhook type: ${data.type}` };
  }

  log(requestId, 'INFO', 'Payload validation successful', {
    type: data.type,
    paymentId: data.data.payment_id,
  });

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
  // Parse JSON body
  // -------------------------------------------------------------------------
  let body: unknown;
  let rawBody: string | undefined;

  try {
    // Clone the request to read raw body for logging
    const clonedRequest = request.clone();
    rawBody = await clonedRequest.text();

    log(requestId, 'DEBUG', 'Raw request body', {
      length: rawBody.length,
      preview: rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''),
    });

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
