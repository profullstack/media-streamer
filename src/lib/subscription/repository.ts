/**
 * Subscription Repository
 * 
 * Server-side repository for managing user subscriptions in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  UserSubscription,
  UserSubscriptionInsert,
  PaymentPlan,
  SubscriptionTier,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription status result from database function
 */
export interface SubscriptionStatusResult {
  subscription_id: string;
  tier: string;
  status: string;
  is_active: boolean;
  days_remaining: number;
  expires_at: string | null;
  needs_renewal: boolean;
}

/**
 * Subscription needing renewal reminder
 */
export interface SubscriptionNeedingReminder {
  userId: string;
  tier: string;
  subscriptionExpiresAt: Date;
  daysUntilExpiry: number;
  userEmail: string;
}

/**
 * Subscription repository interface
 */
export interface SubscriptionRepository {
  getSubscription(userId: string): Promise<UserSubscription | null>;
  getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult | null>;
  createSubscription(userId: string, tier?: SubscriptionTier): Promise<UserSubscription>;
  activateSubscription(userId: string, tier: PaymentPlan, durationMonths?: number): Promise<UserSubscription>;
  cancelSubscription(userId: string): Promise<UserSubscription>;
  getSubscriptionsNeedingReminders(daysBefore: number): Promise<SubscriptionNeedingReminder[]>;
  markRenewalReminderSent(userId: string, daysBefore: number): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const TRIAL_DURATION_DAYS = 3;

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create a subscription repository instance
 */
export function createSubscriptionRepository(
  client: SupabaseClient<Database>
): SubscriptionRepository {
  return {
    /**
     * Get subscription for a user
     */
    async getSubscription(userId: string): Promise<UserSubscription | null> {
      const { data, error } = await client
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // PGRST116 = no rows found, which is not an error for us
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get computed subscription status using database function
     */
    async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult | null> {
      const { data, error } = await client.rpc('get_subscription_status', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Function returns an array, get first result
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return null;
      }

      return Array.isArray(data) ? data[0] : data;
    },

    /**
     * Create a new subscription for a user
     */
    async createSubscription(
      userId: string,
      tier: SubscriptionTier = 'trial'
    ): Promise<UserSubscription> {
      const now = new Date();
      
      const subscriptionData: UserSubscriptionInsert = {
        user_id: userId,
        tier,
        status: 'active',
      };

      if (tier === 'trial') {
        const trialExpiry = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
        subscriptionData.trial_started_at = now.toISOString();
        subscriptionData.trial_expires_at = trialExpiry.toISOString();
      } else {
        // For paid tiers, set subscription dates (default 12 months)
        const subscriptionExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        subscriptionData.subscription_started_at = now.toISOString();
        subscriptionData.subscription_expires_at = subscriptionExpiry.toISOString();
      }

      const { data, error } = await client
        .from('user_subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Activate subscription using database function
     * This handles extending existing subscriptions properly
     */
    async activateSubscription(
      userId: string,
      tier: PaymentPlan,
      durationMonths: number = 12
    ): Promise<UserSubscription> {
      const { data, error } = await client.rpc('activate_subscription', {
        p_user_id: userId,
        p_tier: tier,
        p_duration_months: durationMonths,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data as UserSubscription;
    },

    /**
     * Cancel a subscription
     */
    async cancelSubscription(userId: string): Promise<UserSubscription> {
      const { data, error } = await client
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get subscriptions that need renewal reminders
     */
    async getSubscriptionsNeedingReminders(
      daysBefore: number
    ): Promise<SubscriptionNeedingReminder[]> {
      const { data, error } = await client.rpc('get_subscriptions_needing_reminders', {
        p_days_before: daysBefore,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      // Transform snake_case to camelCase
      return data.map((row: {
        user_id: string;
        tier: string;
        subscription_expires_at: string;
        days_until_expiry: number;
        user_email: string;
      }) => ({
        userId: row.user_id,
        tier: row.tier,
        subscriptionExpiresAt: new Date(row.subscription_expires_at),
        daysUntilExpiry: row.days_until_expiry,
        userEmail: row.user_email,
      }));
    },

    /**
     * Mark renewal reminder as sent
     */
    async markRenewalReminderSent(userId: string, daysBefore: number): Promise<void> {
      const { error } = await client.rpc('mark_renewal_reminder_sent', {
        p_user_id: userId,
        p_days_before: daysBefore,
      });

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: SubscriptionRepository | null = null;

/**
 * Get the singleton subscription repository instance
 * Uses the server-side Supabase client
 */
export function getSubscriptionRepository(): SubscriptionRepository {
  if (!repositoryInstance) {
    repositoryInstance = createSubscriptionRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetSubscriptionRepository(): void {
  repositoryInstance = null;
}
