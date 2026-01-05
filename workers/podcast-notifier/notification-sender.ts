/**
 * Notification Sender
 *
 * Sends web push notifications for new podcast episodes.
 */

import webPush from 'web-push';
import { PROCESSING_CONFIG, LOG_PREFIX } from './config';
import type { UserToNotify, NotificationPayload, PushSubscriptionData, Podcast, PodcastEpisode } from './types';
import { recordNotification, markPushSubscriptionInactive } from './supabase-client';

let vapidConfigured = false;

/**
 * Configure VAPID details for web push
 */
function configureVapid(): void {
  if (vapidConfigured) return;

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error(
      'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.'
    );
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  vapidConfigured = true;
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
  try {
    configureVapid();

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
      await markPushSubscriptionInactive(subscription.endpoint);
      return {
        success: false,
        expired: true,
        error: err.message,
      };
    }

    return {
      success: false,
      error: err.message,
    };
  }
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

  return {
    title: `New Episode: ${podcast.title}`,
    body,
    icon: podcast.image_url ?? undefined,
    badge: '/icons/podcast-badge.png',
    tag: `podcast-${podcast.id}-${episode.id}`,
    data: {
      type: 'new-episode',
      podcastId: podcast.id,
      episodeId: episode.id,
      feedUrl: podcast.feed_url,
      audioUrl: episode.audio_url,
      action: 'play-episode',
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
