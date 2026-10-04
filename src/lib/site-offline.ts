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
 */

export const SITE_OFFLINE = true;

const STILL_SERVED = ['/api/health', '/api/webhooks'];

export function stillServed(pathname: string): boolean {
  return STILL_SERVED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const NOTICE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BitTorrented is offline</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.6 system-ui, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 34rem; padding: 2rem 16px; }
  h1 { font-size: 1.6rem; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; }
</style>
</head>
<body>
<main>
  <h1>BitTorrented is offline</h1>
  <p>We have taken BitTorrented.com offline while we review the service. Search, streaming, seedboxes and accounts are unavailable for now.</p>
  <p>Your account and data are kept and have not been deleted.</p>
  <p>Questions: <a href="mailto:support@profullstack.com">support@profullstack.com</a></p>
</main>
</body>
</html>`;

/** The notice: 503 so search engines treat it as temporary and drop nothing they would have to re-learn. */
export function offlineResponse(pathname: string): Response {
  const headers = { 'retry-after': '86400', 'cache-control': 'no-store' };
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'BitTorrented is offline while the service is reviewed.' }, { status: 503, headers });
  }
  return new Response(NOTICE_HTML, { status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
