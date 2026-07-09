'use client';

/**
 * Seedbox Send Button
 *
 * Shown next to "Download torrent" for allowlisted operators. Fetches seedbox
 * access on mount and renders a send button per configured transport (HTTP /
 * SSH). Pushing hands the magnet to the seedbox server-side.
 */

import { useState, useEffect, useCallback } from 'react';
import { DownloadIcon, LoadingSpinner, CheckIcon } from '@/components/ui/icons';

type SeedboxTransport = 'http' | 'ssh';

interface SeedboxAccess {
  enabled: boolean;
  transports: SeedboxTransport[];
  publicKey: string | null;
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

export function SeedboxSendButton({
  torrentId,
  magnetUri,
  torrentName,
}: SeedboxSendButtonProps): React.ReactElement | null {
  const [access, setAccess] = useState<SeedboxAccess | null>(null);
  const [sending, setSending] = useState<SeedboxTransport | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

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

  const send = useCallback(
    async (transport: SeedboxTransport): Promise<void> => {
      setSending(transport);
      setStatus(null);
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
        } else {
          setStatus({ ok: false, message: data.error ?? 'Failed to send to seedbox' });
        }
      } catch (err) {
        setStatus({ ok: false, message: err instanceof Error ? err.message : 'Failed to send to seedbox' });
      } finally {
        setSending(null);
      }
    },
    [torrentId, magnetUri, torrentName]
  );

  if (!access?.enabled || access.transports.length === 0) return null;

  const showLabels = access.transports.length > 1;

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
        <p
          className={`mt-1.5 flex items-center gap-1.5 text-xs ${
            status.ok ? 'text-green-500' : 'text-error'
          }`}
        >
          {status.ok ? <CheckIcon size={13} /> : null}
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
