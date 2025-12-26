/**
 * Subscription Module
 * 
 * Manages trial and paid subscription logic.
 * No free tier - all users start with a 3-day trial.
 * After trial expires, users must pay via CoinPayPortal.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Trial duration in days
 */
export const TRIAL_DURATION_DAYS = 3;

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription tier - no free tier, only trial and paid plans
 */
export type SubscriptionTier = 'trial' | 'premium' | 'family';

/**
 * Subscription status
 */
export type SubscriptionStatusType = 'active' | 'cancelled' | 'expired';

/**
 * Detailed subscription status for UI
 */
export type SubscriptionStatus = 
  | 'trial_active'
  | 'trial_expired'
  | 'active'
  | 'expired'
  | 'cancelled';

/**
 * Subscription record
 */
export interface Subscription {
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatusType;
  trialStartedAt?: Date;
  trialExpiresAt?: Date;
  subscriptionExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Subscription features
 */
export interface SubscriptionFeatures {
  maxStreams: number;
  downloadEnabled: boolean;
  watchPartyEnabled: boolean;
  maxFamilyMembers: number;
}

// ============================================================================
// Feature Configuration
// ============================================================================

/**
 * Features by tier - trial has same features as premium
 */
const TIER_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  trial: {
    maxStreams: 3,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 0,
  },
  premium: {
    maxStreams: 3,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 0,
  },
  family: {
    maxStreams: 5,
    downloadEnabled: true,
    watchPartyEnabled: true,
    maxFamilyMembers: 10,
  },
};

// ============================================================================
// Trial Functions
// ============================================================================

/**
 * Calculate trial expiry date from start date
 */
export function calculateTrialExpiry(startDate: Date): Date {
  const expiry = new Date(startDate);
  expiry.setDate(expiry.getDate() + TRIAL_DURATION_DAYS);
  return expiry;
}

/**
 * Create a new trial subscription for a user
 */
export function createTrialSubscription(userId: string): Subscription {
  const now = new Date();
  const trialExpiresAt = calculateTrialExpiry(now);

  return {
    userId,
    tier: 'trial',
    status: 'active',
    trialStartedAt: now,
    trialExpiresAt,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check if trial is currently active
 */
export function isTrialActive(subscription: Subscription): boolean {
  if (subscription.tier !== 'trial') {
    return false;
  }

  if (!subscription.trialExpiresAt) {
    return false;
  }

  return subscription.trialExpiresAt.getTime() > Date.now();
}

/**
 * Check if trial has expired
 */
export function isTrialExpired(subscription: Subscription): boolean {
  if (subscription.tier !== 'trial') {
    return false;
  }

  if (!subscription.trialExpiresAt) {
    return false;
  }

  return subscription.trialExpiresAt.getTime() <= Date.now();
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(subscription: Subscription): number {
  if (subscription.tier !== 'trial' || !subscription.trialExpiresAt) {
    return 0;
  }

  const now = Date.now();
  const expiry = subscription.trialExpiresAt.getTime();

  if (expiry <= now) {
    return 0;
  }

  const msRemaining = expiry - now;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

// ============================================================================
// Subscription Functions
// ============================================================================

/**
 * Check if subscription is currently active
 */
export function isSubscriptionActive(subscription: Subscription): boolean {
  // Cancelled subscriptions are never active
  if (subscription.status === 'cancelled') {
    return false;
  }

  // Trial subscriptions
  if (subscription.tier === 'trial') {
    return isTrialActive(subscription);
  }

  // Paid subscriptions
  if (!subscription.subscriptionExpiresAt) {
    return false;
  }

  return subscription.subscriptionExpiresAt.getTime() > Date.now();
}

/**
 * Get detailed subscription status for UI
 */
export function getSubscriptionStatus(subscription: Subscription): SubscriptionStatus {
  // Cancelled
  if (subscription.status === 'cancelled') {
    return 'cancelled';
  }

  // Trial
  if (subscription.tier === 'trial') {
    return isTrialActive(subscription) ? 'trial_active' : 'trial_expired';
  }

  // Paid subscription
  if (!subscription.subscriptionExpiresAt) {
    return 'expired';
  }

  return subscription.subscriptionExpiresAt.getTime() > Date.now() ? 'active' : 'expired';
}

/**
 * Get features for subscription tier
 */
export function getSubscriptionFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  return TIER_FEATURES[tier];
}

/**
 * Upgrade subscription to paid tier
 */
export function upgradeSubscription(
  subscription: Subscription,
  tier: 'premium' | 'family',
  expiresAt: Date
): Subscription {
  return {
    ...subscription,
    tier,
    status: 'active',
    subscriptionExpiresAt: expiresAt,
    updatedAt: new Date(),
  };
}

/**
 * Cancel subscription
 */
export function cancelSubscription(subscription: Subscription): Subscription {
  return {
    ...subscription,
    status: 'cancelled',
    updatedAt: new Date(),
  };
}

/**
 * Renew subscription
 */
export function renewSubscription(
  subscription: Subscription,
  newExpiresAt: Date
): Subscription {
  return {
    ...subscription,
    status: 'active',
    subscriptionExpiresAt: newExpiresAt,
    updatedAt: new Date(),
  };
}

/**
 * Check if user can access features (active subscription required)
 */
export function canAccessFeatures(subscription: Subscription): boolean {
  return isSubscriptionActive(subscription);
}

/**
 * Get subscription days remaining
 */
export function getSubscriptionDaysRemaining(subscription: Subscription): number {
  if (subscription.tier === 'trial') {
    return getTrialDaysRemaining(subscription);
  }

  if (!subscription.subscriptionExpiresAt) {
    return 0;
  }

  const now = Date.now();
  const expiry = subscription.subscriptionExpiresAt.getTime();

  if (expiry <= now) {
    return 0;
  }

  const msRemaining = expiry - now;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}
