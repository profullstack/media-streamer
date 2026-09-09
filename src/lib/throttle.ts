/**
 * The site-wide allowance: a hundred requests a minute, per caller, on every
 * route. Going over is answered 402 with the crawl gateway's offer, not 429.
 *
 * WHY EVERY ROUTE. The limiter this replaces watched three API prefixes and
 * two page paths. That is the shape every site in the fleet had, and it is the
 * shape that failed on coinpayportal: a headless browser found a route nobody
 * had listed and walked 19,000 of its URLs a day for two days, declaring
 * nothing, tripping no list, rendering every page server-side against a
 * metered upstream. The expensive routes were never the ones at risk. The
 * unlisted ones were.
 *
 * The tuned numbers below are kept. What changes is that everything NOT in
 * this list is now metered too, at the house default.
 *
 * Imports nothing Node-only: the proxy may run at the edge.
 */

import { createThrottle } from '@profullstack/throttle';
import { gateway, hasApiBearer } from '@/lib/crawl-gateway';

const SESSION_COOKIE_NAME = 'sb-auth-token';

/** The session's own access token, as a bucket key -- not a boolean. */
function sessionKey(request: Request): string | null {
  const raw = /(?:^|;\s*)sb-auth-token=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
  if (!raw) return null;
  try {
    const session = JSON.parse(decodeURIComponent(raw)) as { access_token?: unknown };
    return typeof session.access_token === 'string' ? session.access_token : null;
  } catch {
    return null;
  }
}

export const throttle = createThrottle({
  gateway,
  /*
   * A signed-in reader and an API integration each get the larger budget,
   * keyed on the credential itself so two of them never share one. The gate
   * exempts both outright -- it is deciding whether to charge a crawler, and a
   * session is good evidence of a person. Here they are still metered, because
   * this is deciding whether anyone at all is reading 19,000 pages an hour.
   */
  credentialFrom: (request) =>
    sessionKey(request) ??
    (hasApiBearer(request)
      ? (/^Bearer\s+(\S+)/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null)
      : null),
  credential: { limit: 600, ceiling: 1200 },
  rules: [
    /* The expensive ones, at the numbers they were already tuned to. */
    { path: '/api/search/', limit: 30 },
    { path: '/api/dht/', limit: 30 },
    { path: '/api/torrent-search', limit: 30 },
    { path: '/search', limit: 60 },
    { path: '/dht', limit: 60 },
    /* Sign-in stays address-bucketed, or a guess buys the session budget. */
    { path: '/api/auth/', limit: 10, credential: false },
  ],
});

/** Resolves to a Response for a caller over the allowance, or undefined. */
export const meter = (request: Request) => throttle.handle(request);

export { SESSION_COOKIE_NAME };
