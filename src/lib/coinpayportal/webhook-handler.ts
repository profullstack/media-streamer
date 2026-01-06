/**
 * CoinPayPortal Webhook Handler
 *
 * Handles incoming webhooks from CoinPayPortal and persists payment data
 * to the database, activating subscriptions when payments are confirmed.
 */

import type { WebhookPayload } from './types';
import type { PaymentHistoryRepository } from '../payments/repository';
import type { SubscriptionRepository } from '../subscription/repository';
import type { PaymentPlan } from '../supabase/types';

// ============================================================================
// Logging
// ============================================================================

const LOG_PREFIX = '[Webhook:Handler]';

function getTimestamp(): string {
  return new Date().toISOString();
}

function log(
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  data?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: getTimestamp(),
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
 * Result of processing a webhook
 */
export interface WebhookHandlerResult {
  success: boolean;
  action?: string;
  error?: string;
  paymentId?: string;
  userId?: string;
}

/**
 * Webhook handler interface
 */
export interface WebhookHandler {
  handleWebhook(payload: WebhookPayload): Promise<WebhookHandlerResult>;
}

// ============================================================================
// Webhook Handler Implementation
// ============================================================================

/**
 * Create a webhook handler instance
 */
export function createWebhookHandler(
  paymentRepo: PaymentHistoryRepository,
  subscriptionRepo: SubscriptionRepository
): WebhookHandler {
  return {
    async handleWebhook(payload: WebhookPayload): Promise<WebhookHandlerResult> {
      const paymentId = payload.data.payment_id;

      log('INFO', '=== WEBHOOK HANDLER INVOKED ===', {
        type: payload.type,
        paymentId,
        webhookId: payload.id,
      });

      try {
        switch (payload.type) {
          case 'payment.detected':
            log('INFO', 'Routing to handlePaymentDetected', { paymentId });
            return await handlePaymentDetected(paymentRepo, payload);

          case 'payment.confirmed':
            log('INFO', 'Routing to handlePaymentConfirmed', { paymentId });
            return await handlePaymentConfirmed(paymentRepo, subscriptionRepo, payload);

          case 'payment.forwarded':
            log('INFO', 'Routing to handlePaymentForwarded', { paymentId });
            return await handlePaymentForwarded(paymentRepo, payload);

          case 'payment.failed':
            log('INFO', 'Routing to handlePaymentFailed', { paymentId });
            return await handlePaymentFailed(paymentRepo, payload);

          case 'payment.expired':
            log('INFO', 'Routing to handlePaymentExpired', { paymentId });
            return await handlePaymentExpired(paymentRepo, payload);

          case 'test.webhook':
            log('INFO', 'Test webhook received - acknowledging', { paymentId });
            return {
              success: true,
              action: 'test_acknowledged',
              paymentId,
            };

          default:
            log('WARN', 'Unknown webhook type received', {
              type: payload.type,
              paymentId,
            });
            return {
              success: false,
              error: `Unknown webhook type: ${payload.type}`,
              paymentId,
            };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        log('ERROR', '=== WEBHOOK HANDLER EXCEPTION ===', {
          error: errorMessage,
          stack: errorStack,
          type: payload.type,
          paymentId,
        });

        return {
          success: false,
          error: errorMessage,
          paymentId: payload.data.payment_id,
        };
      }
    },
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle payment.detected event
 * Payment has been detected on the blockchain but not yet confirmed
 */
async function handlePaymentDetected(
  paymentRepo: PaymentHistoryRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id, tx_hash, amount_crypto, currency } = payload.data;

  log('INFO', 'Processing payment.detected', {
    paymentId: payment_id,
    txHash: tx_hash,
    amountCrypto: amount_crypto,
    currency,
  });

  try {
    log('DEBUG', 'Calling paymentRepo.updatePaymentStatus', {
      paymentId: payment_id,
      newStatus: 'detected',
    });

    await paymentRepo.updatePaymentStatus(payment_id, {
      status: 'detected',
      txHash: tx_hash,
      amountCrypto: amount_crypto,
      cryptoCurrency: currency,
      webhookEventType: 'payment.detected',
    });

    log('INFO', 'payment.detected processed successfully', {
      paymentId: payment_id,
    });

    return {
      success: true,
      action: 'payment_updated',
      paymentId: payment_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Failed to process payment.detected', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Handle payment.confirmed event
 * Payment has been confirmed - activate the subscription
 */
async function handlePaymentConfirmed(
  paymentRepo: PaymentHistoryRepository,
  subscriptionRepo: SubscriptionRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id, tx_hash, amount_crypto, currency, confirmations } = payload.data;

  log('INFO', '=== PROCESSING PAYMENT CONFIRMED ===', {
    paymentId: payment_id,
    txHash: tx_hash,
    amountCrypto: amount_crypto,
    currency,
    confirmations,
  });

  // Step 1: Update payment status
  try {
    log('DEBUG', 'Step 1: Updating payment status to confirmed', {
      paymentId: payment_id,
    });

    await paymentRepo.updatePaymentStatus(payment_id, {
      status: 'confirmed',
      txHash: tx_hash,
      amountCrypto: amount_crypto,
      cryptoCurrency: currency,
      webhookEventType: 'payment.confirmed',
    });

    log('INFO', 'Step 1 complete: Payment status updated', {
      paymentId: payment_id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Step 1 failed: Could not update payment status', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }

  // Step 2: Get the payment record to find user and plan details
  let payment;
  try {
    log('DEBUG', 'Step 2: Fetching payment record from database', {
      paymentId: payment_id,
    });

    payment = await paymentRepo.getPaymentByExternalId(payment_id);

    if (!payment) {
      log('ERROR', 'Step 2 failed: Payment record not found', {
        paymentId: payment_id,
      });
      return {
        success: false,
        error: 'Payment record not found',
        paymentId: payment_id,
      };
    }

    log('INFO', 'Step 2 complete: Payment record retrieved', {
      paymentId: payment_id,
      internalPaymentId: payment.id,
      userId: payment.user_id,
      plan: payment.plan,
      durationMonths: payment.duration_months,
      amountUsd: payment.amount_usd,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Step 2 failed: Database error fetching payment', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }

  // Step 3: Calculate subscription period
  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + payment.duration_months);

  log('INFO', 'Step 3: Subscription period calculated', {
    paymentId: payment_id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    durationMonths: payment.duration_months,
  });

  // Step 4: Complete the payment with subscription period
  try {
    log('DEBUG', 'Step 4: Completing payment with period dates', {
      paymentId: payment_id,
    });

    await paymentRepo.completePayment(payment_id, periodStart, periodEnd);

    log('INFO', 'Step 4 complete: Payment completed', {
      paymentId: payment_id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Step 4 failed: Could not complete payment', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }

  // Step 5: Activate the subscription
  try {
    log('DEBUG', 'Step 5: Activating subscription', {
      userId: payment.user_id,
      plan: payment.plan,
      durationMonths: payment.duration_months,
    });

    await subscriptionRepo.activateSubscription(
      payment.user_id,
      payment.plan as PaymentPlan,
      payment.duration_months
    );

    log('INFO', '=== SUBSCRIPTION ACTIVATED SUCCESSFULLY ===', {
      paymentId: payment_id,
      userId: payment.user_id,
      plan: payment.plan,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Step 5 failed: Could not activate subscription', {
      paymentId: payment_id,
      userId: payment.user_id,
      plan: payment.plan,
      error: errorMessage,
    });
    throw error;
  }

  return {
    success: true,
    action: 'subscription_activated',
    paymentId: payment_id,
    userId: payment.user_id,
  };
}

/**
 * Handle payment.forwarded event
 * Payment has been forwarded to the merchant wallet
 */
async function handlePaymentForwarded(
  paymentRepo: PaymentHistoryRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id, tx_hash, merchant_tx_hash, platform_tx_hash } = payload.data;

  log('INFO', 'Processing payment.forwarded', {
    paymentId: payment_id,
    txHash: tx_hash,
    merchantTxHash: merchant_tx_hash,
    platformTxHash: platform_tx_hash,
  });

  try {
    await paymentRepo.updatePaymentStatus(payment_id, {
      status: 'forwarded',
      txHash: tx_hash,
      merchantTxHash: merchant_tx_hash,
      platformTxHash: platform_tx_hash,
      webhookEventType: 'payment.forwarded',
    });

    log('INFO', 'payment.forwarded processed successfully', {
      paymentId: payment_id,
    });

    return {
      success: true,
      action: 'payment_forwarded',
      paymentId: payment_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Failed to process payment.forwarded', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Handle payment.failed event
 * Payment has failed
 */
async function handlePaymentFailed(
  paymentRepo: PaymentHistoryRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id, message } = payload.data;

  log('INFO', 'Processing payment.failed', {
    paymentId: payment_id,
    message,
  });

  try {
    await paymentRepo.updatePaymentStatus(payment_id, {
      status: 'failed',
      webhookEventType: 'payment.failed',
    });

    log('INFO', 'payment.failed processed successfully', {
      paymentId: payment_id,
    });

    return {
      success: true,
      action: 'payment_failed',
      paymentId: payment_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Failed to process payment.failed', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Handle payment.expired event
 * Payment has expired without being completed
 */
async function handlePaymentExpired(
  paymentRepo: PaymentHistoryRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id } = payload.data;

  log('INFO', 'Processing payment.expired', {
    paymentId: payment_id,
  });

  try {
    await paymentRepo.updatePaymentStatus(payment_id, {
      status: 'expired',
      webhookEventType: 'payment.expired',
    });

    log('INFO', 'payment.expired processed successfully', {
      paymentId: payment_id,
    });

    return {
      success: true,
      action: 'payment_expired',
      paymentId: payment_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Failed to process payment.expired', {
      paymentId: payment_id,
      error: errorMessage,
    });
    throw error;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getPaymentHistoryRepository } from '../payments/repository';
import { getSubscriptionRepository } from '../subscription/repository';

let handlerInstance: WebhookHandler | null = null;

/**
 * Get the singleton webhook handler instance
 */
export function getWebhookHandler(): WebhookHandler {
  if (!handlerInstance) {
    log('DEBUG', 'Creating new webhook handler instance');
    handlerInstance = createWebhookHandler(getPaymentHistoryRepository(), getSubscriptionRepository());
  }
  return handlerInstance;
}

/**
 * Reset the handler instance (for testing)
 */
export function resetWebhookHandler(): void {
  log('DEBUG', 'Resetting webhook handler instance');
  handlerInstance = null;
}
