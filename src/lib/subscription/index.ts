/**
 * Subscription Module
 * 
 * Exports subscription management functions and types.
 */

export {
  // Constants
  TRIAL_DURATION_DAYS,
  
  // Types
  type SubscriptionTier,
  type SubscriptionStatusType,
  type SubscriptionStatus,
  type Subscription,
  type SubscriptionFeatures,
  
  // Trial functions
  calculateTrialExpiry,
  createTrialSubscription,
  isTrialActive,
  isTrialExpired,
  getTrialDaysRemaining,
  
  // Subscription functions
  isSubscriptionActive,
  getSubscriptionStatus,
  getSubscriptionFeatures,
  upgradeSubscription,
  cancelSubscription,
  renewSubscription,
  canAccessFeatures,
  getSubscriptionDaysRemaining,
} from './subscription';
