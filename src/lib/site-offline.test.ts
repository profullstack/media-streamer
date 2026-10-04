import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { SITE_OFFLINE, stillServed } from './site-offline';

const get = (path: string) => proxy(new NextRequest(`https://bittorrented.com${path}`));

describe('bittorrented.com offline', () => {
  it('is switched off', () => {
    expect(SITE_OFFLINE).toBe(true);
  });

  it('answers every page with the 503 notice', async () => {
    for (const path of ['/', '/search?q=x', '/login', '/dht', '/torrents/abc', '/pricing']) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(await res.text()).toContain('BitTorrented is offline');
    }
  });

  it('answers the API with JSON 503s', async () => {
    for (const path of ['/api/search', '/api/seedbox/add', '/api/iptv/subscription', '/api/public/datasets']) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/offline/);
    }
  });

  it('keeps the health check and payment webhooks reachable', () => {
    expect(stillServed('/api/health')).toBe(true);
    expect(stillServed('/api/webhooks/coinpayportal')).toBe(true);
    expect(stillServed('/api/healthz-not-really')).toBe(false);
  });
});
