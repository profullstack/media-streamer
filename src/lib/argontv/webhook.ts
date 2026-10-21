/**
 * IPTV payment webhooks: what a CoinPay event does to an IPTV payment row.
 *
 * Shared by /api/webhooks/coinpayportal (where CoinPay actually delivers: it
 * sends every event to the business webhook URL, whatever the payment asked
 * for) and the older /api/iptv/subscription/webhook. Callers verify the
 * X-CoinPay-Signature first and resolve a checkout session to its payment
 * (adoptSessionPayment) before calling this.
 *
 * Fulfilment runs once per payment: confirmed and then forwarded both arrive
 * for one payment, and each would otherwise extend the ArgonTV line again.
 */

import type { WebhookPayload } from '@/lib/coinpayportal/types';
import { getServerClient } from '@/lib/supabase/client';
import { getIPTVSubscriptionRepository, type IPTVSubscriptionRepository } from './repository';
import { getIPTVSubscriptionService, type IPTVSubscriptionService } from './service';

export interface IptvWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleIptvWebhook(
  payload: WebhookPayload,
  repository: IPTVSubscriptionRepository,
  service: IPTVSubscriptionService,
  markFulfilled: (paymentRowId: string, metadata: Record<string, unknown>) => Promise<void>
): Promise<IptvWebhookResult> {
  const paymentId = payload.data.payment_id;
  const payment = await repository.getPaymentByExternalId(paymentId);
  if (!payment) {
    return { status: 404, body: { success: false, error: 'Payment not found' } };
  }

  switch (payload.type) {
    case 'payment.detected': {
      await repository.updatePaymentStatus(paymentId, {
        status: 'detected',
        amountCrypto: payload.data.amount_crypto,
        cryptoCurrency: payload.data.currency,
        webhookEventType: payload.type,
      });
      return { status: 200, body: { success: true, action: 'payment_detected', paymentId } };
    }

    case 'payment.confirmed':
    case 'payment.forwarded': {
      const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
      if (metadata.fulfilledAt) {
        return { status: 200, body: { success: true, action: 'already_fulfilled', paymentId } };
      }
      await repository.updatePaymentStatus(paymentId, {
        status: 'confirmed',
        txHash: payload.data.tx_hash,
        amountCrypto: payload.data.amount_crypto,
        cryptoCurrency: payload.data.currency,
        webhookEventType: payload.type,
      });
      const result = await service.processPaymentCompletion(paymentId);
      await markFulfilled(payment.id, { ...metadata, fulfilledAt: new Date().toISOString(), fulfilledBy: payload.type });
      return {
        status: 200,
        body: { success: true, action: result.action, paymentId, subscriptionId: result.subscription?.id },
      };
    }

    case 'payment.failed': {
      await repository.updatePaymentStatus(paymentId, {
        status: 'failed',
        webhookEventType: payload.type,
        metadata: { ...((payment.metadata ?? {}) as Record<string, unknown>), failureMessage: payload.data.message },
      });
      return { status: 200, body: { success: true, action: 'payment_failed', paymentId } };
    }

    case 'payment.expired': {
      await repository.updatePaymentStatus(paymentId, { status: 'expired', webhookEventType: payload.type });
      return { status: 200, body: { success: true, action: 'payment_expired', paymentId } };
    }

    case 'test.webhook':
      return { status: 200, body: { success: true, action: 'test_acknowledged' } };

    default:
      return { status: 400, body: { success: false, error: `Unknown webhook type: ${payload.type}` } };
  }
}

/** handleIptvWebhook with the real repository, service and database. */
export async function processIptvWebhook(payload: WebhookPayload): Promise<IptvWebhookResult> {
  return handleIptvWebhook(payload, getIPTVSubscriptionRepository(), getIPTVSubscriptionService(), async (id, metadata) => {
    const { error } = await getServerClient()
      .from('iptv_payment_history')
      .update({ metadata: metadata as never })
      .eq('id', id);
    if (error) throw new Error(error.message);
  });
}
