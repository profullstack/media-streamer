'use client';

/**
 * Seedboxes → Torlink status
 *
 * Live view of what the account's torlink seedbox is doing: every torrent with
 * its status (downloading / queued / paused / seeding / failed), a progress bar,
 * download speed, peer count, and upload total. Polls the server-side status
 * proxy every few seconds while visible (the bearer token never reaches the
 * browser). See {@link file://../api/account/seedbox/status/route.ts}.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DownloadIcon, LoadingSpinner, RefreshIcon, UsersIcon } from '@/components/ui/icons';

const POLL_MS = 3000;

interface RawDownload {
  id: string;
  name: string;
  status: string;
  progress: number;
  peers: number;
  speed: number;
}
interface RawSeed {
  id: string;
  name: string;
  status: string;
  peers: number;
  uploaded: number;
}
interface StatusResponse {
  configured?: boolean;
  reachable?: boolean;
  error?: string;
  downloads?: RawDownload[];
  seeds?: RawSeed[];
}

/** A torrent merged from torlink's `downloads` + `seeds` arrays (by infohash). */
export interface Torrent {
  id: string;
  name: string;
  status: string;
  progress: number; // 0-100
  peers: number;
  speed: number; // bytes/s (download)
  uploaded: number; // bytes total uploaded
}

// Sort/priority so the most "active" work floats to the top of the list.
const STATUS_RANK: Record<string, number> = {
  downloading: 0,
  queued: 1,
  paused: 2,
  seeding: 3,
  failed: 4,
};

/**
 * Merge torlink's `downloads` and `seeds` into one deduped torrent list. A
 * just-finished torrent can appear in both arrays; we key by infohash and fold
 * the seed's upload total + peers onto the download entry. Seeding torrents are
 * treated as 100% complete.
 */
export function mergeTorrents(downloads: RawDownload[] = [], seeds: RawSeed[] = []): Torrent[] {
  const byId = new Map<string, Torrent>();
  for (const d of downloads) {
    byId.set(d.id, {
      id: d.id,
      name: d.name,
      status: d.status,
      progress: d.status === 'seeding' ? 100 : d.progress,
      peers: d.peers,
      speed: d.speed,
      uploaded: 0,
    });
  }
  for (const s of seeds) {
    const existing = byId.get(s.id);
    if (existing) {
      existing.uploaded = s.uploaded;
      existing.peers = Math.max(existing.peers, s.peers);
      if (existing.status !== 'seeding') existing.status = s.status;
      if (existing.status === 'seeding') existing.progress = 100;
    } else {
      byId.set(s.id, {
        id: s.id,
        name: s.name,
        status: s.status || 'seeding',
        progress: 100,
        peers: s.peers,
        speed: 0,
        uploaded: s.uploaded,
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/** Human-readable bytes (1024-based). */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const fmtSpeed = (n: number): string => `${fmtBytes(n)}/s`;

const STATUS_STYLE: Record<string, string> = {
  downloading: 'bg-accent-primary/15 text-accent-primary',
  queued: 'bg-bg-tertiary text-text-secondary',
  paused: 'bg-amber-500/15 text-amber-500',
  seeding: 'bg-green-500/15 text-green-500',
  failed: 'bg-status-error/15 text-status-error',
};

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
        STATUS_STYLE[status] ?? 'bg-bg-tertiary text-text-secondary'
      )}
    >
      {status}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-lg font-semibold text-text-primary tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
    </div>
  );
}

function TorrentRow({ t }: { t: Torrent }): React.ReactElement {
  const seeding = t.status === 'seeding';
  const barColor = t.status === 'failed' ? 'bg-status-error' : seeding ? 'bg-green-500' : 'bg-accent-primary';
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary" title={t.name}>
          {t.name}
        </span>
        <StatusBadge status={t.status} />
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', barColor)}
          style={{ width: `${Math.round(t.progress)}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary tabular-nums">
        <span className="text-text-primary">{Math.round(t.progress)}%</span>
        {!seeding && t.speed > 0 ? (
          <span className="flex items-center gap-1">
            <DownloadIcon size={13} /> {fmtSpeed(t.speed)}
          </span>
        ) : null}
        {t.uploaded > 0 ? <span>↑ {fmtBytes(t.uploaded)}</span> : null}
        <span className="flex items-center gap-1">
          <UsersIcon size={13} /> {t.peers} {t.peers === 1 ? 'peer' : 'peers'}
        </span>
      </div>
    </li>
  );
}

export function TorlinkStatus(): React.ReactElement {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // Guard against overlapping/late responses when polling.
  const inFlight = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/account/seedbox/status', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as StatusResponse;
      setData(json);
      setFetchError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <LoadingSpinner size={18} className="text-accent-primary" />
        Loading torlink status…
      </div>
    );
  }

  if (data && data.configured === false) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-sm text-text-secondary">
        No torlink seedbox connected. Go to the <span className="font-medium text-text-primary">Setup</span> tab and
        run <span className="font-medium text-text-primary">Install torlink &amp; open ports</span> (or add an HTTP
        seedbox), then come back here.
      </div>
    );
  }

  const unreachable = Boolean(fetchError) || (data && (data.reachable === false || Boolean(data.error)));
  const errorText = fetchError ?? data?.error ?? 'seedbox unreachable';
  const torrents = mergeTorrents(data?.downloads, data?.seeds);
  const downloadingCount = torrents.filter((t) => t.status === 'downloading' || t.status === 'queued').length;
  const seedingCount = torrents.filter((t) => t.status === 'seeding').length;
  const totalSpeed = torrents.reduce((sum, t) => sum + (t.status === 'seeding' ? 0 : t.speed), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              unreachable ? 'bg-status-error' : 'bg-green-500'
            )}
          />
          {unreachable ? 'Seedbox unreachable' : 'Live'}
          {updatedAt ? (
            <span>· updated {new Date(updatedAt).toLocaleTimeString()}</span>
          ) : null}
        </div>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <RefreshIcon size={14} /> Refresh
        </button>
      </div>

      {unreachable ? (
        <div className="rounded-lg border border-status-error/40 bg-status-error/5 p-3 text-sm text-status-error">
          Couldn&apos;t reach torlink: {errorText}. Check the seedbox is up and the ports are open (Setup → Test
          connection).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Downloading" value={String(downloadingCount)} />
            <StatTile label="Seeding" value={String(seedingCount)} />
            <StatTile label="Torrents" value={String(torrents.length)} />
            <StatTile label="↓ Speed" value={fmtSpeed(totalSpeed)} />
          </div>

          {torrents.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-text-secondary">
              <DownloadIcon size={22} className="mx-auto mb-2 text-text-tertiary" />
              Nothing on the seedbox right now. Send a torrent with{' '}
              <span className="font-medium text-text-primary">Send to seedbox</span> and it&apos;ll show up here.
            </div>
          ) : (
            <ul className="space-y-2">
              {torrents.map((t) => (
                <TorrentRow key={t.id || t.name} t={t} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
