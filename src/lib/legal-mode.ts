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
  '/invite-only',
  '/invites',
  '/i',
  '/api/invites',
  '/forgot-password',
  '/reset-password',
  '/select-profile',
  '/account',
  '/settings',
  '/connect',
  '/api/auth',
  '/api/account',
  // the user's own key vault (sealed secrets; holds no content)
  '/api/vault',
  '/api/profiles',
  '/api/family',
  '/api/connect',
  '/api/v1/me',
  // Customer webhooks: endpoint management only, no content (lib/webhooks).
  '/api/v1/webhooks',
  '/api/v1/nixamp',
  // Sign in with / Connect CoinPay: account identity only, no content.
  '/api/v1/coinpay',
  // Keys from logicsrc into the member's own key vault (sealed; holds no content).
  '/api/v1/logicsrc',
  // memberships and payments
  '/pricing',
  // what a plan includes, with each paid feature linked or locked (src/app/features)
  '/features',
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
  // the x402 crawl sales page and its checkout (src/lib/crawl-gateway.ts): sells a day of
  // crawl access to what is served here, nothing behind the gates
  '/crawl',
  '/admin',
  '/api/admin',
  '/email',
  '/api/email',
  '/api/push',
  '/api/health',
  '/api/public',
  // VOD storefronts: only admins can add a library (/api/vod stays off), so every one is reviewed
  '/vod',
  // live translated audio of what a member is already playing (src/lib/translate)
  '/api/translate',
  // podcasts: publishers distribute these freely by RSS; we play their feeds
  '/podcasts',
  '/api/podcasts',
  // Watch parties: any member can join one; hosting needs a plan and is checked in the
  // route (POST /api/watch-party). The film is whatever link the host hands the room.
  '/watch-party',
  '/api/watch-party',
  // The torlink installer for a member's own machine (src/lib/seedbox/local-install.ts):
  // a script that installs open-source software, with no content and no secret in it.
  '/torlink',
  // site furniture
  '/.well-known',
  '/robots.txt',
  // lists only the public pages (src/lib/public-sitemap.ts), never the index
  '/sitemap.xml',
  '/sitemaps',
  '/sw.js',
  // exact file names: under() matches a whole segment, so '/manifest' never matched these
  '/manifest.json',
  '/manifest.webmanifest',
  '/favicon.ico',
];

/**
 * Paid features (Anthony, 2026-11-25: "move simpler features like seedbox iptv to paid
 * accounts"). A member bought a plan and found nothing behind it, because legal mode
 * answered 410 for every tool the pricing page listed. These are the member's own tools:
 * their playlist, their seedbox, their feeds, their camera. Nothing here is an index we
 * run or a line we resell, so the DHT index, the torrent and media browsers, radio,
 * Spotify, Live TV passes and the rental storefronts all stay off.
 *
 * A path under one of these prefixes is served to an account with an active plan (trial,
 * Premium or Family, the same test as requireActiveSubscription) and answers "upgrade"
 * to any other member: a redirect to /pricing for a page, 402 for the API.
 */
export interface PaidFeature {
  key: string;
  label: string;
  /** One line for the pricing page and /features. */
  blurb: string;
  /** Where the feature lives. */
  href: string;
  prefixes: string[];
}

export const PAID_FEATURES: PaidFeature[] = [
  {
    key: 'live-tv',
    label: 'Live TV',
    blurb: 'Add your own IPTV playlist (M3U or Xtream) and watch it here, with a guide and Chromecast.',
    href: '/live-tv',
    prefixes: ['/live-tv', '/api/iptv/playlists', '/api/iptv/channels', '/api/iptv/epg', '/api/iptv/cache', '/api/iptv-proxy', '/api/cast', '/api/favorites/iptv-channels'],
  },
  {
    key: 'seedboxes',
    label: 'Seedboxes',
    blurb: 'Connect your own seedbox, send it torrents and stream the files straight from it.',
    href: '/seedboxes',
    prefixes: ['/seedboxes', '/api/account/seedbox', '/api/account/seedboxes', '/api/seedbox/add', '/api/seedbox/stream'],
  },
  {
    key: 'go-live',
    label: 'Go Live',
    blurb: 'Broadcast your camera or screen on c0mpute Live in one click and share the watch link.',
    href: '/live',
    prefixes: ['/live', '/api/live'],
  },
  {
    key: 'news',
    label: 'News',
    blurb: 'Headlines with AI summaries and read-aloud audio.',
    href: '/news',
    prefixes: ['/news', '/api/news'],
  },
  {
    key: 'rss',
    label: 'RSS Reader',
    blurb: 'Follow any feed, import and export OPML, read without the clutter.',
    href: '/rss',
    prefixes: ['/rss', '/api/rss', '/reader', '/api/reader'],
  },
  {
    key: 'finance',
    label: 'Finance',
    blurb: 'Watchlists, quotes, charts and reports, with your own broker keys.',
    href: '/finance',
    prefixes: ['/finance', '/api/finance'],
  },
];

/** Hosting a watch party is a plan feature too; it is enforced in the route, not by path. */
export const WATCH_PARTY_HOST = {
  key: 'watch-party',
  label: 'Host watch parties',
  blurb: 'Start a party, pick what plays and keep up to 50 people on the same second. Joining is free for members.',
  href: '/watch-party',
};

/** Off for everyone but admins, even inside an allowed or paid prefix: selling a line. */
const DENIED = ['/live-tv/rent-out'];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The paid feature a path belongs to, or null. */
export function paidFeatureFor(pathname: string): PaidFeature | null {
  if (DENIED.some((p) => under(pathname, p))) return null;
  return PAID_FEATURES.find((f) => f.prefixes.some((p) => under(pathname, p))) ?? null;
}

/** Served to every member, plan or not. */
export function legallyServed(pathname: string): boolean {
  if (DENIED.some((p) => under(pathname, p))) return false;
  // A paid prefix can sit inside an allowed one (/api/account/seedbox under /api/account).
  if (paidFeatureFor(pathname)) return false;
  return ALLOWED.some((p) => under(pathname, p));
}

export type PathAccess = 'open' | 'paid' | 'gone';

/** What legal mode says about a path for a member who is not an admin. */
export function accessFor(pathname: string): PathAccess {
  if (paidFeatureFor(pathname)) return 'paid';
  return legallyServed(pathname) ? 'open' : 'gone';
}

/**
 * A member without a plan asked for a paid feature. Pages go to the pricing page, which
 * names the feature; the API answers 402 so a client can tell "upgrade" from "gone".
 */
export function upgradeResponse(
  pathname: string,
  feature: Pick<PaidFeature, 'key' | 'label'>,
  requestUrl: string | URL
): Response {
  const headers = { 'cache-control': 'no-store' };
  if (pathname.startsWith('/api/')) {
    return Response.json(
      {
        error: 'paid_plan_required',
        message: `${feature.label} is part of a paid plan.`,
        feature: feature.key,
        upgradeUrl: '/pricing',
      },
      { status: 402, headers }
    );
  }
  // Absolute: Next.js answers 500 "Invalid URL" for a relative Location from the proxy.
  const location = new URL(`/pricing?upgrade=${encodeURIComponent(feature.key)}`, requestUrl).toString();
  return new Response(null, { status: 307, headers: { ...headers, location } });
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
  <p><a href="/features">What your membership includes</a> · <a href="/account">Your account</a></p>
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
