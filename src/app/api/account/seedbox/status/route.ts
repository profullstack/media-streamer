import { NextResponse } from 'next/server';

import type { SeedboxFilesConfig } from '@/lib/seedbox/config';
import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import { filesAuthHeaders } from '@/lib/seedbox/files';
import { buildAuthHeaders } from '@/lib/seedbox/http-transport';
import { isLiveTorrent } from '@/lib/seedbox/torlink-reconcile';

// Live torlink status for the account's seedbox: what's downloading, queued,
// paused or seeding, with per-torrent progress/speed/peers and upload totals.
// Proxies torlink's authenticated `GET <serve>/status` (keeps the bearer token
// server-side) and normalizes it. torlink's /status returns:
//   { downloads: [{ id=infohash, name, status, progress(0-100), peers, speed }],
//     seeds:     [{ id=infohash, name, status, peers, uploaded }] }
// A finished torrent moves to `seeds` (or shows status "seeding" in downloads).
//
// torlink persists seed records (and restores them on restart) and only marks a
// torrent "missing" after its own stray-detection fires, so deleted torrents can
// linger in /status. We reconcile against the file server's live directory
// listing so the page reflects what's actually on disk, not stale history. See
// {@link isLiveTorrent}.

export const dynamic = 'force-dynamic';

/**
 * Top-level entry names currently on the seedbox (the dir torlink seeds from).
 * torlink's file server answers `GET <base>/` with `{ entries: [{ name, ... }] }`.
 * Returns null (⇒ skip reconciliation, fail open) if there's no file server
 * configured or the listing can't be fetched/parsed.
 */
async function listOnDiskNames(files: SeedboxFilesConfig | null): Promise<string[] | null> {
  if (!files?.baseUrl) return null;
  const url = `${files.baseUrl.replace(/\/+$/, '')}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: filesAuthHeaders(files),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { entries?: { name?: string }[] };
    if (!Array.isArray(json.entries)) return null;
    return json.entries.map((e) => e?.name ?? '').filter((n): n is string => Boolean(n));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface TorlinkDownload {
  id?: string;
  name?: string;
  status?: string;
  progress?: number;
  peers?: number;
  speed?: number;
}
interface TorlinkSeed {
  id?: string;
  name?: string;
  status?: string;
  peers?: number;
  uploaded?: number;
}
interface TorlinkStatus {
  downloads?: TorlinkDownload[];
  seeds?: TorlinkSeed[];
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  // Status is a torlink (HTTP transport) feature; nothing to poll otherwise.
  if (!config?.http) {
    return NextResponse.json({ configured: false }, { status: 200, headers: NO_STORE });
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
      return NextResponse.json(
        { configured: true, reachable: true, error: `torlink /status returned ${res.status}` },
        { status: 200, headers: NO_STORE }
      );
    }
    const data = (await res.json()) as TorlinkStatus;
    // Ground-truth: what's actually on disk right now (null ⇒ can't tell).
    const onDisk = await listOnDiskNames(config.files);
    const downloads = (data.downloads ?? [])
      .map((d) => ({
        id: (d.id ?? '').toLowerCase(),
        name: d.name ?? '(unknown)',
        status: d.status ?? 'downloading',
        // torlink reports progress as a percent (0-100); clamp defensively.
        progress: Math.max(0, Math.min(100, typeof d.progress === 'number' ? d.progress : 0)),
        peers: d.peers ?? 0,
        speed: d.speed ?? 0,
      }))
      .filter((d) => isLiveTorrent(d.status, d.name, onDisk));
    const seeds = (data.seeds ?? [])
      .map((s) => ({
        id: (s.id ?? '').toLowerCase(),
        name: s.name ?? '(unknown)',
        status: s.status ?? 'seeding',
        peers: s.peers ?? 0,
        uploaded: s.uploaded ?? 0,
      }))
      .filter((s) => isLiveTorrent(s.status, s.name, onDisk));
    return NextResponse.json(
      { configured: true, reachable: true, reconciled: onDisk !== null, downloads, seeds },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      { configured: true, reachable: false, error: error instanceof Error ? error.message : String(error) },
      { status: 200, headers: NO_STORE }
    );
  } finally {
    clearTimeout(timer);
  }
}
