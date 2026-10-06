'use client';

/**
 * CastButton: send what this player is playing to a Chromecast / Google TV.
 *
 * Renders nothing unless the browser can cast and a device is on the network.
 * Pressing it opens Chrome's device picker, then loads the same stream on the
 * TV (with a cast token, since the TV has no session of its own) and pauses
 * the local player so the room does not hear it twice. While casting it
 * shows the device name with play/pause and stop.
 */

import { useState } from 'react';
import { Cast, Pause, Play, Square } from 'lucide-react';
import { useCast } from '@/hooks/use-cast';
import { isCastableUrl, type CastMedia } from '@/lib/cast/sender';
import { cn } from '@/lib/utils';

export interface CastButtonProps {
  /** What to cast; null or a non-castable URL (WebTorrent, blob) hides the button. */
  media: CastMedia | null;
  /** The local element, so it can be paused and its position handed over. */
  getMediaElement?: () => HTMLMediaElement | null;
  /** Called once the TV has the stream. */
  onCastStart?: () => void;
  className?: string;
}

export function CastButton({ media, getMediaElement, onCastStart, className }: CastButtonProps): React.ReactElement | null {
  const { available, connected, connecting, deviceName, remotePaused, cast, togglePlay, stop } = useCast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available || !media || !isCastableUrl(media.url)) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    const el = getMediaElement?.() ?? null;
    try {
      await cast({ ...media, startTime: media.startTime ?? (el && !media.live ? el.currentTime : undefined) });
      el?.pause();
      onCastStart?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Casting failed');
    } finally {
      setBusy(false);
    }
  };

  const base =
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary';

  if (connected) {
    return (
      <div className={cn('flex items-center gap-1', className)} data-testid="cast-controls">
        <button type="button" onClick={start} disabled={busy} className={cn(base, 'text-accent-primary')} title={`Cast this to ${deviceName ?? 'TV'}`}>
          <Cast size={18} aria-hidden />
          <span className="max-w-[10rem] truncate">{busy ? 'Sending…' : (deviceName ?? 'Casting')}</span>
        </button>
        <button type="button" onClick={togglePlay} className={base} aria-label={remotePaused ? 'Play on TV' : 'Pause on TV'}>
          {remotePaused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
        </button>
        <button type="button" onClick={stop} className={base} aria-label="Stop casting">
          <Square size={16} aria-hidden />
        </button>
        {error ? <span className="text-xs text-error" role="alert">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={start}
        disabled={busy || connecting}
        className={cn(base, 'text-text-secondary hover:text-text-primary')}
        aria-label="Cast to a TV"
        title="Cast to a TV"
        data-testid="cast-button"
      >
        <Cast size={18} aria-hidden />
        <span className="hidden sm:inline">{busy || connecting ? 'Connecting…' : 'Cast'}</span>
      </button>
      {error ? <span className="text-xs text-error" role="alert">{error}</span> : null}
    </div>
  );
}
