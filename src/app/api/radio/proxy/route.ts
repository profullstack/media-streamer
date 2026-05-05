/**
 * SiriusXM HLS Proxy Route
 *
 * Proxies SiriusXM HLS playlists, segments, and AES key requests through the
 * server so the browser doesn't need the bearer token. Mirrors the local
 * proxy in bin/play-siriusxm.ts.
 *
 * GET /api/radio/proxy?u=<encoded_target_url>&quality=<256|128|64|32>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  decodeSiriusXmKeyJson,
  looksLikePlaylist,
  rewriteSiriusXmPlaylist,
  siriusXmHeaders,
} from '@/lib/radio';
import { withSiriusXmUser } from '@/lib/radio/siriusxm-auth';
import type { SiriusXmQuality } from '@/lib/radio';

export const dynamic = 'force-dynamic';

const VALID_QUALITIES: ReadonlyArray<SiriusXmQuality> = ['256', '128', '64', '32'];

function parseQuality(value: string | null): SiriusXmQuality {
  if (value && (VALID_QUALITIES as readonly string[]).includes(value)) {
    return value as SiriusXmQuality;
  }
  return '256';
}

function isAllowedTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('siriusxm.com');
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams, origin } = new URL(request.url);
  const target = searchParams.get('u');
  const quality = parseQuality(searchParams.get('quality'));

  if (!target) {
    return new Response('missing u', { status: 400 });
  }

  if (!isAllowedTarget(target)) {
    return new Response('forbidden target', { status: 403 });
  }

  return withSiriusXmUser(user.id, () => handleProxy(target, quality, origin));
}

async function handleProxy(target: string, quality: SiriusXmQuality, origin: string): Promise<Response> {
  let upstream: Response;
  try {
    const headers = await siriusXmHeaders({
      Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    });
    upstream = await fetch(target, { headers });
  } catch (error) {
    return new Response(`proxy fetch failed: ${error instanceof Error ? error.message : String(error)}`, {
      status: 502,
    });
  }

  const contentType = upstream.headers.get('content-type') ?? '';

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    return new Response(`upstream ${upstream.status}: ${body.slice(0, 500)}`, {
      status: upstream.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // SiriusXM returns AES keys as JSON. HLS players need raw bytes.
  if (target.includes('/playback/key/v1/')) {
    try {
      const json = await upstream.json();
      const keyBytes = decodeSiriusXmKeyJson(json);
      return new Response(new Uint8Array(keyBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(keyBytes.length),
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      return new Response(
        `key decode failed: ${error instanceof Error ? error.message : String(error)}`,
        { status: 502 }
      );
    }
  }

  if (looksLikePlaylist(target, contentType)) {
    const text = await upstream.text();
    const rewritten = rewriteSiriusXmPlaylist(text, target, origin, quality);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  // Stream other resources (segments) directly through.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
