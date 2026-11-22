/**
 * The public sitemap: only what a signed-out visitor can open while the site is
 * invite only (src/lib/site-offline.ts INVITE_ONLY_OPEN, src/lib/legal-mode.ts
 * ALLOWED). No torrent, index, media or member page is ever listed: those
 * redirect to /invite-only, and the old monthly torrent sitemaps are gone.
 */

export type SitemapPost = { slug: string; date: string };

const STATIC_PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/invite-only', changefreq: 'monthly', priority: '1.0' },
  { path: '/blog', changefreq: 'daily', priority: '0.8' },
  { path: '/signup', changefreq: 'monthly', priority: '0.6' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://bittorrented.com').replace(/\/+$/, '');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Static public pages, then blog posts newest first (each with its date as lastmod). */
export function publicSitemapXml(posts: SitemapPost[], origin = siteOrigin()): string {
  const pages = STATIC_PAGES.map(
    (p) =>
      `  <url><loc>${esc(origin + p.path)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  );
  const articles = posts
    .filter((p) => /^[a-z0-9][a-z0-9-]*$/i.test(p.slug))
    .map((p) => {
      const lastmod = /^\d{4}-\d{2}-\d{2}/.test(p.date) ? `<lastmod>${p.date.slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${esc(`${origin}/blog/${p.slug}`)}</loc>${lastmod}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...pages, ...articles].join('\n')}
</urlset>
`;
}
