import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import { buildAuthHeaders } from '@/lib/seedbox/http-transport';

// Report torlink download progress for a torrent the account sent to its
// seedbox. Proxies torlink's authenticated `GET <serve>/status` (keeps the token
// server-side) and matches the download by infohash. torlink's /status returns
// { downloads: [{ id=infohash, name, status, progress(0-1), peers, speed }],
//   seeds: [...] }; a completed torrent shows status "seeding" or moves to seeds.

export const dynamic = 'force-dynamic';

interface TorlinkDownload {
  id?: string;
  name?: string;
  status?: string;
  progress?: number;
  peers?: number;
  speed?: number;
}
interface TorlinkStatus {
  downloads?: TorlinkDownload[];
  seeds?: TorlinkDownload[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  await params; // route param unused; progress is keyed by infohash query
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const infohash = (request.nextUrl.searchParams.get('infohash') ?? '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(infohash)) {
    return NextResponse.json({ error: 'A valid infohash is required' }, { status: 400 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  // Progress is a torlink (HTTP transport) feature; nothing to poll otherwise.
  if (!config?.http) {
    return NextResponse.json({ configured: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const url = `${config.http.baseUrl.replace(/\/+$/, '')}/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: buildAuthHeaders(config.http),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ reachable: true, error: `torlink /status returned ${res.status}` }, { status: 200 });
    }
    const data = (await res.json()) as TorlinkStatus;
    const match = (list?: TorlinkDownload[]): TorlinkDownload | undefined =>
      (list ?? []).find((d) => d.id?.toLowerCase() === infohash);

    const dl = match(data.downloads);
    if (dl) {
      // torlink's `progress` is unreliable (can report >100%), so "done" is driven
      // by status (seeding = fully downloaded), not the percentage.
      const raw = typeof dl.progress === 'number' ? dl.progress : 0;
      const progress = raw > 0 && raw <= 1 ? raw : null; // null = unknown %
      const done = dl.status === 'seeding';
      return NextResponse.json(
        { found: true, done, status: dl.status ?? 'downloading', progress, speed: dl.speed ?? 0, peers: dl.peers ?? 0 },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (match(data.seeds)) {
      return NextResponse.json(
        { found: true, done: true, status: 'seeding', progress: 1, speed: 0, peers: 0 },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    // Not in the queue (yet, or already finished + cleared).
    return NextResponse.json({ found: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } finally {
    clearTimeout(timer);
  }
}
