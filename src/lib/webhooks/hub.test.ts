// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifySignature } from '@profullstack/webhooks';

vi.mock('@/lib/supabase/client', () => ({ createServerClient: vi.fn() }));

import { createHooks, emitWebhook, setHooks, WEBHOOK_EVENT_TYPES } from './hub';
import { supabaseStore } from './supabase-store';
import { fakeSupabase } from './__fixtures__/fake-supabase';

/** A public address for every host, so no test touches DNS. */
const guard = { lookup: async () => ['93.184.216.34'] };

function receiver(status = 200) {
  const got: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    got.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return new Response('ok', { status });
  });
  return { got, fetchImpl: fetchImpl as unknown as typeof fetch };
}

afterEach(() => setHooks(undefined));

describe('bittorrented webhooks hub', () => {
  it('declares the events the app emits', () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual(['vod.purchased', 'share.purchased', 'subscription.activated', 'watch_party.started']);
  });

  it('queues an emitted event in the hub_ tables and delivers a signed CloudEvent', async () => {
    const sb = fakeSupabase();
    const { got, fetchImpl } = receiver();
    const hooks = createHooks(supabaseStore(sb), { guard, fetchImpl });
    const { endpoint, secret } = await hooks.createEndpoint('user-1', { url: 'https://hooks.example.com/bt', events: ['vod.*'] });
    expect(sb.rows('hub_webhook_endpoints')).toHaveLength(1);
    setHooks(hooks);

    await emitWebhook('user-1', 'vod.purchased', { grant_id: 'g1', amount_usd: 5 }, { subject: 'vod_grant:g1', id: 'evt_vod_purchased_g1' });
    await emitWebhook('user-1', 'watch_party.started', { party_id: 'p1' }); // not subscribed
    await emitWebhook('user-2', 'vod.purchased', { grant_id: 'g2' }); // someone else
    expect(sb.rows('hub_webhook_deliveries')).toHaveLength(1);

    expect(await hooks.drain()).toBe(1);
    expect(got).toHaveLength(1);
    expect(got[0].url).toBe(endpoint.url);
    expect(verifySignature({ headers: got[0].headers, body: got[0].body, secret }).ok).toBe(true);
    expect(got[0].headers['webhook-id']).toBe('evt_vod_purchased_g1');
    expect(JSON.parse(got[0].body)).toMatchObject({
      specversion: '1.0',
      id: 'evt_vod_purchased_g1',
      type: 'vod.purchased',
      source: 'https://bittorrented.com',
      subject: 'vod_grant:g1',
      data: { grant_id: 'g1', amount_usd: 5 },
    });
  });

  it('never throws into the caller, and skips guest owners', async () => {
    const hooks = { emit: vi.fn(async () => { throw new Error('db down'); }) };
    setHooks(hooks as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(emitWebhook('user-1', 'share.purchased', {})).resolves.toBeUndefined();
    await emitWebhook('guest_123_abc', 'watch_party.started', {});
    await emitWebhook(null, 'watch_party.started', {});
    expect(hooks.emit).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does nothing without a configured hub in tests', async () => {
    await expect(emitWebhook('user-1', 'vod.purchased', {})).resolves.toBeUndefined();
  });
});
