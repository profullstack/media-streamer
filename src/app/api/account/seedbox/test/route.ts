import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import { buildAuthHeaders } from '@/lib/seedbox/http-transport';
import { filesAuthHeaders } from '@/lib/seedbox/files';

// Probe the account's seedbox end to end:
//  - reachable: did the port answer at all? (network error/timeout => firewall
//    or daemon down)
//  - authorized: did the daemon accept the stored bearer token? (401/403 =>
//    token out of sync — re-run the installer to regenerate + resave it)
// This turns "fetch failed" / "401 unauthorized" into a clear per-transport
// readout so nobody has to guess what to put for auth.

export const dynamic = 'force-dynamic';

interface Probe {
  url: string;
  reachable: boolean;
  authorized: boolean;
  status?: number;
  error?: string;
}

function classify(status: number): { reachable: boolean; authorized: boolean } {
  // Any HTTP response means the port is open. 401/403 means reachable but the
  // token was rejected. Everything else (200, 400 bad-magnet, 404…) means the
  // token was accepted.
  return { reachable: true, authorized: status !== 401 && status !== 403 };
}

async function probe(
  url: string,
  init: RequestInit
): Promise<Omit<Probe, 'url'>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    return { ...classify(res.status), status: res.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /abort/i.test(message);
    return {
      reachable: false,
      authorized: false,
      error: isTimeout ? 'timed out (port blocked by a firewall, or daemon down)' : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  const result: { http?: Probe; files?: Probe } = {};

  // Send path: POST the add endpoint with the token but an EMPTY magnet — the
  // daemon rejects the body (400) if the token is good, or 401 if it isn't.
  // No torrent is added.
  if (config?.http) {
    const http = config.http;
    const url = `${http.baseUrl}${http.addPath.startsWith('/') ? '' : '/'}${http.addPath}`;
    result.http = {
      url,
      ...(await probe(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...buildAuthHeaders(http),
        },
        body: JSON.stringify({ [http.magnetField]: '' }),
      })),
    };
  }

  // Play path: GET the file-server root with the configured auth.
  if (config?.files) {
    const files = config.files;
    const url = `${files.baseUrl.replace(/\/+$/, '')}/`;
    result.files = {
      url,
      ...(await probe(url, { method: 'GET', headers: filesAuthHeaders(files) })),
    };
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
