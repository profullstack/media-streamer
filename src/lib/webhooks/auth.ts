/**
 * Who a /api/v1/webhooks request acts for: an API token (`Bearer btr_...`)
 * or, for the settings page, the signed-in session. A session write must
 * come from this site (Origin / Sec-Fetch-Site), so another site cannot add
 * an endpoint with a visitor's cookie.
 */

import { getApiUser } from '@/lib/api-tokens';
import { getCurrentUser } from '@/lib/auth';

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The account the request acts for, or null. */
export async function resolveWebhookOwner(request: Request): Promise<string | null> {
  if (/^Bearer\s+/i.test(request.headers.get('authorization') ?? '')) {
    const apiUser = await getApiUser(request);
    return apiUser?.id ?? null;
  }
  const user = await getCurrentUser();
  if (!user) return null;
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  if (write && !sameOrigin(request)) return null;
  return user.id;
}

