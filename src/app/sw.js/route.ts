/**
 * Service Worker Route
 *
 * Serves the push-notification service worker with correct headers.
 *
 * The worker is inlined as a string on purpose: doing `fs.readFileSync` /
 * `path.join(process.cwd(), …)` here makes Turbopack trace the entire project
 * for the standalone output ("Encountered unexpected file in NFT list"), which
 * corrupts the trace and breaks the standalone build (missing
 * `middleware.js.nft.json`). There is no `public/sw.js` on disk anyway, so the
 * old filesystem lookup always fell back to this inline copy.
 */

import { NextResponse } from 'next/server';

const SERVICE_WORKER = `
/**
 * Service Worker for Push Notifications
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const imageUrl = data.icon || data.image || (data.data && data.data.imageUrl) || null;
    const options = {
      body: data.body || 'New content available',
      icon: imageUrl || '/favicon.png',
      badge: data.badge || '/favicon.png',
      image: data.image || imageUrl || undefined,
      tag: data.tag || 'podcast-notification',
      data: {
        url: data.url || '/',
        type: data.data && data.data.type,
        podcastId: data.data && data.data.podcastId,
        episodeId: data.data && data.data.episodeId,
        audioUrl: data.data && data.data.audioUrl,
        action: data.data && data.data.action,
      },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      renotify: true,
    };
    console.log('[SW] Showing notification:', data.title, 'with icon:', options.icon);
    event.waitUntil(self.registration.showNotification(data.title || 'BitTorrented', options));
  } catch (err) {
    console.error('[SW] Error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const action = event.action;
  let url = notificationData.url || '/';

  if (notificationData.type === 'new-episode') {
    if (action === 'play' && notificationData.podcastId) {
      url = '/podcasts?play=' + notificationData.podcastId;
    } else if (action !== 'later') {
      url = '/podcasts';
    } else {
      return;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
});
`;

export async function GET(): Promise<NextResponse> {
  return new NextResponse(SERVICE_WORKER, {
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
