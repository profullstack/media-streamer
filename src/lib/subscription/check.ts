/**
 * Subscription Check Helper
 * 
 * Server-side utility to check if a user's subscription is currently active.
 */

import { getServerClient } from '@/lib/supabase/client';

export interface SubscriptionCheckResult {
  active: boolean;
  tier: string | null;
  expired: boolean;
  trialExpired: boolean;
  expiresAt: string | null;
}

/**
 * Check if a user's subscription is currently active.
 * For trial: checks trial_expires_at < now
 * For premium/family: checks subscription_expires_at < now
 */
export async function isSubscriptionActive(userId: string): Promise<SubscriptionCheckResult> {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('tier, status, trial_expires_at, subscription_expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { active: false, tier: null, expired: false, trialExpired: false, expiresAt: null };
  }

  const now = new Date();
  const tier = data.tier as string;

  if (tier === 'trial') {
    const trialExpiry = data.trial_expires_at ? new Date(data.trial_expires_at) : null;
    const trialExpired = trialExpiry ? trialExpiry < now : false;
    return {
      active: !trialExpired && data.status === 'active',
      tier,
      expired: trialExpired,
      trialExpired,
      expiresAt: data.trial_expires_at,
    };
  }

  // premium or family
  const subExpiry = data.subscription_expires_at ? new Date(data.subscription_expires_at) : null;
  const expired = subExpiry ? subExpiry < now : false;
  return {
    active: !expired && data.status === 'active',
    tier,
    expired,
    trialExpired: false,
    expiresAt: data.subscription_expires_at,
  };
}
