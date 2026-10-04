/**
 * Legal mode: BitTorrented serves only what it is allowed to.
 *
 * Anthony, 2026-10-04: "it needs to be made legal ... go keep memberships". The DHT index,
 * the torrent and media browsers, the seedbox "send any torrent" flow, and the radio, IPTV
 * and Spotify rails are switched off here. Nothing is deleted: the code, the data and the
 * routes stay, they just answer 410 Gone until a feature is reviewed and added to the list
 * below.
 *
 * The rule is an allowlist, not a blocklist, because a feature nobody has checked is a
 * feature nobody can say is legal. A path is served only when it starts with one of these
 * prefixes and is not on DENIED. Everything else answers 410 with a short notice.
 *
 * Memberships stay: charging for speed and convenience on content we may redistribute (GPL
 * ISOs, open licences that allow sale) is legal. The licensed catalog that replaces the index
 * is Phase 2.
 */

export const LEGAL_MODE = true;

const ALLOWED = [
  // accounts and sign-in
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/select-profile',
  '/account',
  '/settings',
  '/connect',
  '/api/auth',
  '/api/account',
  '/api/profiles',
  '/api/family',
  '/api/connect',
  '/api/v1/me',
  '/api/v1/nixamp',
  // memberships and payments
  '/pricing',
  '/pay',
  '/api/payments',
  '/api/subscription',
  '/api/supported-coins',
  '/api/referrals',
  '/api/webhooks',
  '/api/cron/expire-subscriptions',
  // pages about us, and things that hold no third-party content
  '/terms',
  '/privacy',
  '/blog',
  '/admin',
  '/api/admin',
  '/email',
  '/api/email',
  '/api/push',
  '/api/health',
  '/api/public',
  // podcasts: publishers distribute these freely by RSS; we play their feeds
  '/podcasts',
  '/api/podcasts',
  // site furniture
  '/.well-known',
  '/robots.txt',
  '/sw.js',
  '/manifest',
  '/favicon.ico',
];

/** Inside an allowed prefix but still off: managing and streaming from seedboxes. */
const DENIED = ['/api/account/seedbox', '/api/account/seedboxes'];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function legallyServed(pathname: string): boolean {
  if (DENIED.some((p) => under(pathname, p))) return false;
  return ALLOWED.some((p) => under(pathname, p));
}

const GONE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>No longer available · BitTorrented</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.6 system-ui, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 34rem; padding: 2rem 16px; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
</style>
</head>
<body>
<main>
  <h1>This feature is no longer available</h1>
  <p>BitTorrented now only offers content it is licensed to distribute. This part of the site has been retired.</p>
  <p><a href="/pricing">Membership</a> · <a href="/account">Your account</a></p>
</main>
</body>
</html>`;

/** 410 Gone: removed on purpose, so search engines drop it rather than retrying. */
export function goneResponse(pathname: string): Response {
  const headers = { 'cache-control': 'no-store' };
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'This feature is no longer available.' }, { status: 410, headers });
  }
  return new Response(GONE_HTML, { status: 410, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
