// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { memoryStore } from '@profullstack/webhooks';

vi.mock('@/lib/supabase/client', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/webhooks/auth', () => ({
  resolveWebhookOwner: async (r: Request) => (r.headers.get('authorization') === 'Bearer btr_ok' ? 'user-1' : null),
}));

import { createHooks, setHooks } from '@/lib/webhooks/hub';
import { GET, POST } from './route';

const base = 'https://bittorrented.com/api/v1/webhooks';
const auth = { authorization: 'Bearer btr_ok', 'content-type': 'application/json' };

describe('/api/v1/webhooks', () => {
  it('401s without a key', async () => {
    expect((await GET(new Request(base))).status).toBe(401);
  });

  it('lists endpoints and event types for the key owner', async () => {
    setHooks(createHooks(memoryStore(), { guard: { lookup: async () => ['93.184.216.34'] } }));
    const res = await GET(new Request(base, { headers: auth }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ endpoints: [], event_types: expect.arrayContaining(['vod.purchased']) });
  });

  it('answers a rejected URL with 400, even when the error class is a different bundled copy', async () => {
    const hooks = createHooks(memoryStore());
    hooks.createEndpoint = async () => {
      throw Object.assign(new Error('url: must be https'), { status: 400 });
    };
    setHooks(hooks);
    const res = await POST(new Request(base, { method: 'POST', headers: auth, body: JSON.stringify({ url: 'http://127.0.0.1/x' }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'url: must be https' });
    setHooks(undefined);
  });
});
