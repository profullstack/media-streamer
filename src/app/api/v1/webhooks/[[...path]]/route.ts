/**
 * /api/v1/webhooks: the @profullstack/webhooks API, scoped to the caller.
 *
 * Auth: an API token (`Authorization: Bearer btr_...`, the same tokens as the
 * rest of /api/v1), or the signed-in session for the settings page. A
 * session-authenticated write must come from this site's own pages (Origin
 * check), so another site cannot add an endpoint with a visitor's cookie.
 *
 *   GET    /                      endpoints + event_types
 *   POST   /                      { url, events?, description? } -> { endpoint, secret }
 *   GET|PATCH|DELETE /:id
 *   GET    /:id/secret            POST /:id/rotate      POST /:id/test
 *   GET    /:id/deliveries        GET /deliveries       POST /deliveries/:id/retry
 */

import { NextResponse } from 'next/server';
import { webhooksApi } from '@profullstack/webhooks';
import { resolveWebhookOwner } from '@/lib/webhooks/auth';
import { getHooks } from '@/lib/webhooks/hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_PATH = '/api/v1/webhooks';

async function handle(request: Request): Promise<Response> {
  const owner = await resolveWebhookOwner(request);
  if (!owner) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const api = webhooksApi(getHooks(), { basePath: BASE_PATH, owner: () => owner });
  try {
    return (await api(request)) ?? NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (err) {
    // webhooksApi answers its own WebhookErrors, but Next bundles the package
    // into this route and into lib/webhooks/hub separately, so a WebhookError
    // thrown by the hub fails the router's instanceof check and lands here.
    // Answer it by its status (400 "url: must be https" and the like).
    const status = (err as { status?: unknown })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
    console.error('[webhooks api]', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
