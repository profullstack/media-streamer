'use client';

/**
 * Browse Grid Component
 *
 * Displays a grid of torrents with sorting and filtering options.
 * Used by category pages (movies, music, tvshows, books).
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SearchIcon, SortIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/ui/icons';
import { calculateHealthBars, getHealthBarColors } from '@/lib/torrent-health';
import type { ContentType } from '@/types';

/**
 * Torrent data from the browse API
 */
interface BrowseTorrent {
  id: string;
  infohash: string;
  name: string;
  totalSize: number;
  fileCount: number;
  posterUrl: string | null;
  coverUrl: string | null;
  contentType: ContentType | null;
  year: number | null;
  seeders: number | null;
  leechers: number | null;
  createdAt: string;
}

/**
 * Browse API response
 */
interface BrowseResponse {
  torrents: BrowseTorrent[];
  total: number;
  limit: number;
  offset: number;
  contentType: string;
  sortBy: string;
  sortOrder: string;
}

/**
 * Sort options
 */
type SortBy = 'date' | 'seeders' | 'name' | 'size';
type SortOrder = 'asc' | 'desc';

interface BrowseGridProps {
  contentType: 'movie' | 'tvshow' | 'music' | 'book';
  title: string;
  description: string;
  emptyMessage: string;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function BrowseGrid({
  contentType,
  title,
  description,
  emptyMessage,
}: BrowseGridProps): React.ReactElement {
  const [torrents, setTorrents] = useState<BrowseTorrent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [offset, setOffset] = useState(0);
  const limit = 24;

  const fetchTorrents = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        contentType,
        sortBy,
        sortOrder,
        limit: String(limit),
        offset: String(offset),
      });

      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }

      const response = await fetch(`/api/browse?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error ?? 'Failed to fetch');
      }

      const data = await response.json() as BrowseResponse;
      setTorrents(data.torrents);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTorrents([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [contentType, sortBy, sortOrder, offset, searchQuery]);

  useEffect(() => {
    fetchTorrents();
  }, [fetchTorrents]);

  // Handle sort toggle - clicking same column reverses order
  const handleSort = useCallback((newSortBy: SortBy): void => {
    if (sortBy === newSortBy) {
      // Toggle order
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to desc
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
    setOffset(0); // Reset to first page
  }, [sortBy]);

  // Handle search
  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setOffset(0); // Reset to first page
    fetchTorrents();
  }, [fetchTorrents]);

  // Pagination
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePrevPage = useCallback((): void => {
    setOffset(prev => Math.max(0, prev - limit));
  }, [limit]);

  const handleNextPage = useCallback((): void => {
    setOffset(prev => prev + limit);
  }, [limit]);

  // Get sort icon
  const getSortIcon = (column: SortBy): React.ReactElement | null => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
        <p className="mt-1 text-text-secondary">{description}</p>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
            className={cn(
              'w-full rounded-lg border border-border-subtle bg-bg-secondary py-2 pl-10 pr-4',
              'text-text-primary placeholder:text-text-muted',
              'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
            )}
          />
        </form>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <SortIcon className="text-text-muted" size={18} />
          <span className="text-sm text-text-muted">Sort by:</span>
          <div className="flex gap-1">
            {(['date', 'seeders', 'name', 'size'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleSort(option)}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors',
                  sortBy === option
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
                {getSortIcon(option)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      {!isLoading && !error && (
        <p className="text-sm text-text-muted">
          {total === 0 ? 'No results' : `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} results`}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="aspect-[2/3] bg-bg-tertiary rounded-t-lg" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-bg-tertiary rounded w-3/4" />
                <div className="h-3 bg-bg-tertiary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!isLoading && !error && torrents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {torrents.map((torrent) => (
            <TorrentCard key={torrent.id} torrent={torrent} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && torrents.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-text-muted">{emptyMessage}</p>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className={cn(
              'rounded px-4 py-2 text-sm transition-colors',
              currentPage === 1
                ? 'cursor-not-allowed text-text-muted'
                : 'bg-bg-secondary text-text-primary hover:bg-bg-hover'
            )}
          >
            Previous
          </button>
          <span className="text-sm text-text-secondary">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className={cn(
              'rounded px-4 py-2 text-sm transition-colors',
              currentPage === totalPages
                ? 'cursor-not-allowed text-text-muted'
                : 'bg-bg-secondary text-text-primary hover:bg-bg-hover'
            )}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Health indicator component showing 5 bars colored based on seeder count.
 * Green = healthy (many seeders), Red = unhealthy (few seeders)
 */
interface HealthIndicatorProps {
  seeders: number | null;
  leechers: number | null;
}

function HealthIndicator({ seeders, leechers }: HealthIndicatorProps): React.ReactElement {
  const bars = calculateHealthBars(seeders, leechers);
  const colors = getHealthBarColors(bars);

  return (
    <div
      className="flex items-center gap-0.5"
      title={`Health: ${bars}/5 (${seeders ?? '?'} seeders, ${leechers ?? '?'} leechers)`}
    >
      {colors.map((color, index) => (
        <div
          key={index}
          className={cn('h-3 w-1 rounded-sm', color)}
        />
      ))}
    </div>
  );
}

/**
 * Individual torrent card
 */
interface TorrentCardProps {
  torrent: BrowseTorrent;
}

function TorrentCard({ torrent }: TorrentCardProps): React.ReactElement {
  const imageUrl = torrent.posterUrl ?? torrent.coverUrl;

  return (
    <Link
      href={`/torrents/${torrent.id}`}
      className="card-hover group overflow-hidden transition-transform hover:scale-[1.02]"
    >
      {/* Image */}
      <div className="aspect-[2/3] bg-bg-tertiary relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={torrent.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-4xl text-text-muted">🎬</span>
          </div>
        )}
        {/* Overlay with health indicator and seeders */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1">
          <HealthIndicator seeders={torrent.seeders} leechers={torrent.leechers} />
          {torrent.seeders !== null && (
            <span className="text-xs text-white">{torrent.seeders}</span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-text-primary line-clamp-2 group-hover:text-accent-primary transition-colors">
          {torrent.name}
        </h3>
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          {torrent.year && <span>{torrent.year}</span>}
          <span>•</span>
          <span>{formatSize(torrent.totalSize)}</span>
          <span>•</span>
          <span>{torrent.fileCount} files</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Added {formatDate(torrent.createdAt)}
        </p>
      </div>
    </Link>
  );
}
