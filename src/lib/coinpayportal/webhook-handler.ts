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
      try {
        const paymentId = payload.data.payment_id;

        switch (payload.type) {
          case 'payment.detected':
            return await handlePaymentDetected(paymentRepo, payload);

          case 'payment.confirmed':
            return await handlePaymentConfirmed(paymentRepo, subscriptionRepo, payload);

          case 'payment.forwarded':
            return await handlePaymentForwarded(paymentRepo, payload);

          case 'payment.failed':
            return await handlePaymentFailed(paymentRepo, payload);

          case 'payment.expired':
            return await handlePaymentExpired(paymentRepo, payload);

          case 'test.webhook':
            return {
              success: true,
              action: 'test_acknowledged',
              paymentId,
            };

          default:
            return {
              success: false,
              error: `Unknown webhook type: ${payload.type}`,
              paymentId,
            };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

  await paymentRepo.updatePaymentStatus(payment_id, {
    status: 'detected',
    txHash: tx_hash,
    amountCrypto: amount_crypto,
    cryptoCurrency: currency,
    webhookEventType: 'payment.detected',
  });

  return {
    success: true,
    action: 'payment_updated',
    paymentId: payment_id,
  };
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
  const { payment_id, tx_hash, amount_crypto, currency } = payload.data;

  // Update payment status
  await paymentRepo.updatePaymentStatus(payment_id, {
    status: 'confirmed',
    txHash: tx_hash,
    amountCrypto: amount_crypto,
    cryptoCurrency: currency,
    webhookEventType: 'payment.confirmed',
  });

  // Get the payment record to find user and plan details
  const payment = await paymentRepo.getPaymentByExternalId(payment_id);
  
  if (!payment) {
    return {
      success: false,
      error: 'Payment record not found',
      paymentId: payment_id,
    };
  }

  // Calculate subscription period
  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + payment.duration_months);

  // Complete the payment with subscription period
  await paymentRepo.completePayment(payment_id, periodStart, periodEnd);

  // Activate the subscription
  await subscriptionRepo.activateSubscription(
    payment.user_id,
    payment.plan as PaymentPlan,
    payment.duration_months
  );

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
  const { payment_id, tx_hash } = payload.data;

  await paymentRepo.updatePaymentStatus(payment_id, {
    status: 'forwarded',
    txHash: tx_hash,
    webhookEventType: 'payment.forwarded',
  });

  return {
    success: true,
    action: 'payment_forwarded',
    paymentId: payment_id,
  };
}

/**
 * Handle payment.failed event
 * Payment has failed
 */
async function handlePaymentFailed(
  paymentRepo: PaymentHistoryRepository,
  payload: WebhookPayload
): Promise<WebhookHandlerResult> {
  const { payment_id } = payload.data;

  await paymentRepo.updatePaymentStatus(payment_id, {
    status: 'failed',
    webhookEventType: 'payment.failed',
  });

  return {
    success: true,
    action: 'payment_failed',
    paymentId: payment_id,
  };
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

  await paymentRepo.updatePaymentStatus(payment_id, {
    status: 'expired',
    webhookEventType: 'payment.expired',
  });

  return {
    success: true,
    action: 'payment_expired',
    paymentId: payment_id,
  };
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
    handlerInstance = createWebhookHandler(
      getPaymentHistoryRepository(),
      getSubscriptionRepository()
    );
  }
  return handlerInstance;
}

/**
 * Reset the handler instance (for testing)
 */
export function resetWebhookHandler(): void {
  handlerInstance = null;
}
