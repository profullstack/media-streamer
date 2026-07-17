import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';

// Probe whether the account's seedbox HTTP add-API (:9161) and file server
// (:9160) are actually reachable from this server. "reachable" means we got an
// HTTP response at all (even 401) — a network error/timeout means the port is
// blocked (usually a cloud firewall) or the daemon isn't running. This is what
// turns "Could not reach seedbox: fetch failed" into an actionable diagnosis.

export const dynamic = 'force-dynamic';

interface Probe {
  reachable: boolean;
  status?: number;
  error?: string;
}

async function probe(url: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    // Any HTTP status (200, 401, 404…) means the port is open and answering.
    return { reachable: true, status: res.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /abort/i.test(message);
    return { reachable: false, error: isTimeout ? 'timed out (port likely blocked by a firewall)' : message };
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
  const result: { http?: Probe & { url: string }; files?: Probe & { url: string } } = {};

  if (config?.http?.baseUrl) {
    const base = config.http.baseUrl.replace(/\/+$/, '');
    const url = `${base}/health`;
    result.http = { url, ...(await probe(url)) };
  }
  if (config?.files?.baseUrl) {
    const base = config.files.baseUrl.replace(/\/+$/, '');
    const url = `${base}/`;
    result.files = { url, ...(await probe(url)) };
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
