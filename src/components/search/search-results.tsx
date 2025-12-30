'use client';

/**
 * Search Results Component
 *
 * Displays search results with file information, poster images, and actions.
 */

import { cn } from '@/lib/utils';
import {
  MusicIcon,
  VideoIcon,
  BookIcon,
  FileIcon,
  MagnetIcon,
  PlayIcon,
  DownloadIcon,
  LoadingSpinner,
} from '@/components/ui/icons';
import type { SearchResult, MediaCategory } from '@/types';
import { formatBytes } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading?: boolean;
  error?: string | null;
  onFilePlay?: (result: SearchResult) => void;
  onFileDownload?: (result: SearchResult) => void;
  className?: string;
  emptyMessage?: string;
}

/**
 * Get icon for media category
 */
function getMediaIcon(category: MediaCategory): React.ComponentType<{ className?: string; size?: number }> {
  switch (category) {
    case 'audio':
      return MusicIcon;
    case 'video':
      return VideoIcon;
    case 'ebook':
      return BookIcon;
    default:
      return FileIcon;
  }
}

/**
 * Get color class for media category
 */
function getMediaColor(category: MediaCategory): string {
  switch (category) {
    case 'audio':
      return 'text-accent-audio';
    case 'video':
      return 'text-accent-video';
    case 'ebook':
      return 'text-accent-ebook';
    default:
      return 'text-text-secondary';
  }
}

/**
 * Get background color class for media category
 */
function getMediaBgColor(category: MediaCategory): string {
  switch (category) {
    case 'audio':
      return 'bg-accent-audio/10';
    case 'video':
      return 'bg-accent-video/10';
    case 'ebook':
      return 'bg-accent-ebook/10';
    default:
      return 'bg-bg-tertiary';
  }
}

export function SearchResults({
  results,
  isLoading = false,
  error = null,
  onFilePlay,
  onFileDownload,
  className,
  emptyMessage = 'No results found',
}: SearchResultsProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <LoadingSpinner size={32} className="text-accent-primary" />
        <span className="ml-3 text-text-secondary">Searching...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg bg-error/10 p-4 text-center', className)}>
        <p className="text-error">{error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={cn('py-12 text-center', className)}>
        <p className="text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {results.map((result, index) => (
        <SearchResultItem
          key={`${result.torrent.id}-${result.file?.id ?? index}`}
          result={result}
          onPlay={onFilePlay}
          onDownload={onFileDownload}
        />
      ))}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  onPlay?: (result: SearchResult) => void;
  onDownload?: (result: SearchResult) => void;
}

function SearchResultItem({
  result,
  onPlay,
  onDownload,
}: SearchResultItemProps): React.ReactElement {
  const isFile = result.type === 'file' && result.file;
  const Icon = isFile ? getMediaIcon(result.file!.mediaCategory) : MagnetIcon;
  const iconColor = isFile ? getMediaColor(result.file!.mediaCategory) : 'text-accent-primary';
  const bgColor = isFile ? getMediaBgColor(result.file!.mediaCategory) : 'bg-accent-primary/10';
  const imageUrl = result.torrent.posterUrl ?? result.torrent.coverUrl;

  const isPlayable = isFile && (result.file!.mediaCategory === 'audio' || result.file!.mediaCategory === 'video');

  const handlePlay = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (onPlay) {
      onPlay(result);
    }
  };

  const handleDownload = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (onDownload) {
      onDownload(result);
    }
  };

  return (
    <div className="group card-hover flex items-start gap-4 p-4">
      {/* Poster/Cover Image or Icon */}
      {imageUrl ? (
        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-tertiary">
          <Image
            src={imageUrl}
            alt={result.torrent.cleanTitle ?? result.torrent.name}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', bgColor)}>
          <Icon className={iconColor} size={20} />
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* File/Torrent name */}
        <h3 className="truncate font-medium text-text-primary">
          {isFile ? result.file!.name : (result.torrent.cleanTitle ?? result.torrent.name)}
        </h3>

        {/* Path or torrent info */}
        {isFile ? (
          <p className="mt-0.5 truncate text-sm text-text-muted">
            {result.file!.path}
          </p>
        ) : (
          <>
            {/* Show raw name in grey if different from clean title */}
            {result.torrent.cleanTitle && result.torrent.cleanTitle !== result.torrent.name && (
              <p className="truncate text-xs text-text-muted" title={result.torrent.name}>
                {result.torrent.name}
              </p>
            )}
            <p className="mt-0.5 text-sm text-text-muted">
              Torrent
            </p>
          </>
        )}

        {/* Metadata */}
        {result.metadata ? <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-secondary">
            {result.metadata.artist ? <span>{result.metadata.artist}</span> : null}
            {result.metadata.album ? <span>• {result.metadata.album}</span> : null}
            {result.metadata.author ? <span>by {result.metadata.author}</span> : null}
          </div> : null}

        {/* Torrent link for file results */}
        {isFile ? <Link
            href={`/torrents/${result.torrent.id}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
            title={result.torrent.name}
          >
            <MagnetIcon size={12} />
            {result.torrent.cleanTitle ?? result.torrent.name}
          </Link> : null}
      </div>

      {/* Size */}
      {isFile ? <div className="shrink-0 text-sm text-text-muted">
          {formatBytes(result.file!.size)}
        </div> : null}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isPlayable && onPlay ? <button
            type="button"
            onClick={handlePlay}
            className="rounded-lg bg-accent-primary p-2 text-white transition-colors hover:bg-accent-primary/80"
            title="Play"
          >
            <PlayIcon size={16} />
          </button> : null}
        {isFile && onDownload ? <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg bg-bg-tertiary p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="Download"
          >
            <DownloadIcon size={16} />
          </button> : null}
      </div>
    </div>
  );
}

interface SearchResultsHeaderProps {
  total: number;
  query: string;
  className?: string;
}

export function SearchResultsHeader({
  total,
  query,
  className,
}: SearchResultsHeaderProps): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <p className="text-sm text-text-secondary">
        {total === 0 ? (
          <>No results for &quot;{query}&quot;</>
        ) : (
          <>
            Found <span className="font-medium text-text-primary">{total}</span> result
            {total !== 1 ? 's' : ''} for &quot;{query}&quot;
          </>
        )}
      </p>
    </div>
  );
}
