import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LEGAL_MODE, legallyServed } from './legal-mode';

// The site is also offline right now; take that away to see what legal mode alone does.
vi.mock('@/lib/site-offline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/site-offline')>()),
  SITE_OFFLINE: false,
}));

const { proxy } = await import('@/proxy');
const get = (path: string) => proxy(new NextRequest(`https://bittorrented.com${path}`));

describe('legal mode', () => {
  it('is on', () => {
    expect(LEGAL_MODE).toBe(true);
  });

  it('serves accounts, payments, legal pages, blog and podcasts', () => {
    for (const p of ['/login', '/account/billing', '/pricing', '/pay/abc', '/terms', '/blog/post', '/podcasts', '/api/auth/session', '/api/payments/x', '/api/webhooks/coinpayportal', '/api/podcasts/1/episodes', '/api/cron/expire-subscriptions', '/.well-known/openfile.json']) {
      expect(legallyServed(p), p).toBe(true);
    }
  });

  it('retires the index, the media browsers, seedboxes and the resale rails', () => {
    for (const p of ['/dht', '/search', '/find-torrents', '/torrents/abc', '/trending', '/movies', '/tvshows', '/music', '/xxx', '/radio', '/iptv', '/live-tv', '/spotify', '/youtube', '/watch/1', '/seedboxes', '/api/dht', '/api/search', '/api/torrent-search', '/api/magnets', '/api/stream', '/api/radio/proxy', '/api/iptv-proxy', '/api/spotify', '/api/seedbox/add', '/api/account/seedbox', '/api/account/seedboxes/1', '/api/cron/refresh-iptv', '/sitemap.xml']) {
      expect(legallyServed(p), p).toBe(false);
    }
  });

  it('does not let a lookalike prefix through', () => {
    expect(legallyServed('/pricing-hack')).toBe(false);
    expect(legallyServed('/api/authx')).toBe(false);
  });

  it('answers retired pages and APIs with 410, and sends the home page to membership', async () => {
    const page = await get('/dht');
    expect(page.status).toBe(410);
    expect(await page.text()).toContain('no longer available');
    const api = await get('/api/search?q=x');
    expect(api.status).toBe(410);
    const home = await get('/');
    expect(home.status).toBe(307);
    expect(home.headers.get('location')).toBe('https://bittorrented.com/pricing');
  });
});
