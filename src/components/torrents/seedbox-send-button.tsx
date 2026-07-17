'use client';

/**
 * Seedbox Send Button
 *
 * Shown next to "Download torrent" for accounts with a connected seedbox.
 * Fetches seedbox access on mount and renders a send button per configured
 * transport (HTTP / SSH). Pushing hands the magnet to the seedbox server-side.
 * After a send, it polls torlink's download progress (via /status) and shows a
 * progress bar below the button until the download finishes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { DownloadIcon, LoadingSpinner, CheckIcon } from '@/components/ui/icons';
import { formatBytes } from '@/lib/utils';

type SeedboxTransport = 'http' | 'ssh';

interface SeedboxAccess {
  enabled: boolean;
  transports: SeedboxTransport[];
  publicKey: string | null;
}

interface SeedboxProgress {
  found?: boolean;
  done?: boolean;
  status?: string;
  progress?: number | null;
  speed?: number;
  peers?: number;
  configured?: boolean;
}

interface SeedboxSendButtonProps {
  torrentId: string;
  magnetUri: string;
  torrentName: string;
}

const TRANSPORT_LABEL: Record<SeedboxTransport, string> = {
  http: 'HTTP',
  ssh: 'SSH',
};

/** Pull the 40-hex infohash out of a magnet URI (needed to poll progress). */
function infohashFromMagnet(magnet: string): string | null {
  const m = magnet.match(/urn:btih:([0-9a-fA-F]{40})/);
  return m?.[1] ? m[1].toLowerCase() : null;
}

export function SeedboxSendButton({
  torrentId,
  magnetUri,
  torrentName,
}: SeedboxSendButtonProps): React.ReactElement | null {
  const [access, setAccess] = useState<SeedboxAccess | null>(null);
  const [sending, setSending] = useState<SeedboxTransport | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<SeedboxProgress | null>(null);
  const [tracking, setTracking] = useState(false);
  const sawFoundRef = useRef(false);

  const infohash = infohashFromMagnet(magnetUri);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/torrents/${torrentId}/seedbox`);
        if (!res.ok) return;
        const data = (await res.json()) as SeedboxAccess;
        if (!cancelled) setAccess(data);
      } catch {
        // Feature simply stays hidden if we can't resolve access.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [torrentId]);

  // Poll torlink download progress while tracking is on.
  useEffect(() => {
    if (!tracking || !infohash) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/torrents/${torrentId}/seedbox/progress?infohash=${infohash}`);
        const data = (await res.json().catch(() => ({}))) as SeedboxProgress;
        if (cancelled) return;
        if (data.configured === false) {
          setTracking(false); // no HTTP transport → nothing to poll
          return;
        }
        setProgress(data);
        if (data.found) sawFoundRef.current = true;
        // Done when torlink reports it, or when it vanished from the queue after
        // we'd seen it (completed + cleared).
        if (data.done || (sawFoundRef.current && data.found === false)) {
          setProgress({ found: true, done: true, progress: 1, status: 'seeding' });
          setTracking(false);
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tracking, infohash, torrentId]);

  const send = useCallback(
    async (transport: SeedboxTransport): Promise<void> => {
      setSending(transport);
      setStatus(null);
      setProgress(null);
      sawFoundRef.current = false;
      try {
        const res = await fetch(`/api/torrents/${torrentId}/seedbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnet: magnetUri, name: torrentName, transport }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          error?: string;
        };
        if (res.ok && data.success) {
          setStatus({ ok: true, message: data.message ?? 'Sent to seedbox' });
          // Start tracking download progress (torlink /status is HTTP-only).
          if (infohash && access?.transports.includes('http')) setTracking(true);
        } else {
          setStatus({ ok: false, message: data.error ?? 'Failed to send to seedbox' });
        }
      } catch (err) {
        setStatus({ ok: false, message: err instanceof Error ? err.message : 'Failed to send to seedbox' });
      } finally {
        setSending(null);
      }
    },
    [torrentId, magnetUri, torrentName, infohash, access]
  );

  if (!access?.enabled || access.transports.length === 0) return null;

  const showLabels = access.transports.length > 1;
  const isDone = progress?.done === true;
  const hasPct = typeof progress?.progress === 'number';
  const pct = hasPct ? Math.round(Math.min(1, Math.max(0, progress!.progress as number)) * 100) : 0;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {access.transports.map((transport) => (
          <button
            key={transport}
            type="button"
            onClick={() => void send(transport)}
            disabled={sending !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            title={`Send this torrent to your seedbox over ${TRANSPORT_LABEL[transport]}`}
          >
            {sending === transport ? <LoadingSpinner size={16} /> : <DownloadIcon size={18} />}
            {showLabels ? `Send to seedbox (${TRANSPORT_LABEL[transport]})` : 'Send to seedbox'}
          </button>
        ))}
      </div>

      {status ? (
        <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${status.ok ? 'text-green-500' : 'text-error'}`}>
          {status.ok && !tracking ? <CheckIcon size={13} /> : null}
          {status.message}
        </p>
      ) : null}

      {/* Download progress bar (appears after a send, while torlink downloads) */}
      {progress && (tracking || isDone) ? (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
            {isDone ? (
              <div className="h-full w-full bg-green-500" />
            ) : hasPct ? (
              <div className="h-full bg-accent-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            ) : (
              // torlink doesn't give a reliable %, so show an active (pulsing) bar.
              <div className="h-full w-full animate-pulse bg-accent-primary" />
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              {isDone ? (
                <>
                  <CheckIcon size={12} className="text-green-500" /> Ready on seedbox
                </>
              ) : progress.found === false ? (
                'Queued on seedbox…'
              ) : hasPct ? (
                `Downloading on seedbox — ${pct}%`
              ) : (
                'Downloading on seedbox…'
              )}
            </span>
            {!isDone && progress.found && (progress.speed ?? 0) > 0 ? (
              <span>↓ {formatBytes(progress.speed ?? 0)}/s</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
