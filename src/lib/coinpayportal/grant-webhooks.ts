/**
 * Pass/grant payments (VOD, seedbox rentals, IPTV resale passes) settled from
 * the ONE CoinPay webhook.
 *
 * CoinPay delivers every event for a business to that business's single
 * webhook_url (https://bittorrented.com/api/webhooks/coinpayportal); the
 * per-payment `webhook_url` these checkouts used to send is not where events
 * go. So the main route reads `metadata.type` and hands the event to the
 * matching grant handler here. Each handler is idempotent on the CoinPay
 * payment id: a grant flips to paid once (a conditional update), so a
 * redelivery or confirmed-then-forwarded pair credits the provider once.
 */

import { handleVodWebhook } from '@/lib/vod';
import { handleShareWebhook } from '@/lib/seedbox/shares';
import { handleIptvShareWebhook } from '@/lib/iptv/shares';

/** The `metadata.type` each grant checkout sets, as stored on the CoinPay payment. */
export const GRANT_KINDS = ['vod', 'seedbox_share', 'iptv_share'] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export function grantKindOf(metadata: Record<string, unknown> | null | undefined): GrantKind | null {
  const type = metadata?.type;
  return typeof type === 'string' && (GRANT_KINDS as readonly string[]).includes(type) ? (type as GrantKind) : null;
}

export interface GrantWebhookInput {
  type: string;
  paymentId: string;
  amountCrypto?: string | null;
  currency?: string | null;
  blockchain?: string | null;
  txHash?: string | null;
}

export interface GrantWebhookOutcome {
  handled: boolean;
  action: string;
  grantId?: string;
}

export async function dispatchGrantWebhook(kind: GrantKind, input: GrantWebhookInput): Promise<GrantWebhookOutcome> {
  const payload = {
    type: input.type,
    paymentId: input.paymentId,
    amountCrypto: input.amountCrypto ?? null,
    currency: input.currency ?? null,
    blockchain: input.blockchain ?? input.currency ?? null,
    txHash: input.txHash ?? null,
  };
  switch (kind) {
    case 'vod':
      return handleVodWebhook(payload);
    case 'seedbox_share':
      return handleShareWebhook(payload);
    case 'iptv_share':
      return handleIptvShareWebhook(payload);
  }
}
