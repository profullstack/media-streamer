/**
 * CoinPay hosted checkout sessions: settling the payment a session produced.
 *
 * A checkout opens a session (cs_...), not a payment: the buyer picks a coin or
 * PayPal on CoinPay, and only then does a payment id exist. So the local row
 * (payment_history or iptv_payment_history) is created keyed by the session id,
 * and the first webhook that carries `checkout_session_id` re-keys it to the
 * real payment id. From there the existing payment-id webhook handlers run
 * unchanged, and payments opened before sessions keep settling as they did.
 *
 * Only an event that means money is moving (detected/confirmed/forwarded)
 * re-keys: an abandoned attempt inside the session (the buyer picked one coin,
 * then another) expires on its own and must not claim the row.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCheckoutSessionId } from './client';
import type { WebhookPayload } from './types';

export type SessionPaymentTable = 'payment_history' | 'iptv_payment_history';
const TABLES: SessionPaymentTable[] = ['payment_history', 'iptv_payment_history'];
const ADOPTING = new Set(['payment.detected', 'payment.confirmed', 'payment.forwarded']);

export interface AdoptResult {
  /** The table whose row now carries the payment id, or null when none matched. */
  table: SessionPaymentTable | null;
  /** True when this call moved the row from the session id to the payment id. */
  rekeyed: boolean;
  /** The event is an abandoned attempt inside a session whose row is still open. */
  abandonedAttempt: boolean;
}

/**
 * Find the local row for a webhook, re-keying a session row to its payment id
 * when this event is the session's payment arriving.
 */
export async function adoptSessionPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  payload: Pick<WebhookPayload, 'type'> & { data: Pick<WebhookPayload['data'], 'payment_id' | 'checkout_session_id' | 'currency'> }
): Promise<AdoptResult> {
  const paymentId = payload.data.payment_id;
  const sessionId = payload.data.checkout_session_id;

  for (const table of TABLES) {
    const { data } = await db.from(table).select('id').eq('coinpayportal_payment_id', paymentId).maybeSingle();
    if (data) return { table, rekeyed: false, abandonedAttempt: false };
  }
  if (!isCheckoutSessionId(sessionId)) return { table: null, rekeyed: false, abandonedAttempt: false };

  for (const table of TABLES) {
    const { data: row } = await db.from(table).select('id').eq('coinpayportal_payment_id', sessionId).maybeSingle();
    if (!row) continue;
    if (!ADOPTING.has(payload.type)) return { table: null, rekeyed: false, abandonedAttempt: true };
    const update: Record<string, unknown> = { coinpayportal_payment_id: paymentId };
    if (payload.data.currency) update.blockchain = payload.data.currency;
    const { data: moved, error } = await db
      .from(table)
      .update(update)
      .eq('id', (row as { id: string }).id)
      .eq('coinpayportal_payment_id', sessionId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (moved) return { table, rekeyed: true, abandonedAttempt: false };
    // A concurrent delivery re-keyed it first.
    const { data: again } = await db.from(table).select('id').eq('coinpayportal_payment_id', paymentId).maybeSingle();
    return { table: again ? table : null, rekeyed: false, abandonedAttempt: false };
  }
  return { table: null, rekeyed: false, abandonedAttempt: false };
}
