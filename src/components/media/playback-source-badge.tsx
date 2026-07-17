import { cn } from '@/lib/utils';
import { CheckIcon, DownloadIcon } from '@/components/ui/icons';

/**
 * Small pill showing where a stream is playing from — the user's own seedbox
 * (preferred) or the platform torrent server (the not-ideal fallback).
 */
export function PlaybackSourceBadge({
  source,
  className,
}: {
  source: 'seedbox' | 'platform';
  className?: string;
}): React.ReactElement {
  const seedbox = source === 'seedbox';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        seedbox ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500',
        className
      )}
      title={
        seedbox
          ? 'Streaming from your seedbox'
          : 'Streaming from the platform torrent server (connect a seedbox for faster, direct playback)'
      }
    >
      {seedbox ? <CheckIcon className="h-3 w-3" /> : <DownloadIcon className="h-3 w-3" />}
      {seedbox ? 'Seedbox' : 'Platform stream'}
    </span>
  );
}
