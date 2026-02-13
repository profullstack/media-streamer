/**
 * IPTV Subscription Service
 * 
 * Business logic for IPTV subscription management
 */

import type { ArgonTVClient } from './client';
import type { IPTVSubscriptionRepository, GetUserPaymentsOptions } from './repository';
import type { IptvSubscription, IptvPaymentHistory } from '../supabase/types';
import {
  ARGONTV_PACKAGES,
  PACKAGE_DURATION_DAYS,
  getAllPackagePrices,
  type ArgonTVPackageKey,
  type IPTVPackagePrice,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface UserSubscriptionInfo {
  subscription: IptvSubscription;
  isActive: boolean;
  daysRemaining: number;
}

export interface PaymentCompletionResult {
  action: 'subscription_created' | 'subscription_extended';
  subscription: IptvSubscription | null;
  payment: IptvPaymentHistory;
}

export interface IPTVSubscriptionService {
  // Pricing
  getPackagePricing(): IPTVPackagePrice[];
  
  // Subscription management
  getUserSubscription(userId: string): Promise<UserSubscriptionInfo | null>;
  createSubscription(userId: string, packageKey: ArgonTVPackageKey, templateId: number): Promise<IptvSubscription>;
  extendSubscription(subscriptionId: string, packageKey: ArgonTVPackageKey): Promise<IptvSubscription>;
  cancelSubscription(subscriptionId: string): Promise<IptvSubscription>;
  
  // Payment processing
  processPaymentCompletion(coinpayportalPaymentId: string, templateId?: number): Promise<PaymentCompletionResult>;
  
  // Payment history
  getPaymentHistory(userId: string, options?: GetUserPaymentsOptions): Promise<IptvPaymentHistory[]>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create an IPTV subscription service instance
 */
export function createIPTVSubscriptionService(
  argonTVClient: ArgonTVClient,
  repository: IPTVSubscriptionRepository
): IPTVSubscriptionService {
  return {
    /**
     * Get pricing for all IPTV packages
     */
    getPackagePricing(): IPTVPackagePrice[] {
      return getAllPackagePrices();
    },

    /**
     * Get user's current IPTV subscription with status
     */
    async getUserSubscription(userId: string): Promise<UserSubscriptionInfo | null> {
      const subscription = await repository.getUserSubscription(userId);
      
      if (!subscription) {
        return null;
      }

      const expiresAt = new Date(subscription.expires_at);
      const now = new Date();
      const isActive = subscription.status === 'active' && expiresAt > now;
      
      let daysRemaining = 0;
      if (expiresAt > now) {
        const msRemaining = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
      }

      return {
        subscription,
        isActive,
        daysRemaining,
      };
    },

    /**
     * Create a new IPTV subscription via ArgonTV API
     */
    async createSubscription(
      userId: string,
      packageKey: ArgonTVPackageKey,
      templateId: number
    ): Promise<IptvSubscription> {
      // Check if user already has an active subscription
      const existingSubscription = await repository.getUserSubscription(userId);
      if (existingSubscription) {
        const expiresAt = new Date(existingSubscription.expires_at);
        if (existingSubscription.status === 'active' && expiresAt > new Date()) {
          throw new Error('User already has an active IPTV subscription');
        }
      }

      // Create line via ArgonTV API
      const argonTVResponse = await argonTVClient.createLine({
        package: ARGONTV_PACKAGES[packageKey],
        template: templateId,
      });

      // Calculate expiry date
      const durationDays = PACKAGE_DURATION_DAYS[packageKey];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Save subscription to database
      const subscription = await repository.createSubscription(userId, {
        argontvLineId: argonTVResponse.id,
        username: argonTVResponse.username,
        password: argonTVResponse.password,
        m3uDownloadLink: argonTVResponse.m3u_download_link,
        packageKey,
        expiresAt,
      });

      return subscription;
    },

    /**
     * Extend an existing IPTV subscription
     */
    async extendSubscription(
      subscriptionId: string,
      packageKey: ArgonTVPackageKey
    ): Promise<IptvSubscription> {
      // Get existing subscription
      const subscription = await repository.getSubscriptionById(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Extend via ArgonTV API
      const extendResponse = await argonTVClient.extendLine({
        lines: [subscription.argontv_line_id],
        package: ARGONTV_PACKAGES[packageKey],
      });

      if (extendResponse.successful === 0) {
        throw new Error('Failed to extend subscription via ArgonTV');
      }

      // Calculate new expiry date
      const durationDays = PACKAGE_DURATION_DAYS[packageKey];
      const currentExpiry = new Date(subscription.expires_at);
      const now = new Date();
      
      // If subscription is still active, extend from current expiry
      // Otherwise, extend from now
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiresAt = new Date(baseDate);
      newExpiresAt.setDate(newExpiresAt.getDate() + durationDays);

      // Update subscription in database
      const updatedSubscription = await repository.extendSubscription(
        subscriptionId,
        newExpiresAt
      );

      return updatedSubscription;
    },

    /**
     * Cancel an IPTV subscription
     */
    async cancelSubscription(subscriptionId: string): Promise<IptvSubscription> {
      const subscription = await repository.getSubscriptionById(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      return repository.updateSubscriptionStatus(subscriptionId, 'cancelled');
    },

    /**
     * Process payment completion - create or extend subscription
     */
    async processPaymentCompletion(
      coinpayportalPaymentId: string,
      templateId?: number
    ): Promise<PaymentCompletionResult> {
      // Get payment record
      const payment = await repository.getPaymentByExternalId(coinpayportalPaymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      const packageKey = payment.package_key as ArgonTVPackageKey;

      if (payment.payment_type === 'new_subscription') {
        // Create new subscription
        const effectiveTemplateId = templateId ?? 
          (payment.metadata as { templateId?: number } | null)?.templateId ?? 
          parseInt(process.env.IPTV_ARGON_TEMPLATE_ID ?? '0', 10);

        if (!effectiveTemplateId) {
          throw new Error('Template ID is required for new subscription');
        }

        // Check if user already has subscription (edge case)
        const existingSubscription = await repository.getUserSubscription(payment.user_id);
        if (existingSubscription) {
          const expiresAt = new Date(existingSubscription.expires_at);
          if (existingSubscription.status === 'active' && expiresAt > new Date()) {
            // User already has active subscription, extend instead
            const extendedSubscription = await this.extendSubscription(
              existingSubscription.id,
              packageKey
            );
            
            await repository.linkPaymentToSubscription(payment.id, existingSubscription.id);
            
            // Send confirmation email for extension
            try {
              const supabase = getServerClient();
              const { data: { user } } = await supabase.auth.admin.getUserById(payment.user_id);
              if (user?.email) {
                const emailService = getEmailService();
                await emailService.sendIPTVSubscriptionEmail({
                  to: user.email,
                  username: extendedSubscription.username,
                  password: extendedSubscription.password,
                  m3uDownloadLink: extendedSubscription.m3u_download_link,
                  packageName: packageKey.replace(/_/g, ' '),
                  expiresAt: new Date(extendedSubscription.expires_at),
                });
              }
            } catch (err) {
              console.error('[IPTV Service] Failed to send confirmation email:', err);
            }

            return {
              action: 'subscription_extended',
              subscription: extendedSubscription,
              payment,
            };
          }
        }

        // Create new subscription
        const subscription = await this.createSubscription(
          payment.user_id,
          packageKey,
          effectiveTemplateId
        );

        // Link payment to subscription
        await repository.linkPaymentToSubscription(payment.id, subscription.id);

        // Auto-save playlist and send confirmation email
        try {
          await autoSavePlaylist(payment.user_id, subscription.m3u_download_link);
        } catch (err) {
          console.error('[IPTV Service] Failed to auto-save playlist:', err);
        }

        try {
          const supabase = getServerClient();
          const { data: { user } } = await supabase.auth.admin.getUserById(payment.user_id);
          if (user?.email) {
            const emailService = getEmailService();
            await emailService.sendIPTVSubscriptionEmail({
              to: user.email,
              username: subscription.username,
              password: subscription.password,
              m3uDownloadLink: subscription.m3u_download_link,
              packageName: packageKey.replace(/_/g, ' '),
              expiresAt: new Date(subscription.expires_at),
            });
          }
        } catch (err) {
          console.error('[IPTV Service] Failed to send confirmation email:', err);
        }

        return {
          action: 'subscription_created',
          subscription,
          payment,
        };
      } else {
        // Extension payment
        if (!payment.iptv_subscription_id) {
          throw new Error('Extension payment must have subscription ID');
        }

        const extendedSubscription = await this.extendSubscription(
          payment.iptv_subscription_id,
          packageKey
        );

        // Send confirmation email for extension
        try {
          const supabase = getServerClient();
          const { data: { user } } = await supabase.auth.admin.getUserById(payment.user_id);
          if (user?.email) {
            const emailService = getEmailService();
            await emailService.sendIPTVSubscriptionEmail({
              to: user.email,
              username: extendedSubscription.username,
              password: extendedSubscription.password,
              m3uDownloadLink: extendedSubscription.m3u_download_link,
              packageName: packageKey.replace(/_/g, ' '),
              expiresAt: new Date(extendedSubscription.expires_at),
            });
          }
        } catch (err) {
          console.error('[IPTV Service] Failed to send confirmation email:', err);
        }

        return {
          action: 'subscription_extended',
          subscription: extendedSubscription,
          payment,
        };
      }
    },

    /**
     * Get user's IPTV payment history
     */
    async getPaymentHistory(
      userId: string,
      options?: GetUserPaymentsOptions
    ): Promise<IptvPaymentHistory[]> {
      return repository.getUserPayments(userId, options);
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getArgonTVClient } from './client';
import { getIPTVSubscriptionRepository } from './repository';
import { autoSavePlaylist } from './playlist-auto-save';
import { getEmailService } from '../email/email';
import { getServerClient } from '../supabase/client';

let serviceInstance: IPTVSubscriptionService | null = null;

/**
 * Get the singleton IPTV subscription service instance
 */
export function getIPTVSubscriptionService(): IPTVSubscriptionService {
  if (!serviceInstance) {
    serviceInstance = createIPTVSubscriptionService(
      getArgonTVClient(),
      getIPTVSubscriptionRepository()
    );
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetIPTVSubscriptionService(): void {
  serviceInstance = null;
}
