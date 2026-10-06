import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { SITE_OFFLINE, openWhileInviteOnly, stillServed } from './site-offline';

const get = (path: string) => proxy(new NextRequest(`https://bittorrented.com${path}`));

describe('bittorrented.com offline, invite only', () => {
  it('is switched off', () => {
    expect(SITE_OFFLINE).toBe(true);
  });

  it('sends every other page to the invite-only screen', async () => {
    // Without an admin session; /login stays reachable so an admin can sign in (admin-gate.test.ts).
    for (const path of ['/', '/search?q=x', '/dht', '/torrents/abc', '/pricing', '/account']) {
      const res = await get(path);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toMatch(/\/invite-only$/);
    }
  });

  it('serves the invite-only screen, signup and the invites API to everyone', async () => {
    for (const path of ['/invite-only', '/signup', '/api/invites']) {
      expect(openWhileInviteOnly(path)).toBe(true);
      const res = await get(path);
      expect(res.status).not.toBe(307);
      expect(res.status).not.toBe(503);
      expect(res.status).not.toBe(410);
    }
    expect(openWhileInviteOnly('/signupx')).toBe(false);
    expect(openWhileInviteOnly('/api/invitesx')).toBe(false);
  });

  it('answers the rest of the API with JSON 503s', async () => {
    for (const path of ['/api/search', '/api/seedbox/add', '/api/iptv/subscription', '/api/public/datasets']) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/invite only/);
    }
  });

  it('keeps the health check and payment webhooks reachable', () => {
    expect(stillServed('/api/health')).toBe(true);
    expect(stillServed('/api/webhooks/coinpayportal')).toBe(true);
    expect(stillServed('/api/healthz-not-really')).toBe(false);
  });
});
