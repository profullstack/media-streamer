'use client';

/**
 * Search Page
 *
 * Unified search across all torrents.
 * Uses the torrent search API with category filtering.
 * Features: sorting, load more pagination, compact results with thumbnails.
 */

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/layout';
import { cn, formatBytes } from '@/lib/utils';
import { LoadingSpinner, SortIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon } from '@/components/ui/icons';
import { MediaPlaceholder } from '@/components/ui/media-placeholder';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

/**
 * Torrent search result from API
 */
interface TorrentSearchResult {
  torrent_id: string;
  torrent_name: string;
  torrent_clean_title?: string | null;
  torrent_infohash: string;
  torrent_total_size: number;
  torrent_file_count: number;
  torrent_seeders: number | null;
  torrent_leechers: number | null;
  torrent_created_at: string;
  torrent_poster_url?: string | null;
  torrent_cover_url?: string | null;
  match_type: string;
  rank: number;
  source?: 'user' | 'dht';
}

/**
 * Source filter type
 */
type SearchSource = 'all' | 'user' | 'dht';

/**
 * Source tab labels
 */
const SOURCE_TABS: { key: SearchSource; label: string; description: string }[] = [
  { key: 'all', label: 'All', description: 'Search all torrents' },
  { key: 'user', label: 'Library', description: 'User-submitted torrents' },
  { key: 'dht', label: 'DHT', description: 'Torrents from the DHT network' },
];

/**
 * Category labels for display
 */
const CATEGORY_LABELS: Record<string, string> = {
  '': 'All',
  'audio': 'Music',
  'video': 'Movies & TV',
  'ebook': 'Books',
  'xxx': 'XXX',
  'other': 'Other',
};

/**
 * Sort options
 */
type SortBy = 'relevance' | 'date' | 'seeders' | 'leechers' | 'size';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
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

/**
 * Search results component - compact list view
 */
function SearchResultsList({
  results,
  isLoading,
  error,
  onAddToLibrary,
}: {
  results: TorrentSearchResult[];
  isLoading: boolean;
  error: string | null;
  onAddToLibrary: (result: TorrentSearchResult) => void;
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
        <p className="text-text-muted">No results found</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((result) => {
        const imageUrl = result.torrent_poster_url ?? result.torrent_cover_url;
        const displayName = result.torrent_clean_title ?? result.torrent_name;
        const isDht = result.source === 'dht';

        // Common content for both link and button versions
        const content = (
          <>
            {/* Add to Library button for DHT results - positioned first */}
            {isDht ? <button
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
              </button> : null}

            {/* Thumbnail */}
            <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-bg-tertiary">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={displayName}
                  fill
                  sizes="28px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <MediaPlaceholder alt={displayName} contentType="video" size="sm" className="h-full w-full" />
              )}
            </div>

            {/* Name - takes most space */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-text-primary">
                  {displayName}
                </span>
                {/* Source badge */}
                {result.source ? <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                      result.source === 'dht'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-green-500/20 text-green-400'
                    )}
                  >
                    {result.source === 'dht' ? 'DHT' : 'Library'}
                  </span> : null}
              </div>
              {/* Show raw name if different from clean title */}
              {result.torrent_clean_title && result.torrent_clean_title !== result.torrent_name ? <span className="block truncate text-xs text-text-muted" title={result.torrent_name}>
                  {result.torrent_name}
                </span> : null}
            </div>

            {/* Stats - compact */}
            <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
              <span className="w-16 text-right">{formatBytes(result.torrent_total_size)}</span>
              <span className="w-12 text-right">{result.torrent_file_count} files</span>
              {result.torrent_seeders !== null && (
                <span className={cn(
                  'w-16 text-right',
                  result.torrent_seeders > 10 ? 'text-green-400' :
                  result.torrent_seeders > 0 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {result.torrent_seeders} S
                </span>
              )}
              {result.torrent_leechers !== null && (
                <span className="w-12 text-right text-text-muted">
                  {result.torrent_leechers} L
                </span>
              )}
              <span className="w-20 text-right hidden sm:block">
                {formatDate(result.torrent_created_at)}
              </span>
            </div>
          </>
        );

        // For DHT results, use a div with click handler; for library results, use Link
        if (isDht) {
          return (
            <div
              key={result.torrent_id}
              className={cn(
                'flex items-center gap-3 rounded border border-transparent px-3 py-2',
                'hover:border-accent-primary/30 hover:bg-bg-hover',
                'transition-colors cursor-default'
              )}
            >
              {content}
            </div>
          );
        }

        return (
          <Link
            key={result.torrent_id}
            href={`/torrents/${result.torrent_id}`}
            className={cn(
              'flex items-center gap-3 rounded border border-transparent px-3 py-2',
              'hover:border-accent-primary/30 hover:bg-bg-hover',
              'transition-colors'
            )}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Inner search page component that uses useSearchParams
 */
function SearchPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryParam = searchParams.get('q') ?? '';
  const typeParam = searchParams.get('type') ?? '';

  const [results, setResults] = useState<TorrentSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [offset, setOffset] = useState(0);
  const [source, setSource] = useState<SearchSource>('all');

  // Add Magnet modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDhtTorrent, setSelectedDhtTorrent] = useState<TorrentSearchResult | null>(null);

  // Track last click time for double-click detection
  const lastClickRef = useRef<{ sortBy: SortBy; time: number } | null>(null);

  // Perform search
  const performSearch = useCallback(async (append: boolean = false): Promise<void> => {
    if (!queryParam.trim()) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setHasSearched(true);

    try {
      const currentOffset = append ? offset : 0;
      const params = new URLSearchParams({
        q: queryParam,
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
        source,
      });

      if (typeParam) {
        params.set('type', typeParam);
      }

      // Add sorting (if not relevance, which is the default)
      if (sortBy !== 'relevance') {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }

      const response = await fetch(`/api/search/torrents?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error ?? 'Search failed');
      }

      const data = await response.json() as { results: TorrentSearchResult[]; total?: number };
      
      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setTotal(data.total ?? data.results.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      if (!append) {
        setResults([]);
        setTotal(0);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [queryParam, typeParam, sortBy, sortOrder, offset, source]);

  // Search when query or type changes
  useEffect(() => {
    setOffset(0);
    performSearch(false);
  }, [queryParam, typeParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-search when sort or source changes
  useEffect(() => {
    if (hasSearched) {
      setOffset(0);
      performSearch(false);
    }
  }, [sortBy, sortOrder, source]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle source tab change
  const handleSourceChange = useCallback((newSource: SearchSource): void => {
    setSource(newSource);
    setOffset(0);
  }, []);

  // Handle sort click
  const handleSort = useCallback((newSortBy: SortBy): void => {
    const now = Date.now();
    const lastClick = lastClickRef.current;
    
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

  // Handle load more
  const handleLoadMore = useCallback((): void => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);

    const fetchMore = async (): Promise<void> => {
      setIsLoadingMore(true);
      try {
        const params = new URLSearchParams({
          q: queryParam,
          limit: String(PAGE_SIZE),
          offset: String(newOffset),
          source,
        });

        if (typeParam) {
          params.set('type', typeParam);
        }

        if (sortBy !== 'relevance') {
          params.set('sortBy', sortBy);
          params.set('sortOrder', sortOrder);
        }

        const response = await fetch(`/api/search/torrents?${params.toString()}`);

        if (!response.ok) {
          throw new Error('Failed to load more');
        }

        const data = await response.json() as { results: TorrentSearchResult[] };
        setResults(prev => [...prev, ...data.results]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load more');
      } finally {
        setIsLoadingMore(false);
      }
    };

    fetchMore();
  }, [offset, queryParam, typeParam, sortBy, sortOrder, source]);

  const categoryLabel = CATEGORY_LABELS[typeParam] ?? 'All';
  const hasMore = results.length < total;

  // Get sort icon
  const getSortIcon = (column: SortBy): React.ReactElement | null => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />;
  };

  // Handle adding DHT torrent to library
  const handleAddToLibrary = useCallback((result: TorrentSearchResult): void => {
    setSelectedDhtTorrent(result);
    setIsAddModalOpen(true);
  }, []);

  // Handle successful add - navigate to the new torrent
  const handleAddSuccess = useCallback((torrent: { id: string }): void => {
    setIsAddModalOpen(false);
    setSelectedDhtTorrent(null);
    router.push(`/torrents/${torrent.id}`);
  }, [router]);

  // Build magnet URI for DHT torrent
  const getMagnetUri = (result: TorrentSearchResult): string => {
    const infohash = result.torrent_infohash;
    const name = encodeURIComponent(result.torrent_name);
    return `magnet:?xt=urn:btih:${infohash}&dn=${name}`;
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Search Results
              {queryParam ? <span className="font-normal text-text-secondary">
                  {' '}for &ldquo;{queryParam}&rdquo;
                </span> : null}
            </h1>
            {typeParam ? <p className="text-sm text-text-secondary">
                Filtered by: {categoryLabel}
              </p> : null}
          </div>

          {/* Sort Controls */}
          {hasSearched && results.length > 0 ? <div className="flex items-center gap-2">
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
            </div> : null}
        </div>

        {/* Source Tabs */}
        {hasSearched ? <div className="flex border-b border-border-subtle">
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSourceChange(tab.key)}
                title={tab.description}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium transition-colors',
                  source === tab.key
                    ? 'text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {tab.label}
                {source === tab.key ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" /> : null}
              </button>
            ))}
          </div> : null}

        {/* Results count */}
        {hasSearched && !isLoading ? <div className="text-xs text-text-muted">
            {total > 0 ? `${total.toLocaleString()} result${total !== 1 ? 's' : ''} found` : 'No results found'}
          </div> : null}

        {/* Results */}
        {hasSearched ? (
          <SearchResultsList
            results={results}
            isLoading={isLoading}
            error={error}
            onAddToLibrary={handleAddToLibrary}
          />
        ) : (
          <div className="py-12 text-center">
            <p className="text-text-muted">
              Use the search bar above to find torrents
            </p>
          </div>
        )}

        {/* Load More Button */}
        {hasSearched && hasMore && !isLoading ? <div className="flex justify-center pt-4">
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
                `Load more (${results.length} of ${total.toLocaleString()})`
              )}
            </button>
          </div> : null}

        {/* Show count when all loaded */}
        {hasSearched && !hasMore && results.length > 0 && !isLoading ? <div className="text-center text-xs text-text-secondary">
            Showing all {results.length.toLocaleString()} results
          </div> : null}
      </div>

      {/* Add Magnet Modal for DHT torrents */}
      <AddMagnetModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedDhtTorrent(null);
        }}
        onSuccess={handleAddSuccess}
        initialMagnetUrl={selectedDhtTorrent ? getMagnetUri(selectedDhtTorrent) : undefined}
      />
    </MainLayout>
  );
}

/**
 * Search page with Suspense boundary for useSearchParams
 */
export default function SearchPage(): React.ReactElement {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
        </div>
      </MainLayout>
    }>
      <SearchPageInner />
    </Suspense>
  );
}
