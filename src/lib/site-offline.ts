/**
 * bittorrented.com is offline.
 *
 * Taken down 2026-10-04 at Anthony's request while what the site does (the DHT
 * index, seedboxes, stream resale) is reviewed with counsel. Every page and API
 * answers 503 with a short notice. Nothing is deleted: the database, user
 * accounts, files and logs are all kept exactly as they are.
 *
 * Two kinds of path still pass: the health check (so monitoring can tell
 * "offline on purpose" from "down"), and payment webhooks (so a payment already
 * in flight is still recorded rather than lost). Turning the site back on is
 * `SITE_OFFLINE = false`.
 *
 * Invite only (Anthony, 2026-10-06): instead of a bare notice, a visitor who is not an
 * admin is sent to /invite-only. Signing up is open again, but only with an unused
 * invite code (src/lib/invites.ts; the database refuses any other signup), and a new
 * account still sees /invite-only rather than the site. Members create invites there.
 */

export const SITE_OFFLINE = true;

const STILL_SERVED = ['/api/health', '/api/webhooks'];

export function stillServed(pathname: string): boolean {
  return STILL_SERVED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const INVITE_ONLY_PAGE = '/invite-only';

/** Open to everyone while the site is invite only: the screen itself, signup, and the invites API. */
const INVITE_ONLY_OPEN = [INVITE_ONLY_PAGE, '/signup', '/api/invites'];

export function openWhileInviteOnly(pathname: string): boolean {
  return INVITE_ONLY_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Pages go to the invite-only screen; the API answers 503 so clients and search
 * engines treat it as temporary.
 */
export function offlineResponse(pathname: string, requestUrl: string | URL): Response {
  const headers = { 'cache-control': 'no-store' };
  if (pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'BitTorrented is invite only and not open yet.' },
      { status: 503, headers: { ...headers, 'retry-after': '86400' } }
    );
  }
  // Absolute: Next.js answers 500 "Invalid URL" for a relative Location from the proxy.
  const location = new URL(INVITE_ONLY_PAGE, requestUrl).toString();
  return new Response(null, { status: 307, headers: { ...headers, location } });
}
