/**
 * Renewal Notification Service
 * 
 * Service for sending renewal reminders to users whose subscriptions
 * are about to expire. Since crypto payments don't support recurring
 * billing, users need to be reminded to manually renew.
 */

import type { SubscriptionRepository } from './repository';

// ============================================================================
// Types
// ============================================================================

/**
 * Email sender interface for sending renewal reminders
 */
export interface EmailSender {
  sendRenewalReminder(params: {
    to: string;
    daysRemaining: number;
    tier: string;
    expiresAt: Date;
    renewalUrl: string;
  }): Promise<boolean>;
}

/**
 * Result of processing renewal reminders
 */
export interface RenewalReminderResult {
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Result of processing all reminder types
 */
export interface AllRemindersResult {
  totalSent: number;
  totalFailed: number;
  byDays: {
    [days: number]: RenewalReminderResult;
  };
}

/**
 * Renewal status for a user
 */
export interface RenewalStatus {
  isActive: boolean;
  tier: string;
  daysRemaining: number;
  expiresAt: Date | null;
  needsRenewal: boolean;
  renewalUrl: string;
}

/**
 * Configuration options for the renewal notification service
 */
export interface RenewalNotificationConfig {
  renewalBaseUrl?: string;
}

/**
 * Renewal notification service interface
 */
export interface RenewalNotificationService {
  processRenewalReminders(daysBefore: number): Promise<RenewalReminderResult>;
  processAllReminders(): Promise<AllRemindersResult>;
  getRenewalStatus(userId: string): Promise<RenewalStatus | null>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RENEWAL_URL = '/pricing';
const REMINDER_DAYS = [7, 3, 1] as const;

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a renewal notification service instance
 */
export function createRenewalNotificationService(
  subscriptionRepo: SubscriptionRepository,
  emailSender: EmailSender,
  config: RenewalNotificationConfig = {}
): RenewalNotificationService {
  const renewalUrl = config.renewalBaseUrl ?? DEFAULT_RENEWAL_URL;

  return {
    /**
     * Process renewal reminders for subscriptions expiring within specified days
     */
    async processRenewalReminders(daysBefore: number): Promise<RenewalReminderResult> {
      const result: RenewalReminderResult = {
        sent: 0,
        failed: 0,
        errors: [],
      };

      // Get subscriptions needing reminders
      const subscriptions = await subscriptionRepo.getSubscriptionsNeedingReminders(daysBefore);

      // Process each subscription
      for (const subscription of subscriptions) {
        try {
          const emailSent = await emailSender.sendRenewalReminder({
            to: subscription.userEmail,
            daysRemaining: subscription.daysUntilExpiry,
            tier: subscription.tier,
            expiresAt: subscription.subscriptionExpiresAt,
            renewalUrl,
          });

          if (emailSent) {
            // Mark reminder as sent
            await subscriptionRepo.markRenewalReminderSent(subscription.userId, daysBefore);
            result.sent++;
          } else {
            result.failed++;
            result.errors.push(`Failed to send email to ${subscription.userEmail}`);
          }
        } catch (error) {
          result.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Error processing ${subscription.userId}: ${errorMessage}`);
        }
      }

      return result;
    },

    /**
     * Process all reminder types (7-day, 3-day, 1-day)
     */
    async processAllReminders(): Promise<AllRemindersResult> {
      const result: AllRemindersResult = {
        totalSent: 0,
        totalFailed: 0,
        byDays: {},
      };

      for (const days of REMINDER_DAYS) {
        const dayResult = await this.processRenewalReminders(days);
        result.byDays[days] = dayResult;
        result.totalSent += dayResult.sent;
        result.totalFailed += dayResult.failed;
      }

      return result;
    },

    /**
     * Get renewal status for a specific user
     */
    async getRenewalStatus(userId: string): Promise<RenewalStatus | null> {
      const status = await subscriptionRepo.getSubscriptionStatus(userId);

      if (!status) {
        return null;
      }

      return {
        isActive: status.is_active,
        tier: status.tier,
        daysRemaining: status.days_remaining,
        expiresAt: status.expires_at ? new Date(status.expires_at) : null,
        needsRenewal: status.needs_renewal,
        renewalUrl,
      };
    },
  };
}

// ============================================================================
// Default Email Sender (placeholder - implement with actual email service)
// ============================================================================

/**
 * Create a console-logging email sender for development/testing
 * In production, replace with actual email service (e.g., SendGrid, Resend)
 */
export function createConsoleEmailSender(): EmailSender {
  return {
    async sendRenewalReminder(params): Promise<boolean> {
      console.log('[RenewalReminder] Would send email:', {
        to: params.to,
        subject: `Your subscription expires in ${params.daysRemaining} day(s)`,
        tier: params.tier,
        expiresAt: params.expiresAt.toISOString(),
        renewalUrl: params.renewalUrl,
      });
      return true;
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getSubscriptionRepository } from './repository';

let serviceInstance: RenewalNotificationService | null = null;
let emailSenderInstance: EmailSender | null = null;

/**
 * Set the email sender to use for renewal notifications
 * Must be called before getRenewalNotificationService
 */
export function setEmailSender(sender: EmailSender): void {
  emailSenderInstance = sender;
  // Reset service instance to use new sender
  serviceInstance = null;
}

/**
 * Get the singleton renewal notification service instance
 */
export function getRenewalNotificationService(): RenewalNotificationService {
  if (!serviceInstance) {
    const emailSender = emailSenderInstance ?? createConsoleEmailSender();
    serviceInstance = createRenewalNotificationService(
      getSubscriptionRepository(),
      emailSender
    );
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetRenewalNotificationService(): void {
  serviceInstance = null;
  emailSenderInstance = null;
}
