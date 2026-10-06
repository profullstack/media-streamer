import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { castClaimsFrom } from '@/lib/cast/token';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import { streamSeedboxFile } from '@/lib/seedbox/stream';

// Stream a completed file from the account's own seedbox file server back to the
// browser. The proxy/transcode/probe logic lives in the shared
// `streamSeedboxFile` helper (also used by the public rental route); this route
// only resolves the caller's own config and authorizes them.

// A single completed-file stream is a slow, long-lived response; don't let the
// platform try to statically optimize or cache it.
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, method: 'GET' | 'HEAD'): Promise<Response> {
  // Session cookie, or the signed ct a Chromecast carries for a cast file.
  const sessionUser = await getCurrentUser();
  const claims = sessionUser ? null : await castClaimsFrom(request.url);
  const user = sessionUser ?? (claims ? { id: claims.userId } : null);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const config = await loadAccountSeedboxConfig(user.id);
  if (!config?.files) {
    return NextResponse.json({ error: 'No seedbox file server is configured' }, { status: 404 });
  }

  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'A file path is required' }, { status: 400 });
  }

  return streamSeedboxFile(config.files, filePath, {
    method,
    range: request.headers.get('range'),
    probe: Boolean(request.nextUrl.searchParams.get('probe')),
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return proxy(request, 'GET');
}

export async function HEAD(request: NextRequest): Promise<Response> {
  return proxy(request, 'HEAD');
}
