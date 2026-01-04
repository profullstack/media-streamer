'use client';

/**
 * Torrents Page
 * 
 * Lists all indexed torrents and allows adding new ones.
 * Features: sorting, load more pagination, compact list view.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { AddMagnetModal } from '@/components/torrents';
import { PlusIcon, SortIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/ui/icons';
import { MediaThumbnail } from '@/components/ui/media-placeholder';
import { cn, formatBytes } from '@/lib/utils';

interface Torrent {
  id: string;
  infohash: string;
  name: string;
  cleanTitle?: string | null;
  totalSize: number;
  fileCount: number;
  createdAt: string;
  seeders?: number | null;
  leechers?: number | null;
  posterUrl?: string | null;
  coverUrl?: string | null;
  contentType?: string | null;
}

interface TorrentsResponse {
  torrents: Torrent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

type SortBy = 'date' | 'seeders' | 'leechers' | 'size';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'date', label: 'Date Added' },
  { key: 'seeders', label: 'Seeders' },
  { key: 'leechers', label: 'Leechers' },
  { key: 'size', label: 'Size' },
];

const PAGE_SIZE = 50;

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

export default function TorrentsPage(): React.ReactElement {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Track last click time for double-click detection
  const lastClickRef = useRef<{ sortBy: SortBy; time: number } | null>(null);

  const fetchTorrents = useCallback(async (pageNum: number, append: boolean = false): Promise<void> => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(pageNum),
        sortBy,
        sortOrder,
      });

      const response = await fetch(`/api/torrents?${params.toString()}`);
      
      if (!response.ok) {
        if (!append) {
          setTorrents([]);
        }
        return;
      }

      const data: TorrentsResponse = await response.json();
      
      if (append) {
        setTorrents(prev => [...prev, ...data.torrents]);
      } else {
        setTorrents(data.torrents);
      }
      
      setHasMore(data.pagination.hasMore);
      setTotal(data.pagination.total);
      setPage(pageNum);
    } catch {
      if (!append) {
        setTorrents([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [sortBy, sortOrder]);

  // Initial fetch and refetch when sort changes
  useEffect(() => {
    fetchTorrents(1, false);
  }, [sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle sort click
  const handleSort = useCallback((newSortBy: SortBy): void => {
    const now = Date.now();
    const lastClick = lastClickRef.current;
    
    if (lastClick && lastClick.sortBy === newSortBy && now - lastClick.time < 300) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      lastClickRef.current = null;
    } else if (sortBy === newSortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      lastClickRef.current = { sortBy: newSortBy, time: now };
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
      lastClickRef.current = { sortBy: newSortBy, time: now };
    }
    setPage(1);
  }, [sortBy]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingMore && hasMore) {
      fetchTorrents(page + 1, true);
    }
  }, [fetchTorrents, page, isLoadingMore, hasMore]);

  const handleOpenModal = useCallback((): void => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((): void => {
    setIsModalOpen(false);
  }, []);

  const handleTorrentAdded = useCallback((): void => {
    setPage(1);
    fetchTorrents(1, false);
  }, [fetchTorrents]);

  // Get sort icon
  const getSortIcon = (column: SortBy): React.ReactElement | null => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />;
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Torrents</h1>
            <p className="text-sm text-text-secondary">
              {total > 0 ? `${total.toLocaleString()} torrents indexed` : 'Manage your indexed torrents'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm"
          >
            <PlusIcon size={16} />
            <span>Add Torrent</span>
          </button>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <SortIcon className="text-text-muted" size={16} />
          <span className="text-xs text-text-muted">Sort:</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSort(option.key)}
                title={sortBy === option.key ? 'Click to reverse order' : `Sort by ${option.label}`}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
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

        {/* Error message */}
        {error ? <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div> : null}

        {/* Loading */}
        {isLoading ? <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 animate-pulse">
                <div className="w-12 h-16 bg-bg-tertiary rounded shrink-0" />
                <div className="flex-1 h-4 bg-bg-tertiary rounded" />
                <div className="w-16 h-4 bg-bg-tertiary rounded" />
                <div className="w-12 h-4 bg-bg-tertiary rounded" />
              </div>
            ))}
          </div> : null}

        {/* Torrent list with thumbnails */}
        {!isLoading && torrents.length > 0 && (
          <div className="space-y-2">
            {torrents.map((torrent) => (
                <Link
                  key={torrent.id}
                  href={`/torrents/${torrent.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded border border-transparent px-3 py-2',
                    'hover:border-accent-primary/30 hover:bg-bg-hover',
                    'transition-colors'
                  )}
                >
                  {/* Thumbnail */}
                  <MediaThumbnail
                    src={torrent.posterUrl ?? torrent.coverUrl ?? undefined}
                    alt={torrent.cleanTitle ?? torrent.name}
                    contentType={
                      torrent.contentType === 'music' ? 'music' :
                      torrent.contentType === 'movie' ? 'movie' :
                      torrent.contentType === 'tvshow' ? 'tvshow' :
                      torrent.contentType === 'book' ? 'book' :
                      torrent.contentType === 'ebook' ? 'ebook' :
                      torrent.contentType === 'video' ? 'video' :
                      torrent.contentType === 'audio' ? 'audio' :
                      'other'
                    }
                    className="w-12 h-16 shrink-0"
                  />
                  
                  {/* Name */}
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm text-text-primary block" title={torrent.name}>
                      {torrent.cleanTitle ?? torrent.name}
                    </span>
                    {torrent.contentType ? <span className="text-xs text-text-muted capitalize">{torrent.contentType}</span> : null}
                  </div>
                  
                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
                    <span className="w-16 text-right">{formatBytes(torrent.totalSize)}</span>
                    <span className="w-12 text-right hidden md:block">{torrent.fileCount} files</span>
                    {torrent.seeders !== null && torrent.seeders !== undefined && (
                      <span className={cn(
                        'w-12 text-right',
                        torrent.seeders > 10 ? 'text-green-400' :
                        torrent.seeders > 0 ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {torrent.seeders} S
                      </span>
                    )}
                    {torrent.leechers !== null && torrent.leechers !== undefined && (
                      <span className="w-10 text-right hidden sm:block">
                        {torrent.leechers} L
                      </span>
                    )}
                    <span className="w-20 text-right hidden lg:block">
                      {formatDate(torrent.createdAt)}
                    </span>
                  </div>
                </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && torrents.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-text-muted">No torrents yet. Add a magnet link to get started.</p>
          </div>
        )}

        {/* Load more button */}
        {hasMore && !isLoading ? <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="btn-secondary px-6 py-2 text-sm disabled:opacity-50"
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
          </div> : null}

        {/* Show count when all loaded */}
        {!hasMore && torrents.length > 0 && !isLoading && (
          <div className="text-center text-xs text-text-secondary">
            Showing all {torrents.length.toLocaleString()} torrents
          </div>
        )}
      </div>

      {/* Add magnet modal */}
      <AddMagnetModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleTorrentAdded}
      />
    </MainLayout>
  );
}
