/**
 * Customer webhooks for bittorrented.com, on @profullstack/webhooks.
 *
 * Endpoints and a durable outbox live in Supabase (hub_webhook_* tables,
 * migration 20261028200000_webhooks_hub). `emit` only queues; the drainer
 * started once at server boot (instrumentation.ts) sends with retries and
 * backoff. Deliveries are CloudEvents signed with Standard Webhooks headers
 * (webhook-id, webhook-timestamp, webhook-signature).
 *
 * Every event goes to the account it is about (the owner): a VOD library's
 * owner when a pass sells, a share's owner when a pass to it sells, the
 * subscriber when a subscription activates, the host when a party starts.
 * Payloads never carry a viewer key, grant token, stream URL or wallet.
 */

import { Webhooks, type WebhookStore, type WebhooksOptions } from '@profullstack/webhooks';
import { createServerClient } from '@/lib/supabase/client';
import { supabaseStore, type SupabaseLike } from './supabase-store';

/** The events bittorrented emits. */
export const WEBHOOK_EVENT_TYPES = [
  'vod.purchased',
  'share.purchased',
  'subscription.activated',
  'watch_party.started',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_SOURCE = 'https://bittorrented.com';

export function createHooks(store: WebhookStore, options: Partial<WebhooksOptions> = {}): Webhooks {
  return new Webhooks({
    store,
    source: WEBHOOK_SOURCE,
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    maxEndpoints: 10,
    guard: process.env.NODE_ENV === 'production' ? {} : { allowHttp: true },
    log: (m) => console.warn(`[webhooks] ${m}`),
    ...options,
  });
}

const KEY = Symbol.for('bittorrented.webhooks.hub');
type HubGlobal = typeof globalThis & { [KEY]?: Webhooks };

/**
 * The process-wide hub. Kept on globalThis because Next bundles route handlers
 * and instrumentation separately: a module-level singleton would give each its
 * own instance, and only the one that called start() would drain.
 */
export function getHooks(): Webhooks {
  const g = globalThis as HubGlobal;
  if (!g[KEY]) {
    g[KEY] = createHooks(supabaseStore(createServerClient() as unknown as SupabaseLike));
  }
  return g[KEY]!;
}

/** Test seam: replace (or clear) the process-wide hub. */
export function setHooks(hooks: Webhooks | undefined): void {
  (globalThis as HubGlobal)[KEY] = hooks;
}

/** Start the background drainer once per server process. */
export function startWebhooks(): void {
  getHooks().start();
}

/**
 * Queue an event for the owner's endpoints. Best effort: a webhook problem
 * must never fail the payment or party flow that raised it, so this logs and
 * returns instead of throwing. Guest owners (no account) are skipped.
 * Pass a stable `id` (it becomes the CloudEvent id and webhook-id) so a
 * receiver can drop a repeat if the payment provider redelivers.
 */
export async function emitWebhook(
  owner: string | null | undefined,
  type: WebhookEventType,
  data: Record<string, unknown>,
  options: { subject?: string; id?: string } = {}
): Promise<void> {
  if (!owner || owner.startsWith('guest_')) return;
  const g = globalThis as HubGlobal;
  if (!g[KEY] && (process.env['VITEST'] || !process.env['SUPABASE_SERVICE_ROLE_KEY'])) return; // bracket read: runtime, not inlined
  try {
    await getHooks().emit(owner, type, data, options);
  } catch (err) {
    console.warn(`[webhooks] emit ${type} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
