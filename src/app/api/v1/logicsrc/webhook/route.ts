/**
 * POST /api/v1/logicsrc/webhook: grant.delivered / grant.updated / grant.revoked
 * from logicsrc. No session and no CSRF: each delivery is Standard Webhooks
 * signed with the secret of the request it answers, checked over the raw body
 * (src/proxy.ts lets it through every gate untouched).
 */

import { keyGrants } from '@/lib/logicsrc/grants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return keyGrants().webhookResponse(request);
}
