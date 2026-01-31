'use client';

/**
 * Upcoming Content (Client Component)
 *
 * Displays upcoming movies and TV series from TMDB.
 * Features: tab switching (Movies/TV), card layout, Add to Watchlist,
 * Find Torrent button, load more pagination.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { MediaThumbnail } from '@/components/ui/media-placeholder';
import { AddToWatchlistButton, type WatchlistItemData } from '@/components/watchlist';
import {
  MovieIcon,
  TvIcon,
  SearchIcon,
  StarIcon,
  ClockIcon,
  LoadingSpinner,
  CreditCardIcon,
} from '@/components/ui/icons';

interface UpcomingItem {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number;
  genres: string[];
  cast: string[];
  directors: string[];
  runtime: number | null;
  popularity: number;
}

type ActiveTab = 'movies' | 'tv';

const TAB_OPTIONS: { key: ActiveTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'movies', label: 'Movies', icon: MovieIcon },
  { key: 'tv', label: 'TV Series', icon: TvIcon },
];

function formatRating(rating: number | null): string {
  if (rating === null || rating === 0) return 'N/A';
  return rating.toFixed(1);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getYear(dateStr: string | null): string {
  if (!dateStr) return '';
  return dateStr.substring(0, 4);
}

function buildSearchQuery(item: UpcomingItem): string {
  const parts = [item.title];
  const year = getYear(item.releaseDate);
  if (year) parts.push(year);
  return parts.join(' ');
}

function toWatchlistItemData(item: UpcomingItem): WatchlistItemData {
  return {
    tmdbId: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterUrl,
    overview: item.overview,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    genres: item.genres,
    cast: item.cast,
    directors: item.directors,
  };
}

/**
 * Upcoming Item Card
 */
function UpcomingItemCard({
  item,
  onFindTorrent,
}: {
  item: UpcomingItem;
  onFindTorrent: (query: string) => void;
}): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg bg-bg-secondary border border-border-primary hover:border-accent-primary transition-all">
      <div className="flex flex-col sm:flex-row">
        {/* Poster */}
        <div className="relative w-full sm:w-40 flex-shrink-0">
          <MediaThumbnail
            src={item.posterUrl ?? undefined}
            alt={item.title}
            contentType={item.mediaType === 'movie' ? 'movie' : 'tvshow'}
            className="aspect-[2/3] w-full sm:h-60"
          />
          {/* Rating badge */}
          {item.voteAverage !== null && item.voteAverage > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-yellow-400">
              <StarIcon size={12} />
              {formatRating(item.voteAverage)}
            </div>
          )}
          {/* Media type badge */}
          <div className="absolute bottom-2 left-2 rounded bg-accent-primary/90 px-1.5 py-0.5 text-xs font-medium text-white uppercase">
            {item.mediaType}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          {/* Title and Year */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
              {item.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary mt-1">
              <span>{formatDate(item.releaseDate)}</span>
              {item.runtime ? (
                <span className="flex items-center gap-1">
                  <ClockIcon size={14} />
                  {item.runtime} min
                </span>
              ) : null}
            </div>
          </div>

          {/* Genres */}
          {item.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.genres.slice(0, 4).map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          {/* Overview */}
          {item.overview ? (
            <p className={cn(
              'text-sm text-text-secondary',
              !isExpanded && 'line-clamp-2'
            )}>
              {item.overview}
            </p>
          ) : null}
          {item.overview && item.overview.length > 150 ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-accent-primary hover:underline"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}

          {/* Cast */}
          {item.cast.length > 0 ? (
            <div className="text-sm">
              <span className="text-text-muted">Cast: </span>
              <span className="text-text-secondary">
                {item.cast.slice(0, 3).join(', ')}
              </span>
            </div>
          ) : null}

          {/* Directors */}
          {item.directors.length > 0 ? (
            <div className="text-sm">
              <span className="text-text-muted">
                {item.mediaType === 'tv' ? 'Created by: ' : 'Director: '}
              </span>
              <span className="text-text-secondary">
                {item.directors.join(', ')}
              </span>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <AddToWatchlistButton item={toWatchlistItemData(item)} />

            <button
              type="button"
              onClick={() => onFindTorrent(buildSearchQuery(item))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
            >
              <SearchIcon size={14} />
              Find Torrent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Premium paywall overlay
 */
function PremiumGate(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CreditCardIcon size={48} className="text-accent-primary mb-4" />
      <h2 className="text-xl font-bold text-text-primary mb-2">Premium Feature</h2>
      <p className="text-text-secondary mb-6 max-w-md">
        Upcoming movies and TV series are available to premium subscribers.
        Upgrade to see what&apos;s coming next.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-6 py-3 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
      >
        <CreditCardIcon size={16} />
        View Pricing
      </Link>
    </div>
  );
}

/**
 * Upcoming Content Component
 */
export function UpcomingContent(): React.ReactElement {
  const { isPremium } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>('movies');
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  const fetchItems = useCallback(async (tab: ActiveTab, pageNum: number, append: boolean = false): Promise<void> => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const endpoint = tab === 'movies'
        ? `/api/upcoming/movies?page=${pageNum}`
        : `/api/upcoming/tvseries?page=${pageNum}`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to fetch upcoming content');
      }

      const data = await response.json() as {
        items: UpcomingItem[];
        page: number;
        totalPages: number;
        totalResults: number;
      };

      if (append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalResults(data.totalResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      if (!append) {
        setItems([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Fetch on tab change
  useEffect(() => {
    if (isPremium) {
      setPage(1);
      fetchItems(activeTab, 1);
    }
  }, [activeTab, isPremium, fetchItems]);

  const handleTabChange = (tab: ActiveTab): void => {
    setActiveTab(tab);
  };

  const handleLoadMore = (): void => {
    const nextPage = page + 1;
    fetchItems(activeTab, nextPage, true);
  };

  const handleFindTorrent = (query: string): void => {
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  if (!isPremium) {
    return <PremiumGate />;
  }

  const hasMore = page < totalPages;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Upcoming</h1>
        <p className="text-sm text-text-secondary mt-1">
          Discover upcoming and recently released movies and TV series
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-border-subtle">
        {TAB_OPTIONS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <Icon size={16} />
              {tab.label}
              {activeTab === tab.key ? (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Results count */}
      {!isLoading && items.length > 0 ? (
        <div className="text-xs text-text-muted">
          Showing {items.length.toLocaleString()} of {totalResults.toLocaleString()} results
        </div>
      ) : null}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : null}

      {/* Items */}
      {!isLoading && !error ? (
        <div className="space-y-4">
          {items.map((item) => (
            <UpcomingItemCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              onFindTorrent={handleFindTorrent}
            />
          ))}
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-text-muted">No upcoming content found</p>
        </div>
      ) : null}

      {/* Load More */}
      {!isLoading && hasMore ? (
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
              `Load more (${items.length.toLocaleString()} loaded)`
            )}
          </button>
        </div>
      ) : null}

    </div>
  );
}
