'use client';

/**
 * Search Page
 * 
 * Unified search across all torrents.
 * Uses the torrent search API with category filtering.
 * Features: sorting, load more pagination, compact results.
 */

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { cn, formatBytes } from '@/lib/utils';
import { LoadingSpinner, MusicIcon, VideoIcon, BookIcon, FileIcon, SortIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/ui/icons';

/**
 * Torrent search result from API
 */
interface TorrentSearchResult {
  torrent_id: string;
  torrent_name: string;
  torrent_infohash: string;
  torrent_total_size: number;
  torrent_file_count: number;
  torrent_seeders: number | null;
  torrent_leechers: number | null;
  torrent_created_at: string;
  match_type: string;
  rank: number;
}

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
 * Get icon for category
 */
function getCategoryIcon(category: string): React.ReactElement {
  switch (category) {
    case 'audio':
      return <MusicIcon size={14} className="text-accent-primary" />;
    case 'video':
      return <VideoIcon size={14} className="text-accent-primary" />;
    case 'ebook':
      return <BookIcon size={14} className="text-accent-primary" />;
    default:
      return <FileIcon size={14} className="text-text-muted" />;
  }
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

/**
 * Search results component - compact list view
 */
function SearchResultsList({ 
  results, 
  isLoading, 
  error 
}: { 
  results: TorrentSearchResult[]; 
  isLoading: boolean; 
  error: string | null;
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
      {results.map((result) => (
        <Link
          key={result.torrent_id}
          href={`/torrent/${result.torrent_infohash}`}
          className={cn(
            'flex items-center gap-3 rounded border border-transparent px-3 py-2',
            'hover:border-accent-primary/30 hover:bg-bg-hover',
            'transition-colors'
          )}
        >
          {/* Name - takes most space */}
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm text-text-primary">
              {result.torrent_name}
            </span>
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
        </Link>
      ))}
    </div>
  );
}

/**
 * Inner search page component that uses useSearchParams
 */
function SearchPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  
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
  }, [queryParam, typeParam, sortBy, sortOrder, offset]);

  // Search when query or type changes
  useEffect(() => {
    setOffset(0);
    performSearch(false);
  }, [queryParam, typeParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-search when sort changes
  useEffect(() => {
    if (hasSearched) {
      setOffset(0);
      performSearch(false);
    }
  }, [sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [offset, queryParam, typeParam, sortBy, sortOrder]);

  const categoryLabel = CATEGORY_LABELS[typeParam] ?? 'All';
  const hasMore = results.length < total;

  // Get sort icon
  const getSortIcon = (column: SortBy): React.ReactElement | null => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />;
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Search Results
              {queryParam && (
                <span className="font-normal text-text-secondary">
                  {' '}for "{queryParam}"
                </span>
              )}
            </h1>
            {typeParam && (
              <p className="text-sm text-text-secondary">
                Filtered by: {categoryLabel}
              </p>
            )}
          </div>

          {/* Sort Controls */}
          {hasSearched && results.length > 0 && (
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
          )}
        </div>

        {/* Results count */}
        {hasSearched && !isLoading && (
          <div className="text-xs text-text-muted">
            {total > 0 ? `${total.toLocaleString()} result${total !== 1 ? 's' : ''} found` : 'No results found'}
          </div>
        )}

        {/* Results */}
        {hasSearched ? (
          <SearchResultsList 
            results={results} 
            isLoading={isLoading} 
            error={error} 
          />
        ) : (
          <div className="py-12 text-center">
            <p className="text-text-muted">
              Use the search bar above to find torrents
            </p>
          </div>
        )}

        {/* Load More Button */}
        {hasSearched && hasMore && !isLoading && (
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
                `Load more (${results.length} of ${total.toLocaleString()})`
              )}
            </button>
          </div>
        )}

        {/* Show count when all loaded */}
        {hasSearched && !hasMore && results.length > 0 && !isLoading && (
          <div className="text-center text-xs text-text-secondary">
            Showing all {results.length.toLocaleString()} results
          </div>
        )}
      </div>
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
