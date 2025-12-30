'use client';

/**
 * Torrent List Component
 *
 * Displays a list of indexed torrents with file counts, sizes, and health indicators.
 */

import Link from 'next/link';
import { formatBytes } from '@/lib/utils';
import { calculateHealthBars, getHealthBarColors } from '@/lib/torrent-health';
import { FolderIcon, ChevronRightIcon, MusicIcon, VideoIcon, BookIcon } from '@/components/ui/icons';

interface TorrentFile {
  id: string;
  name: string;
  mediaCategory: 'audio' | 'video' | 'ebook' | 'document' | 'other';
}

interface Torrent {
  id: string;
  infohash: string;
  name: string;
  /** Clean title for display (without quality indicators, codecs, etc.) */
  cleanTitle?: string | null;
  totalSize: number;
  fileCount: number;
  createdAt: string;
  files?: TorrentFile[];
  /** Number of seeders (peers with complete copies), null if unknown */
  seeders?: number | null;
  /** Number of leechers (peers downloading), null if unknown */
  leechers?: number | null;
}

interface TorrentListProps {
  torrents: Torrent[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function TorrentList({
  torrents,
  isLoading = false,
  emptyMessage = 'No torrents found',
}: TorrentListProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <TorrentSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (torrents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FolderIcon className="mb-4 text-text-muted" size={48} />
        <p className="text-text-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {torrents.map((torrent) => (
        <TorrentCard key={torrent.id} torrent={torrent} />
      ))}
    </div>
  );
}

interface TorrentCardProps {
  torrent: Torrent;
}

/**
 * Health indicator component showing 5 bars colored based on seeder/leecher ratio.
 * Green = healthy (many seeders), Red = unhealthy (few seeders)
 */
interface HealthIndicatorProps {
  seeders: number | null | undefined;
  leechers: number | null | undefined;
}

function HealthIndicator({ seeders, leechers }: HealthIndicatorProps): React.ReactElement {
  const bars = calculateHealthBars(seeders ?? null, leechers ?? null);
  const colors = getHealthBarColors(bars);

  return (
    <div className="flex items-center gap-0.5" title={`Health: ${bars}/5 (${seeders ?? '?'} seeders, ${leechers ?? '?'} leechers)`}>
      {colors.map((color, index) => (
        <div
          key={index}
          className={`h-3 w-1 rounded-sm ${color}`}
          style={{ height: `${8 + index * 2}px` }}
        />
      ))}
    </div>
  );
}

function TorrentCard({ torrent }: TorrentCardProps): React.ReactElement {
  const mediaStats = getMediaStats(torrent.files ?? []);

  return (
    <Link
      href={`/torrents/${torrent.infohash}`}
      className="card-hover flex items-center gap-4 p-4 transition-transform hover:scale-[1.01]"
    >
      {/* Icon */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-primary/20">
        <FolderIcon className="text-accent-primary" size={24} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-text-primary">
          {torrent.cleanTitle ?? torrent.name}
        </h3>
        {/* Show raw name in grey if different from clean title */}
        {torrent.cleanTitle && torrent.cleanTitle !== torrent.name && (
          <p className="truncate text-xs text-text-muted" title={torrent.name}>
            {torrent.name}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
          <span>{formatBytes(torrent.totalSize)}</span>
          <span>{torrent.fileCount} files</span>
          {mediaStats.audio > 0 && (
            <span className="flex items-center gap-1">
              <MusicIcon size={14} className="text-accent-audio" />
              {mediaStats.audio}
            </span>
          )}
          {mediaStats.video > 0 && (
            <span className="flex items-center gap-1">
              <VideoIcon size={14} className="text-accent-video" />
              {mediaStats.video}
            </span>
          )}
          {mediaStats.ebook > 0 && (
            <span className="flex items-center gap-1">
              <BookIcon size={14} className="text-accent-ebook" />
              {mediaStats.ebook}
            </span>
          )}
        </div>
      </div>

      {/* Health Indicator */}
      <HealthIndicator seeders={torrent.seeders} leechers={torrent.leechers} />

      {/* Arrow */}
      <ChevronRightIcon className="shrink-0 text-text-muted" size={20} />
    </Link>
  );
}

function TorrentSkeleton(): React.ReactElement {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="skeleton h-12 w-12 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

interface MediaStats {
  audio: number;
  video: number;
  ebook: number;
  other: number;
}

function getMediaStats(files: TorrentFile[]): MediaStats {
  return files.reduce(
    (acc, file) => {
      switch (file.mediaCategory) {
        case 'audio':
          acc.audio++;
          break;
        case 'video':
          acc.video++;
          break;
        case 'ebook':
          acc.ebook++;
          break;
        default:
          acc.other++;
      }
      return acc;
    },
    { audio: 0, video: 0, ebook: 0, other: 0 }
  );
}
