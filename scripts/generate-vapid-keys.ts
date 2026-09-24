#!/usr/bin/env npx tsx
/**
 * Generate VAPID Keys for Web Push Notifications
 *
 * VAPID (Voluntary Application Server Identification) keys are required
 * for Web Push notifications. They identify your server to push services
 * (Google FCM, Mozilla autopush, Apple APNs) so they know push messages
 * are legitimately from your application.
 *
 * Keys are in the same format web-push produced, so existing keys keep
 * working: only generate new ones for a new deployment (rotating them
 * re-subscribes every browser on its next visit).
 *
 * Run: pnpm tsx scripts/generate-vapid-keys.ts
 */

import { generateVapidKeys } from '@profullstack/notifications/server';

const vapidKeys = generateVapidKeys();

console.log('Generated VAPID Keys for Web Push Notifications\n');
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);
console.log('\nNote: Replace the email with your actual contact email.');
console.log('The VAPID_SUBJECT should be a mailto: or https: URL that identifies your app.');
