'use client';

/**
 * Trending Page
 *
 * Shows popular and trending content from our database.
 * Features: filter by media type, sort by popularity/recent/seeded, pagination.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { MediaThumbnail } from '@/components/ui/media-placeholder';
import { cn, formatBytes } from '@/lib/utils';
import {
  TrendingIcon,
  MovieIcon,
  TvIcon,
  MusicIcon,
  ClockIcon,
  FireIcon,
} from '@/components/ui/icons';

interface TrendingItem {
  id: string;
  infohash: string;
  title: string;
  cleanTitle: string | null;
  mediaType: 'movie' | 'tv' | 'music' | 'other';
  year: number | null;
  posterUrl: string | null;
  description: string | null;
  seeders: number | null;
  leechers: number | null;
  totalSize: number;
  indexedAt: string;
}

interface TrendingResponse {
  items: TrendingItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

type MediaType = 'all' | 'movie' | 'tv' | 'music';
type SortOption = 'popular' | 'recent' | 'seeded';
type TimeWindow = 'day' | 'week' | 'month';

const MEDIA_TYPE_OPTIONS: { key: MediaType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'all', label: 'All', icon: TrendingIcon },
  { key: 'movie', label: 'Movies', icon: MovieIcon },
  { key: 'tv', label: 'TV Shows', icon: TvIcon },
  { key: 'music', label: 'Music', icon: MusicIcon },
];

const SORT_OPTIONS: { key: SortOption; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'popular', label: 'Popular', icon: FireIcon },
  { key: 'recent', label: 'Recent', icon: ClockIcon },
  { key: 'seeded', label: 'Most Seeded', icon: TrendingIcon },
];

const TIME_WINDOW_OPTIONS: { key: TimeWindow; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

const PAGE_SIZE = 20;

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
 * Get content type for MediaThumbnail
 */
function getContentType(mediaType: string): 'movie' | 'tvshow' | 'music' | 'other' {
  switch (mediaType) {
    case 'movie':
      return 'movie';
    case 'tv':
      return 'tvshow';
    case 'music':
      return 'music';
    default:
      return 'other';
  }
}

export default function TrendingPage(): React.ReactElement {
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [sortOption, setSortOption] = useState<SortOption>('popular');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('week');

  const fetchTrending = useCallback(
    async (pageNum: number, append: boolean = false): Promise<void> => {
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }

        const params = new URLSearchParams({
          type: mediaType,
          sort: sortOption,
          timeWindow,
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
        });

        const response = await fetch(`/api/trending?${params.toString()}`);

        if (!response.ok) {
          if (!append) {
            setItems([]);
          }
          return;
        }

        const data: TrendingResponse = await response.json();

        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }

        setTotalResults(data.totalResults);
        setTotalPages(data.totalPages);
        setPage(pageNum);
      } catch {
        if (!append) {
          setItems([]);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [mediaType, sortOption, timeWindow]
  );

  // Initial fetch and refetch when filters change
  useEffect(() => {
    fetchTrending(1, false);
  }, [mediaType, sortOption, timeWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingMore && page < totalPages) {
      fetchTrending(page + 1, true);
    }
  }, [fetchTrending, page, totalPages, isLoadingMore]);

  const handleMediaTypeChange = useCallback((type: MediaType): void => {
    setMediaType(type);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((sort: SortOption): void => {
    setSortOption(sort);
    setPage(1);
  }, []);

  const handleTimeWindowChange = useCallback((window: TimeWindow): void => {
    setTimeWindow(window);
    setPage(1);
  }, []);

  const hasMore = page < totalPages;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <TrendingIcon size={28} className="text-accent-primary" />
            Trending
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Discover popular content based on seeder activity
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          {/* Media Type Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Type:</span>
            {MEDIA_TYPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleMediaTypeChange(option.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                    mediaType === option.key
                      ? 'bg-accent-primary text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  <Icon size={16} />
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Sort and Time Window */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Sort Options */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Sort:</span>
              {SORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleSortChange(option.key)}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                      sortOption === option.key
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                    )}
                  >
                    <Icon size={14} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Time Window (only for popular sort) */}
            {sortOption === 'popular' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Period:</span>
                {TIME_WINDOW_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleTimeWindowChange(option.key)}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      timeWindow === option.key
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results count */}
        {!isLoading && totalResults > 0 && (
          <p className="text-sm text-text-muted">
            {totalResults.toLocaleString()} results
          </p>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-bg-tertiary" />
                <div className="mt-2 h-4 w-3/4 rounded bg-bg-tertiary" />
                <div className="mt-1 h-3 w-1/2 rounded bg-bg-tertiary" />
              </div>
            ))}
          </div>
        )}

        {/* Content Grid */}
        {!isLoading && items.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/torrents/${item.id}`}
                className="group block"
              >
                <div className="relative overflow-hidden rounded-lg bg-bg-tertiary transition-transform group-hover:scale-105">
                  <MediaThumbnail
                    src={item.posterUrl ?? undefined}
                    alt={item.cleanTitle ?? item.title}
                    contentType={getContentType(item.mediaType)}
                    className="aspect-[2/3] w-full"
                  />
                  {/* Seeder badge */}
                  {item.seeders !== null && item.seeders > 0 && (
                    <div
                      className={cn(
                        'absolute right-2 top-2 rounded px-1.5 py-0.5 text-xs font-medium',
                        item.seeders > 100
                          ? 'bg-green-500/90 text-white'
                          : item.seeders > 10
                          ? 'bg-yellow-500/90 text-black'
                          : 'bg-red-500/90 text-white'
                      )}
                    >
                      {item.seeders} S
                    </div>
                  )}
                  {/* Media type badge */}
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs capitalize text-white">
                    {item.mediaType === 'tv' ? 'TV' : item.mediaType}
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="truncate text-sm font-medium text-text-primary group-hover:text-accent-primary">
                    {item.cleanTitle ?? item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {item.year && <span>{item.year}</span>}
                    <span>{formatBytes(item.totalSize)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <TrendingIcon size={48} className="mx-auto text-text-muted opacity-50" />
            <p className="mt-4 text-text-muted">
              No trending content found for the selected filters.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Try changing the media type or time period.
            </p>
          </div>
        )}

        {/* Load more button */}
        {hasMore && !isLoading && (
          <div className="flex justify-center pt-4">
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
                `Load more (${items.length} of ${totalResults.toLocaleString()})`
              )}
            </button>
          </div>
        )}

        {/* Show count when all loaded */}
        {!hasMore && items.length > 0 && !isLoading && (
          <div className="text-center text-xs text-text-secondary">
            Showing all {items.length.toLocaleString()} results
          </div>
        )}
      </div>
    </MainLayout>
  );
}
