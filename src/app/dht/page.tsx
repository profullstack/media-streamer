'use client';

/**
 * DHT Index Page
 *
 * Browse all torrents from the DHT network, sorted by seeders (default).
 * Same interface as /search but no search box — just a paginated index.
 */

import { useState, useCallback, useEffect, useRef, Suspense, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { cn, formatBytes } from '@/lib/utils';
import { LoadingSpinner, SortIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon } from '@/components/ui/icons';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

/**
 * DHT torrent result from API
 */
interface DhtTorrent {
  id: string;
  infohash: string;
  name: string;
  magnet_uri: string;
  size: number;
  files_count: number;
  seeders: number;
  leechers: number;
  created_at: string;
  content_type: string | null;
  source: string;
}

/**
 * Sort options
 */
type SortBy = 'seeders' | 'leechers' | 'date' | 'size' | 'name';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'seeders', label: 'Seeders' },
  { key: 'leechers', label: 'Leechers' },
  { key: 'date', label: 'Date' },
  { key: 'size', label: 'Size' },
  { key: 'name', label: 'Name' },
];

const PAGE_SIZE = 50;
const MAX_RESULTS = 500;

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

/**
 * Category badge color
 */
function getCategoryColor(contentType: string | null): string {
  switch (contentType) {
    case 'movie': return 'bg-blue-500/20 text-blue-400';
    case 'tv_show': return 'bg-purple-500/20 text-purple-400';
    case 'music': return 'bg-green-500/20 text-green-400';
    case 'ebook': return 'bg-yellow-500/20 text-yellow-400';
    case 'software': return 'bg-orange-500/20 text-orange-400';
    case 'xxx': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

/**
 * Format content type for display
 */
function formatContentType(contentType: string | null): string {
  if (!contentType) return '';
  return contentType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Results list component
 */
const DhtResultsList = memo(function DhtResultsList({
  results,
  isLoading,
  error,
  onAddToLibrary,
}: {
  results: DhtTorrent[];
  isLoading: boolean;
  error: string | null;
  onAddToLibrary: (result: DhtTorrent) => void;
}): React.ReactElement {
  if (isLoading && results.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size={32} className="text-accent-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-muted">No torrents found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((result) => (
        <Link
          key={result.infohash}
          href={`/dht/${result.infohash}`}
          className={cn(
            'flex items-center gap-3 rounded border border-transparent px-3 py-2',
            'hover:border-accent-primary/30 hover:bg-bg-hover',
            'transition-colors'
          )}
        >
          {/* Add to Library button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToLibrary(result);
            }}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs',
              'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30',
              'transition-colors shrink-0'
            )}
            title="Add to Library"
          >
            <PlusIcon size={14} />
            <span className="hidden sm:inline">Add</span>
          </button>

          {/* Name */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-text-primary">
                {result.name}
              </span>
              {result.content_type ? (
                <span className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                  getCategoryColor(result.content_type)
                )}>
                  {formatContentType(result.content_type)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
            <span className="w-16 text-right">{formatBytes(result.size)}</span>
            {result.files_count > 0 && (
              <span className="w-12 text-right">{result.files_count} files</span>
            )}
            <span className={cn(
              'w-16 text-right',
              result.seeders > 10 ? 'text-green-400' :
              result.seeders > 0 ? 'text-yellow-400' : 'text-red-400'
            )}>
              {result.seeders} S
            </span>
            <span className="w-12 text-right text-text-muted">
              {result.leechers} L
            </span>
            <span className="w-20 text-right hidden sm:block">
              {formatDate(result.created_at)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
});

/**
 * Inner DHT page component
 */
function DhtPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sortByParam = searchParams.get('sortBy') as SortBy | null;
  const sortOrderParam = searchParams.get('sortOrder') as SortOrder | null;

  const [results, setResults] = useState<DhtTorrent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreFromApi, setHasMoreFromApi] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>(
    sortByParam && SORT_OPTIONS.some(o => o.key === sortByParam) ? sortByParam : 'seeders'
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    sortOrderParam === 'asc' || sortOrderParam === 'desc' ? sortOrderParam : 'desc'
  );
  const [offset, setOffset] = useState(0);

  // Add Magnet modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTorrent, setSelectedTorrent] = useState<DhtTorrent | null>(null);

  const lastClickRef = useRef<{ sortBy: SortBy; time: number } | null>(null);

  // Fetch torrents
  const fetchTorrents = useCallback(async (append: boolean = false): Promise<void> => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const currentOffset = append ? offset : 0;
      const params = new URLSearchParams({
        sortBy,
        sortOrder,
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });

      const response = await fetch(`/api/dht/browse?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error ?? 'Failed to load');
      }

      const data = await response.json() as { results: DhtTorrent[]; pagination?: { hasMore: boolean } };

      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setHasMoreFromApi(data.pagination?.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      if (!append) {
        setResults([]);
        setHasMoreFromApi(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [sortBy, sortOrder, offset]);

  // Initial load and reload on sort change
  useEffect(() => {
    setOffset(0);
    fetchTorrents(false);
  }, [sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL params
  const updateUrlParams = useCallback((updates: { sortBy?: SortBy; sortOrder?: SortOrder }): void => {
    const params = new URLSearchParams();
    const newSortBy = updates.sortBy ?? sortBy;
    const newSortOrder = updates.sortOrder ?? sortOrder;

    if (newSortBy !== 'seeders') params.set('sortBy', newSortBy);
    if (newSortOrder !== 'desc') params.set('sortOrder', newSortOrder);

    const newUrl = params.toString() ? `/dht?${params.toString()}` : '/dht';
    router.replace(newUrl, { scroll: false });
  }, [sortBy, sortOrder, router]);

  // Handle sort click
  const handleSort = useCallback((newSortBy: SortBy): void => {
    const now = Date.now();
    const lastClick = lastClickRef.current;

    let newSortOrder: SortOrder;
    let finalSortBy: SortBy;

    if (lastClick && lastClick.sortBy === newSortBy && now - lastClick.time < 300) {
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      finalSortBy = sortBy;
      setSortOrder(newSortOrder);
      lastClickRef.current = null;
    } else if (sortBy === newSortBy) {
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      finalSortBy = sortBy;
      setSortOrder(newSortOrder);
      lastClickRef.current = { sortBy: newSortBy, time: now };
    } else {
      finalSortBy = newSortBy;
      newSortOrder = 'desc';
      setSortBy(newSortBy);
      setSortOrder('desc');
      lastClickRef.current = { sortBy: newSortBy, time: now };
    }
    setOffset(0);
    updateUrlParams({ sortBy: finalSortBy, sortOrder: newSortOrder });
  }, [sortBy, sortOrder, updateUrlParams]);

  // Handle load more
  const handleLoadMore = useCallback((): void => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);

    const fetchMore = async (): Promise<void> => {
      setIsLoadingMore(true);
      try {
        const params = new URLSearchParams({
          sortBy,
          sortOrder,
          limit: String(PAGE_SIZE),
          offset: String(newOffset),
        });

        const response = await fetch(`/api/dht/browse?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to load more');

        const data = await response.json() as { results: DhtTorrent[]; pagination?: { hasMore: boolean } };
        setResults(prev => [...prev, ...data.results]);
        setHasMoreFromApi(data.pagination?.hasMore ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load more');
      } finally {
        setIsLoadingMore(false);
      }
    };

    fetchMore();
  }, [offset, sortBy, sortOrder]);

  const hasMore = hasMoreFromApi && results.length < MAX_RESULTS;
  const reachedMax = results.length >= MAX_RESULTS;

  const getSortIcon = (column: SortBy): React.ReactElement | null => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />;
  };

  const handleAddToLibrary = useCallback((result: DhtTorrent): void => {
    setSelectedTorrent(result);
    setIsAddModalOpen(true);
  }, []);

  const handleAddSuccess = useCallback((torrent: { id: string }): void => {
    setIsAddModalOpen(false);
    setSelectedTorrent(null);
    setTimeout(() => {
      router.push(`/torrents/${torrent.id}`);
    }, 100);
  }, [router]);

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">DHT Index</h1>
            <p className="text-sm text-text-secondary">
              Browse torrents discovered on the DHT network
            </p>
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
        </div>

        {/* Results count */}
        {!isLoading && results.length > 0 ? (
          <div className="text-xs text-text-muted">
            {results.length.toLocaleString()} torrent{results.length !== 1 ? 's' : ''} loaded
            {hasMore ? ' (more available)' : ''}
          </div>
        ) : null}

        {/* Results */}
        <DhtResultsList
          results={results}
          isLoading={isLoading}
          error={error}
          onAddToLibrary={handleAddToLibrary}
        />

        {/* Load More Button */}
        {hasMore && !isLoading ? (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="btn-secondary px-6 py-2 text-sm disabled:opacity-50"
            >
              {isLoadingMore ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size={14} />
                  Loading...
                </span>
              ) : (
                `Load more (${results.length.toLocaleString()} loaded)`
              )}
            </button>
          </div>
        ) : null}

        {/* Status when all loaded */}
        {!hasMore && results.length > 0 && !isLoading ? (
          <div className="text-center text-xs text-text-secondary">
            {reachedMax
              ? `Showing ${MAX_RESULTS} results (max limit reached)`
              : `Showing all ${results.length.toLocaleString()} results`}
          </div>
        ) : null}
      </div>

      {/* Add Magnet Modal */}
      <AddMagnetModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedTorrent(null);
        }}
        onSuccess={handleAddSuccess}
        initialMagnetUrl={selectedTorrent?.magnet_uri}
      />
    </MainLayout>
  );
}

/**
 * DHT page with Suspense boundary
 */
export default function DhtPage(): React.ReactElement {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
        </div>
      </MainLayout>
    }>
      <DhtPageInner />
    </Suspense>
  );
}
