import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LEGAL_MODE, accessFor, legallyServed, paidFeatureFor, upgradeResponse } from './legal-mode';

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

  it('serves credit codes, invites and short invite links', () => {
    for (const p of ['/invites', '/i/ABCDE-FGHJK', '/api/account/redeem', '/api/admin/credit-codes']) {
      expect(legallyServed(p), p).toBe(true);
    }
    expect(legallyServed('/iptv')).toBe(false);
  });

  it('serves Sign in with / Connect CoinPay', () => {
    for (const p of ['/api/v1/coinpay/oauth/start', '/api/v1/coinpay/oauth/callback', '/api/v1/coinpay/connection']) {
      expect(legallyServed(p), p).toBe(true);
    }
  });

  it('serves the customer webhooks API', () => {
    expect(legallyServed('/api/v1/webhooks')).toBe(true);
    expect(legallyServed('/api/v1/webhooks/wh_1/deliveries')).toBe(true);
  });

  it('retires the index, the media browsers and the resale rails, plan or no plan', () => {
    for (const p of ['/dht', '/search', '/find-torrents', '/torrents/abc', '/trending', '/movies', '/tvshows', '/music', '/xxx', '/radio', '/iptv', '/spotify', '/youtube', '/watch/1', '/api/dht', '/api/search', '/api/torrent-search', '/api/magnets', '/api/stream', '/api/radio/proxy', '/api/spotify', '/api/cron/refresh-iptv', '/live-tv/rent-out', '/api/iptv/shares', '/api/iptv/subscription', '/api/seedbox/shares', '/rent/abc']) {
      expect(accessFor(p), p).toBe('gone');
      expect(legallyServed(p), p).toBe(false);
    }
  });

  it("puts the member's own tools behind a plan", () => {
    const paid: Record<string, string> = {
      '/live-tv': 'live-tv',
      '/api/iptv/playlists/1': 'live-tv',
      '/api/iptv/channels': 'live-tv',
      '/api/iptv-proxy': 'live-tv',
      '/api/cast/token': 'live-tv',
      '/seedboxes': 'seedboxes',
      '/api/seedbox/add': 'seedboxes',
      '/api/seedbox/stream': 'seedboxes',
      '/api/account/seedbox': 'seedboxes',
      '/api/account/seedboxes/1': 'seedboxes',
      '/live': 'go-live',
      '/api/live/ingest': 'go-live',
      '/news': 'news',
      '/api/news/summarize': 'news',
      '/rss': 'rss',
      '/reader/1': 'rss',
      '/finance/ticker/AAPL': 'finance',
    };
    for (const [p, key] of Object.entries(paid)) {
      expect(paidFeatureFor(p)?.key, p).toBe(key);
      expect(accessFor(p), p).toBe('paid');
      // Not free, even where the prefix sits inside an allowed one (/api/account).
      expect(legallyServed(p), p).toBe(false);
    }
    // The rest of /api/account stays open, and a lookalike is not a paid path.
    expect(accessFor('/api/account/redeem')).toBe('open');
    expect(paidFeatureFor('/live-tvx')).toBeNull();
    expect(paidFeatureFor('/livestock')).toBeNull();
  });

  it('lets any member into a watch party and onto the features page', () => {
    for (const p of ['/watch-party', '/api/watch-party', '/api/watch-party/join', '/features']) {
      expect(accessFor(p), p).toBe('open');
    }
  });

  it('answers a paid path with an upgrade: a redirect for a page, 402 for the API', async () => {
    const feature = paidFeatureFor('/live-tv');
    if (!feature) throw new Error('no feature');
    const page = upgradeResponse('/live-tv', feature, 'https://bittorrented.com/live-tv');
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('https://bittorrented.com/pricing?upgrade=live-tv');
    const api = upgradeResponse('/api/iptv/playlists', feature, 'https://bittorrented.com/api/iptv/playlists');
    expect(api.status).toBe(402);
    expect(await api.json()).toMatchObject({ error: 'paid_plan_required', feature: 'live-tv' });
  });

  it('serves robots.txt and the sitemap, which lists only public pages', () => {
    for (const p of ['/robots.txt', '/sitemap.xml', '/sitemaps/static.xml']) {
      expect(legallyServed(p), p).toBe(true);
    }
  });

  it('serves the web manifest every page links', () => {
    expect(legallyServed('/manifest.json')).toBe(true);
    expect(legallyServed('/manifest.webmanifest')).toBe(true);
  });

  it('serves translated audio of what a member is playing', () => {
    expect(legallyServed('/api/translate/hear')).toBe(true);
    expect(legallyServed('/api/translate/synthesize')).toBe(true);
  });

  it('serves VOD storefronts but not adding a library', () => {
    expect(legallyServed('/vod/HQiE_OMRBuu6')).toBe(true);
    expect(legallyServed('/api/vod/providers')).toBe(false);
  });

  it('does not let a lookalike prefix through', () => {
    expect(legallyServed('/pricing-hack')).toBe(false);
    expect(legallyServed('/api/authx')).toBe(false);
  });

  it('answers retired pages and APIs with 410, and sends the home page to what membership includes', async () => {
    const page = await get('/dht');
    expect(page.status).toBe(410);
    expect(await page.text()).toContain('no longer available');
    const api = await get('/api/search?q=x');
    expect(api.status).toBe(410);
    const home = await get('/');
    expect(home.status).toBe(307);
    expect(home.headers.get('location')).toBe('https://bittorrented.com/features');
  });
});
