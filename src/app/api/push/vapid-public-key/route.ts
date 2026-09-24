/**
 * VAPID Public Key API Route
 *
 * GET /api/push/vapid-public-key - The VAPID public key, served at runtime.
 *
 * The browser fetches the key when it subscribes (see
 * @profullstack/notifications/client), so it cannot drift from the key the
 * server and the podcast worker sign with, and a build without the key cannot
 * make every browser look unsupported.
 *
 * No authentication required.
 */

import { vapidKeysFromEnv, vapidPublicKeyResponse } from '@profullstack/notifications/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/push/vapid-public-key
 *
 * Returns:
 * - 200: { publicKey }
 * - 503: { publicKey: null, error } when the server has no VAPID keys
 */
export function GET(): Response {
  return vapidPublicKeyResponse(vapidKeysFromEnv(process.env));
}
