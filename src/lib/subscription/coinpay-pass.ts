/**
 * Profullstack Pass on bittorrented.com: a CoinPay user who deposited $99 into
 * their own CoinPay wallet gets a free month of Premium
 * (https://coinpayportal.com/pass).
 *
 * CoinPay reports the pass only in the userinfo `pass` claim at sign-in, so the
 * CoinPay callback applies it to the account bound to the CoinPay `sub`
 * (lib/coinpay-signin), never one found by email. It writes the same
 * user_subscriptions row a payment or an admin grant writes, so
 * isSubscriptionActive and every guard see it, with max semantics:
 *   tier                    = family while a family plan is running, else premium
 *   subscription_expires_at = the later of the running paid end and the pass end
 * Applying the same pass again, or one that ends sooner than a paid term,
 * changes nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoinpayPass } from '@profullstack/coinpay-onboard/pass';

export { PASS_URL } from '@profullstack/coinpay-onboard/pass';

export interface PassSubscriptionRow {
  tier: string | null;
  status: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
}

export interface PassUpdate {
  tier: 'premium' | 'family';
  status: 'active';
  subscription_started_at: string;
  subscription_expires_at: string;
}

/** What to write for this pass, or null when it would not extend paid access. */
export function passSubscriptionUpdate(
  existing: PassSubscriptionRow | null,
  pass: CoinpayPass | null | undefined,
  now = Date.now(),
): PassUpdate | null {
  if (!pass?.active || !pass.expiresAt) return null;
  const end = pass.expiresAt.getTime();
  if (!Number.isFinite(end) || end <= now) return null;
  const paidTier = existing?.tier === 'premium' || existing?.tier === 'family';
  const currentEnd = existing?.subscription_expires_at ? Date.parse(existing.subscription_expires_at) : NaN;
  const running = paidTier && existing?.status === 'active' && Number.isFinite(currentEnd) && currentEnd > now;
  if (running && currentEnd >= end) return null;
  return {
    tier: running && existing?.tier === 'family' ? 'family' : 'premium',
    status: 'active',
    subscription_started_at:
      running && existing?.subscription_started_at ? existing.subscription_started_at : new Date(now).toISOString(),
    subscription_expires_at: pass.expiresAt.toISOString(),
  };
}

/** Applies an active pass to the user's subscription. Returns the new end, or null when unchanged. */
export async function applyCoinpayPass(
  client: SupabaseClient,
  userId: string,
  pass: CoinpayPass | null | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!userId || !pass?.active) return null;
  const { data } = await client
    .from('user_subscriptions')
    .select('tier, status, subscription_started_at, subscription_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  const update = passSubscriptionUpdate((data as PassSubscriptionRow | null) ?? null, pass, now);
  if (!update) return null;
  const { error } = await client.from('user_subscriptions').upsert(
    {
      user_id: userId,
      ...update,
      renewal_reminder_sent_at: null,
      renewal_reminder_7d_sent: false,
      renewal_reminder_3d_sent: false,
      renewal_reminder_1d_sent: false,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`coinpay pass: ${error.message}`);
  return update.subscription_expires_at;
}
