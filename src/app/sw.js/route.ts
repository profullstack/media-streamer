/**
 * Service Worker Route
 *
 * Serves the service worker file with correct headers.
 * Needed because Next.js standalone mode doesn't serve /public files directly.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(): Promise<NextResponse> {
  try {
    // Try multiple paths since the location differs between dev and production
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'sw.js'),
      path.join(process.cwd(), '..', 'public', 'sw.js'),
      '/app/public/sw.js', // Docker path
    ];

    let swContent: string | null = null;

    for (const swPath of possiblePaths) {
      try {
        if (fs.existsSync(swPath)) {
          swContent = fs.readFileSync(swPath, 'utf-8');
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    if (!swContent) {
      // Fallback: inline the service worker code
      swContent = `
/**
 * Service Worker for Push Notifications
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New content available',
      icon: data.icon || '/favicon.png',
      badge: '/favicon.png',
      tag: data.tag || 'podcast-notification',
      data: { url: data.url || '/' },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
    };
    event.waitUntil(self.registration.showNotification(data.title || 'BitTorrented', options));
  } catch (err) {
    console.error('[SW] Error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
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
    }

    return new NextResponse(swContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[SW Route] Error serving service worker:', error);
    return new NextResponse('Service worker not available', { status: 500 });
  }
}
