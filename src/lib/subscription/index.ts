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

// Repository exports (server-side only)
export {
  // Types
  type SubscriptionRepository,
  type SubscriptionStatusResult,
  type SubscriptionNeedingReminder,
  
  // Factory function
  createSubscriptionRepository,
  
  // Singleton accessors
  getSubscriptionRepository,
  resetSubscriptionRepository,
} from './repository';

// Renewal notification exports (server-side only)
export {
  // Types
  type EmailSender,
  type RenewalReminderResult,
  type AllRemindersResult,
  type RenewalStatus,
  type RenewalNotificationConfig,
  type RenewalNotificationService,
  
  // Factory function
  createRenewalNotificationService,
  createConsoleEmailSender,
  
  // Singleton accessors
  setEmailSender,
  getRenewalNotificationService,
  resetRenewalNotificationService,
} from './renewal-notifications';
