import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { fetchSeedboxFile, getSeedboxConfig, isEmailAllowed } from '@/lib/seedbox';

// Stream a completed file from the seedbox file server (torlnk files) back to the
// browser. We proxy rather than redirect so the seedbox's token stays server-side
// and there's no CORS/mixed-content issue. Range headers are forwarded, and the
// upstream body is piped through un-buffered — never the whole-file memory path
// that the WebTorrent stream route has to avoid.

// A single completed-file stream is a slow, long-lived response; don't let the
// platform try to statically optimize or cache it.
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, method: 'GET' | 'HEAD'): Promise<Response> {
  const user = await getCurrentUser();
  const config = getSeedboxConfig();
  if (!user || !isEmailAllowed(config, user.email)) {
    return NextResponse.json({ error: 'Seedbox access is not enabled for this account' }, { status: 403 });
  }
  if (!config.files) {
    return NextResponse.json({ error: 'No seedbox file server is configured' }, { status: 404 });
  }

  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'A file path is required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetchSeedboxFile(config.files, filePath, {
      method,
      range: request.headers.get('range'),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not reach seedbox: ${detail}` }, { status: 502 });
  }

  // Pass through the status (200/206/404/416) and the headers a media element
  // needs to seek; strip hop-by-hop and auth-bearing headers.
  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Cache-Control', 'private, no-store');

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return proxy(request, 'GET');
}

export async function HEAD(request: NextRequest): Promise<Response> {
  return proxy(request, 'HEAD');
}
