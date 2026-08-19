/**
 * Resale stream proxy.
 *
 * @route GET /api/public/iptv/[slug]/stream?session=<id>[&seg=<encrypted>]
 *
 * This is the one endpoint where the owner's provider credentials are in play, so
 * it is worth being explicit about what it does and does not do.
 *
 * The platform's general-purpose /api/iptv-proxy takes the upstream URL as a query
 * parameter, "encoded" with encodeURIComponent. That is fine when you are streaming
 * your own playlist to yourself. It cannot be used for resale: the buyer would read
 * the owner's provider username and password straight out of the query string, keep
 * them, and never pay again.
 *
 * So here:
 *   - the stream is addressed by an opaque session id, and the upstream is resolved
 *     server-side on every request from the pass + session;
 *   - HLS manifests are rewritten before they reach the client, with each segment
 *     URL AES-256-GCM encrypted rather than encoded, because a manifest is full of
 *     upstream URLs and proxying one verbatim leaks exactly what the session id was
 *     protecting;
 *   - decrypting a segment still requires a valid, paid, unexpired pass and a live
 *     session, so a leaked ciphertext on its own is inert.
 */

import { NextRequest } from 'next/server';

import { decryptSecret, encryptSecret } from '@/lib/seedbox/crypto';
import { isHlsPlaylist, rewriteManifest } from '@/lib/iptv/shares/manifest';
import { fetchUpstream } from '@/lib/iptv/shares/upstream';
import { IptvResaleError, iptvPassCookieName, resolveUpstreamForSession } from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session');
  const seg = url.searchParams.get('seg');

  if (!sessionId) return new Response('session is required', { status: 400 });

  const cookie = request.cookies.get(iptvPassCookieName(slug))?.value;

  let upstream: string;
  try {
    // Always resolve the pass and session, even for a segment: the ciphertext must
    // never be usable on its own.
    const resolved = await resolveUpstreamForSession(slug, cookie, sessionId);
    upstream = resolved.url;

    if (seg) {
      const decrypted = decryptSecret(seg);
      if (!/^https?:/i.test(decrypted)) return new Response('bad segment', { status: 400 });
      upstream = decrypted;
    }
  } catch (error) {
    if (error instanceof IptvResaleError) {
      // Deliberately terse: an error body here must not describe the upstream.
      return new Response(error.message, { status: error.status });
    }
    return new Response('stream unavailable', { status: 502 });
  }

  const range = request.headers.get('range');
  let upstreamResponse: Awaited<ReturnType<typeof fetchUpstream>>;
  try {
    // Verifies TLS, degrading only for a provider whose certificate is genuinely
    // broken -- see lib/iptv/shares/upstream.ts for why that matters more here.
    upstreamResponse = await fetchUpstream({ url: upstream, range });
  } catch {
    return new Response('upstream unavailable', { status: 502 });
  }

  const contentType = upstreamResponse.headers.get('content-type');
  const selfBase = `${url.origin}/api/public/iptv/${slug}/stream?session=${encodeURIComponent(sessionId)}`;

  if (isHlsPlaylist(contentType) || upstream.includes('.m3u8')) {
    const text = await upstreamResponse.text();
    return new Response(rewriteManifest(text, upstream, selfBase, encryptSecret), {
      status: upstreamResponse.status,
      headers: {
        'content-type': contentType ?? 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
      },
    });
  }

  const headers = new Headers();
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstreamResponse.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('cache-control', 'no-store');

  return new Response(upstreamResponse.body as unknown as ReadableStream, {
    status: upstreamResponse.status,
    headers,
  });
}
