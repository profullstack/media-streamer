import { describe, expect, it } from 'vitest';
import { publicSitemapXml } from './public-sitemap';
import { openWhileInviteOnly } from './site-offline';
import { legallyServed } from './legal-mode';

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('public sitemap', () => {
  const xml = publicSitemapXml(
    [
      { slug: 'newest-post', date: '2026-11-21' },
      { slug: 'older-post', date: '2026-11-01' },
      { slug: '../escape', date: '2026-11-01' },
    ],
    'https://bittorrented.com'
  );

  it('is a urlset on bittorrented.com only', () => {
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const loc of locs(xml)) expect(loc.startsWith('https://bittorrented.com/')).toBe(true);
  });

  it('lists only pages a signed-out visitor can open', () => {
    for (const loc of locs(xml)) {
      const path = new URL(loc).pathname;
      expect(openWhileInviteOnly(path), path).toBe(true);
      expect(legallyServed(path), path).toBe(true);
    }
    expect(xml).not.toMatch(/torrents|\/dht|\/search|\/xxx/);
  });

  it('lists blog posts newest first with their date, and skips odd slugs', () => {
    const posts = locs(xml).filter((l) => l.includes('/blog/'));
    expect(posts).toEqual(['https://bittorrented.com/blog/newest-post', 'https://bittorrented.com/blog/older-post']);
    expect(xml).toContain('<lastmod>2026-11-21</lastmod>');
  });
});
