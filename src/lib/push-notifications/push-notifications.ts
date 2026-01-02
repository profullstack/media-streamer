/**
 * Push Notifications Service
 * 
 * Server-side service for managing web push notifications.
 * Uses the Web Push protocol to send notifications to subscribed browsers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  PushSubscription,
  NotificationHistory,
  NotificationStatus,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Push subscription data from the browser
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

/**
 * Result of sending a notification
 */
export interface SendNotificationResult {
  success: boolean;
  error?: string;
  expired?: boolean;
}

/**
 * Notification record data
 */
export interface NotificationRecordData {
  userId: string;
  pushSubscriptionId?: string;
  notificationType: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  podcastId?: string;
  episodeId?: string;
  status: NotificationStatus;
  errorMessage?: string;
}

/**
 * VAPID configuration
 */
export interface VapidConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

/**
 * Push notification service interface
 */
export interface PushNotificationService {
  registerSubscription(
    userId: string,
    subscription: PushSubscriptionData,
    userAgent?: string
  ): Promise<PushSubscription>;
  unregisterSubscription(endpoint: string): Promise<void>;
  sendNotification(
    subscription: PushSubscriptionData,
    payload: NotificationPayload
  ): Promise<SendNotificationResult>;
  sendNotificationToUser(
    userId: string,
    payload: NotificationPayload
  ): Promise<SendNotificationResult[]>;
  recordNotification(data: NotificationRecordData): Promise<NotificationHistory>;
  getVapidPublicKey(): string;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a push notification service instance
 */
export function createPushNotificationService(
  client: SupabaseClient<Database>,
  config: VapidConfig
): PushNotificationService {
  // Lazy load web-push to avoid issues in environments where it's not available
  let webPushModule: typeof import('web-push') | null = null;

  async function getWebPush(): Promise<typeof import('web-push')> {
    if (!webPushModule) {
      webPushModule = await import('web-push');
      webPushModule.setVapidDetails(
        config.vapidSubject,
        config.vapidPublicKey,
        config.vapidPrivateKey
      );
    }
    return webPushModule;
  }

  return {
    /**
     * Register a push subscription for a user
     */
    async registerSubscription(
      userId: string,
      subscription: PushSubscriptionData,
      userAgent?: string
    ): Promise<PushSubscription> {
      const { data, error } = await client
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh_key: subscription.keys.p256dh,
            auth_key: subscription.keys.auth,
            user_agent: userAgent ?? null,
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        )
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Unregister a push subscription
     */
    async unregisterSubscription(endpoint: string): Promise<void> {
      const { error } = await client
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * Send a notification to a specific subscription
     */
    async sendNotification(
      subscription: PushSubscriptionData,
      payload: NotificationPayload
    ): Promise<SendNotificationResult> {
      try {
        const webPush = await getWebPush();
        
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          JSON.stringify(payload),
          {
            TTL: 60 * 60 * 24, // 24 hours
          }
        );

        return { success: true };
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        
        // Handle expired/invalid subscriptions (410 Gone or 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Mark subscription as inactive
          await client
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', subscription.endpoint);

          return {
            success: false,
            error: err.message,
            expired: true,
          };
        }

        return {
          success: false,
          error: err.message,
        };
      }
    },

    /**
     * Send notification to all active subscriptions for a user
     */
    async sendNotificationToUser(
      userId: string,
      payload: NotificationPayload
    ): Promise<SendNotificationResult[]> {
      const { data: subscriptions, error } = await client
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        throw new Error(error.message);
      }

      if (!subscriptions || subscriptions.length === 0) {
        return [];
      }

      const results: SendNotificationResult[] = [];

      for (const sub of subscriptions) {
        const result = await this.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key,
            },
          },
          payload
        );
        results.push(result);
      }

      return results;
    },

    /**
     * Record a notification in history
     */
    async recordNotification(data: NotificationRecordData): Promise<NotificationHistory> {
      const { data: record, error } = await client
        .from('notification_history')
        .insert({
          user_id: data.userId,
          push_subscription_id: data.pushSubscriptionId ?? null,
          notification_type: data.notificationType,
          title: data.title,
          body: data.body ?? null,
          data: data.data ?? null,
          status: data.status,
          error_message: data.errorMessage ?? null,
          podcast_id: data.podcastId ?? null,
          episode_id: data.episodeId ?? null,
          sent_at: data.status === 'sent' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return record;
    },

    /**
     * Get the VAPID public key for client-side subscription
     */
    getVapidPublicKey(): string {
      return config.vapidPublicKey;
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let serviceInstance: PushNotificationService | null = null;

/**
 * Get the singleton push notification service instance
 */
export function getPushNotificationService(): PushNotificationService {
  if (!serviceInstance) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error(
        'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.'
      );
    }

    serviceInstance = createPushNotificationService(getServerClient(), {
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
    });
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetPushNotificationService(): void {
  serviceInstance = null;
}
