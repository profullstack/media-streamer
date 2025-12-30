'use client';

/**
 * Browse Grid Component
 *
 * Displays a grid of torrents with sorting and filtering options.
 * Used by category pages (movies, music, tvshows, books).
 * 
 * Features:
 * - "Load more" pagination (appends results)
 * - Sort by: Date added, Seeders, Leechers, Size
 * - Click to sort, double-click to reverse order
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  cleanTitle: string | null;
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
type SortBy = 'date' | 'seeders' | 'leechers' | 'size';
type SortOrder = 'asc' | 'desc';

interface BrowseGridProps {
  contentType: 'movie' | 'tvshow' | 'music' | 'book' | 'xxx';
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

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'date', label: 'Date Added' },
  { key: 'seeders', label: 'Seeders' },
  { key: 'leechers', label: 'Leechers' },
  { key: 'size', label: 'Size' },
];

const PAGE_SIZE = 24;

export function BrowseGrid({
  contentType,
  title,
  description,
  emptyMessage,
}: BrowseGridProps): React.ReactElement {
  const [torrents, setTorrents] = useState<BrowseTorrent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [offset, setOffset] = useState(0);
  
  // Track last click time for double-click detection
  const lastClickRef = useRef<{ sortBy: SortBy; time: number } | null>(null);

  const fetchTorrents = useCallback(async (append: boolean = false): Promise<void> => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const currentOffset = append ? offset : 0;
      const params = new URLSearchParams({
        contentType,
        sortBy,
        sortOrder,
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
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
      
      if (append) {
        setTorrents(prev => [...prev, ...data.torrents]);
      } else {
        setTorrents(data.torrents);
      }
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      if (!append) {
        setTorrents([]);
        setTotal(0);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [contentType, sortBy, sortOrder, offset, searchQuery]);

  // Initial fetch and refetch when sort changes
  useEffect(() => {
    setOffset(0);
    fetchTorrents(false);
  }, [contentType, sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle sort click - single click selects, double click reverses
  const handleSort = useCallback((newSortBy: SortBy): void => {
    const now = Date.now();
    const lastClick = lastClickRef.current;
    
    // Check for double-click (same button within 300ms)
    if (lastClick && lastClick.sortBy === newSortBy && now - lastClick.time < 300) {
      // Double-click: reverse order
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      lastClickRef.current = null;
    } else if (sortBy === newSortBy) {
      // Single click on same column: toggle order
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      lastClickRef.current = { sortBy: newSortBy, time: now };
    } else {
      // Single click on different column: select with desc order
      setSortBy(newSortBy);
      setSortOrder('desc');
      lastClickRef.current = { sortBy: newSortBy, time: now };
    }
    setOffset(0);
  }, [sortBy]);

  // Handle search
  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setOffset(0);
    fetchTorrents(false);
  }, [fetchTorrents]);

  // Handle load more
  const handleLoadMore = useCallback((): void => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    // Need to fetch with the new offset
    const fetchMore = async (): Promise<void> => {
      try {
        setIsLoadingMore(true);
        setError(null);

        const params = new URLSearchParams({
          contentType,
          sortBy,
          sortOrder,
          limit: String(PAGE_SIZE),
          offset: String(newOffset),
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
        setTorrents(prev => [...prev, ...data.torrents]);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoadingMore(false);
      }
    };
    fetchMore();
  }, [offset, contentType, sortBy, sortOrder, searchQuery]);

  // Check if there are more results to load
  const hasMore = torrents.length < total;

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
        <p className="mt-1 text-text-secondary">
          {total > 0 ? `${total.toLocaleString()} ${title.toLowerCase()} available` : description}
        </p>
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
          <span className="text-sm text-text-muted">Sort:</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSort(option.key)}
                title={sortBy === option.key ? 'Click to reverse order' : `Sort by ${option.label}`}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors',
                  sortBy === option.key
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                {option.label}
                {getSortIcon(option.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading - compact grid */}
      {isLoading && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="aspect-[3/4] bg-bg-tertiary rounded-t-lg" />
              <div className="p-2 space-y-1">
                <div className="h-3 bg-bg-tertiary rounded w-3/4" />
                <div className="h-2 bg-bg-tertiary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid - compact cards, more per row */}
      {!isLoading && !error && torrents.length > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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

      {/* Load More Button */}
      {!isLoading && hasMore && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="btn-secondary px-6 py-2 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading...
              </span>
            ) : (
              `Load more (${torrents.length} of ${total.toLocaleString()})`
            )}
          </button>
        </div>
      )}

      {/* Show count when all loaded */}
      {!isLoading && !hasMore && torrents.length > 0 && (
        <div className="text-center text-sm text-text-secondary">
          Showing all {torrents.length.toLocaleString()} {title.toLowerCase()}
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
      className="flex items-center gap-px"
      title={`Health: ${bars}/5 (${seeders ?? '?'} seeders, ${leechers ?? '?'} leechers)`}
    >
      {colors.map((color, index) => (
        <div
          key={index}
          className={cn('h-2 w-0.5 rounded-sm', color)}
        />
      ))}
    </div>
  );
}

/**
 * Individual torrent card - compact version
 */
interface TorrentCardProps {
  torrent: BrowseTorrent;
}

function TorrentCard({ torrent }: TorrentCardProps): React.ReactElement {
  const imageUrl = torrent.posterUrl ?? torrent.coverUrl;

  return (
    <Link
      href={`/torrents/${torrent.id}`}
      className="card-hover group overflow-hidden transition-transform hover:scale-[1.01]"
    >
      {/* Image - more compact aspect ratio */}
      <div className="aspect-[3/4] bg-bg-tertiary relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={torrent.cleanTitle ?? torrent.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-2xl text-text-muted">🎬</span>
          </div>
        )}
        {/* Overlay with health indicator and seeders - smaller */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5">
          <HealthIndicator seeders={torrent.seeders} leechers={torrent.leechers} />
          {torrent.seeders !== null && (
            <span className="text-[10px] text-white">{torrent.seeders}</span>
          )}
        </div>
      </div>

      {/* Info - compact */}
      <div className="p-2">
        <h3 className="text-xs font-medium text-text-primary line-clamp-2 group-hover:text-accent-primary transition-colors leading-tight" title={torrent.name}>
          {torrent.cleanTitle ?? torrent.name}
        </h3>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-text-muted">
          {torrent.year && <span>{torrent.year}</span>}
          {torrent.year && <span>•</span>}
          <span>{formatSize(torrent.totalSize)}</span>
        </div>
      </div>
    </Link>
  );
}
