/**
 * Notification Sender
 *
 * Sends web push notifications for new podcast episodes.
 */

import { sendPush, vapidKeysFromEnv, type VapidKeys } from '@profullstack/notifications/server';
import { PROCESSING_CONFIG, LOG_PREFIX } from './config';
import type { UserToNotify, NotificationPayload, PushSubscriptionData, Podcast, PodcastEpisode } from './types';
import { recordNotification, markPushSubscriptionInactive } from './supabase-client';

let vapidKeys: VapidKeys | null = null;
let missingVapidWarningLogged = false;

/**
 * Return whether push notifications can be sent.
 */
export function arePushNotificationsConfigured(): boolean {
  return vapidKeysFromEnv(process.env) !== null;
}

/**
 * Warn once when notifications are skipped due to missing VAPID configuration.
 */
function warnMissingVapidConfiguration(): void {
  if (missingVapidWarningLogged) {
    return;
  }

  console.warn(
    `${LOG_PREFIX} VAPID keys are not configured. Skipping push notifications while continuing episode indexing.`
  );
  missingVapidWarningLogged = true;
}

/**
 * VAPID keys for web push, read from the environment once
 */
function getVapidKeys(): VapidKeys {
  if (vapidKeys) return vapidKeys;

  const keys = vapidKeysFromEnv(process.env);
  if (!keys) {
    throw new Error(
      'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.'
    );
  }

  vapidKeys = keys;
  return keys;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a single push notification
 */
async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: NotificationPayload
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  let keys: VapidKeys;
  try {
    keys = getVapidKeys();
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }

  const result = await sendPush(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
    {
      keys,
      subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
      ttl: 60 * 60 * 24, // 24 hours
    }
  );

  if (result.sent) {
    return { success: true };
  }

  // Handle expired/invalid subscriptions (410 Gone or 404 Not Found)
  if (result.gone) {
    await markPushSubscriptionInactive(subscription.endpoint);
    return {
      success: false,
      expired: true,
      error: result.error ?? `push service answered ${result.status}`,
    };
  }

  return {
    success: false,
    error: result.error ?? 'Failed to send notification',
  };
}

/**
 * Create notification payload for a new episode
 */
function createEpisodeNotificationPayload(
  podcast: Podcast,
  episode: PodcastEpisode
): NotificationPayload {
  const body = episode.title.length > 100
    ? episode.title.slice(0, 97) + '...'
    : episode.title;

  // Use episode image if available, fall back to podcast image, then app logo
  const imageUrl = episode.image_url ?? podcast.image_url ?? '/favicon.png';

  return {
    title: `New Episode: ${podcast.title}`,
    body,
    // Icon - small image shown in notification (episode -> podcast -> app logo)
    icon: imageUrl,
    // Badge - small monochrome icon for status bar (keep as app badge)
    badge: '/icons/podcast-badge.png',
    // Image - large image preview for rich notifications (supported on desktop/Android)
    image: imageUrl,
    tag: `podcast-${podcast.id}-${episode.id}`,
    data: {
      type: 'new-episode',
      podcastId: podcast.id,
      episodeId: episode.id,
      feedUrl: podcast.feed_url,
      audioUrl: episode.audio_url,
      action: 'play-episode',
      // Also pass the image URL in data for service worker fallback
      imageUrl,
    },
    actions: [
      {
        action: 'play',
        title: 'Play Now',
      },
      {
        action: 'later',
        title: 'Later',
      },
    ],
  };
}

/**
 * Send notifications to all users for a new episode
 */
export async function sendNewEpisodeNotifications(
  podcast: Podcast,
  episode: PodcastEpisode,
  usersToNotify: UserToNotify[]
): Promise<{ sent: number; failed: number }> {
  if (usersToNotify.length === 0) {
    return { sent: 0, failed: 0 };
  }

  if (!arePushNotificationsConfigured()) {
    warnMissingVapidConfiguration();
    return { sent: 0, failed: 0 };
  }

  const payload = createEpisodeNotificationPayload(podcast, episode);
  let sent = 0;
  let failed = 0;

  for (const user of usersToNotify) {
    const subscription: PushSubscriptionData = {
      endpoint: user.push_endpoint,
      keys: {
        p256dh: user.p256dh_key,
        auth: user.auth_key,
      },
    };

    const result = await sendPushNotification(subscription, payload);

    if (result.success) {
      sent++;
      await recordNotification({
        userId: user.user_id,
        notificationType: 'new-episode',
        title: payload.title,
        body: payload.body,
        podcastId: podcast.id,
        episodeId: episode.id,
        status: 'sent',
      });
    } else {
      failed++;
      if (!result.expired) {
        await recordNotification({
          userId: user.user_id,
          notificationType: 'new-episode',
          title: payload.title,
          body: payload.body,
          podcastId: podcast.id,
          episodeId: episode.id,
          status: 'failed',
          errorMessage: result.error,
        });
      }
      console.error(
        `${LOG_PREFIX} Failed to notify user ${user.user_id}:`,
        result.error,
        result.expired ? '(subscription expired)' : ''
      );
    }

    // Small delay between notifications to avoid rate limiting
    if (usersToNotify.indexOf(user) < usersToNotify.length - 1) {
      await sleep(PROCESSING_CONFIG.notificationDelay);
    }
  }

  return { sent, failed };
}
