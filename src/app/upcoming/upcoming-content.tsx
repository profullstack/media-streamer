'use client';

/**
 * Upcoming Content (Client Component)
 *
 * Displays upcoming, recent, and TMDB search results.
 * Features: Upcoming/Recent mode toggle, Movies/TV tabs,
 * search bar, card layout, Add to Watchlist, Find Torrent
 * (recent + search only), load more pagination.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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
  CloseIcon,
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

type ViewMode = 'upcoming' | 'recent';
type MediaTab = 'movies' | 'tv';

const TAB_OPTIONS: { key: MediaTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
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

function getEndpoint(mode: ViewMode, tab: MediaTab, pageNum: number): string {
  if (mode === 'upcoming') {
    return tab === 'movies'
      ? `/api/upcoming/movies?page=${pageNum}`
      : `/api/upcoming/tvseries?page=${pageNum}`;
  }
  return tab === 'movies'
    ? `/api/recent/movies?page=${pageNum}`
    : `/api/recent/tvseries?page=${pageNum}`;
}

/**
 * Upcoming/Recent Item Card
 */
function UpcomingItemCard({
  item,
  showFindButton,
  onFindTorrent,
}: {
  item: UpcomingItem;
  showFindButton: boolean;
  onFindTorrent?: (query: string) => void;
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

            {showFindButton && onFindTorrent ? (
              <button
                type="button"
                onClick={() => onFindTorrent(buildSearchQuery(item))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
              >
                <SearchIcon size={14} />
                Find Torrent
              </button>
            ) : null}
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

  const [viewMode, setViewMode] = useState<ViewMode>('upcoming');
  const [mediaTab, setMediaTab] = useState<MediaTab>('movies');
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch items for current mode/tab
  const fetchItems = useCallback(async (
    mode: ViewMode,
    tab: MediaTab,
    pageNum: number,
    append: boolean = false,
  ): Promise<void> => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const endpoint = getEndpoint(mode, tab, pageNum);
      const response = await fetch(endpoint);

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to fetch content');
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

  // Fetch search results
  const fetchSearchResults = useCallback(async (
    query: string,
    pageNum: number,
    append: boolean = false,
  ): Promise<void> => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/tmdb/search?q=${encodeURIComponent(query)}&page=${pageNum}`,
      );

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Search failed');
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

  // Fetch on mode/tab change (non-search)
  useEffect(() => {
    if (isPremium && !isSearchActive) {
      setPage(1);
      fetchItems(viewMode, mediaTab, 1);
    }
  }, [viewMode, mediaTab, isPremium, isSearchActive, fetchItems]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      setIsSearchActive(false);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      setIsSearchActive(true);
      setPage(1);
      fetchSearchResults(searchQuery.trim(), 1);
    }, 400);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
    // Only re-run when the query or fetch function changes.
    // isSearchActive is intentionally excluded to prevent double-fetch.
     
  }, [searchQuery, fetchSearchResults]);

  const handleModeChange = (mode: ViewMode): void => {
    setViewMode(mode);
    setPage(1);
  };

  const handleTabChange = (tab: MediaTab): void => {
    setMediaTab(tab);
    setPage(1);
  };

  const handleLoadMore = (): void => {
    const nextPage = page + 1;
    if (isSearchActive) {
      fetchSearchResults(searchQuery.trim(), nextPage, true);
    } else {
      fetchItems(viewMode, mediaTab, nextPage, true);
    }
  };

  const handleFindTorrent = (query: string): void => {
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleClearSearch = (): void => {
    setSearchQuery('');
    setIsSearchActive(false);
  };

  // Show Find button for recent and search results (not upcoming)
  const showFindButton = isSearchActive || viewMode === 'recent';

  if (!isPremium) {
    return <PremiumGate />;
  }

  const hasMore = page < totalPages;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Upcoming & Recent</h1>
        <p className="text-sm text-text-secondary mt-1">
          Discover upcoming, recently released, and search for movies and TV series
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search movies & TV series..."
          className="w-full rounded-lg border border-border-primary bg-bg-secondary pl-10 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        ) : null}
      </div>

      {/* Mode Toggle + Media Tabs (hidden during search) */}
      {!isSearchActive ? (
        <>
          {/* View Mode Toggle: Upcoming | Recent */}
          <div className="flex gap-2">
            {(['upcoming', 'recent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleModeChange(mode)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  viewMode === mode
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                {mode === 'upcoming' ? 'Upcoming' : 'Recent'}
              </button>
            ))}
          </div>

          {/* Media Tab Bar */}
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
                    mediaTab === tab.key
                      ? 'text-accent-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                  {mediaTab === tab.key ? (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Search Results Header */}
      {isSearchActive && !isLoading ? (
        <div className="text-sm text-text-secondary">
          Results for &ldquo;<span className="text-text-primary font-medium">{searchQuery}</span>&rdquo;
          {totalResults > 0 ? ` (${totalResults.toLocaleString()} results)` : null}
        </div>
      ) : null}

      {/* Results count (non-search) */}
      {!isSearchActive && !isLoading && items.length > 0 ? (
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
              showFindButton={showFindButton}
              onFindTorrent={handleFindTorrent}
            />
          ))}
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-text-muted">
            {isSearchActive ? 'No results found' : 'No content found'}
          </p>
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
