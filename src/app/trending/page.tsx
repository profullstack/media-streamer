'use client';

/**
 * Trending Page
 *
 * Shows trending content from multiple sources:
 * - Movies: Trending movies from TheTVDB
 * - TV Shows: Trending TV shows from TheTVDB
 * - Torrents: Popular torrents from our database
 *
 * Features: separate sections, rich metadata (cast, directors, description),
 * "Find Torrent" button to search for torrents.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { MediaThumbnail } from '@/components/ui/media-placeholder';
import { cn, formatBytes } from '@/lib/utils';
import {
  TrendingIcon,
  MovieIcon,
  TvIcon,
  SearchIcon,
  StarIcon,
  ClockIcon,
} from '@/components/ui/icons';

/**
 * TheTVDB trending item (movies/TV)
 */
interface TheTVDBItem {
  id: number;
  title: string;
  mediaType: 'movie' | 'tv';
  year?: number;
  posterUrl?: string;
  overview?: string;
  rating?: number;
  runtime?: number;
  status?: string;
  network?: string;
  genres?: string[];
  cast?: string[];
  directors?: string[];
}

/**
 * Torrent item from our database
 */
interface TorrentItem {
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

/**
 * Section result from API
 */
interface SectionResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalResults: number;
  error?: string;
}

/**
 * Full API response
 */
interface TrendingResponse {
  movies?: SectionResult<TheTVDBItem>;
  tv?: SectionResult<TheTVDBItem>;
  torrents?: SectionResult<TorrentItem>;
}

type ActiveSection = 'all' | 'movies' | 'tv' | 'torrents';

const SECTION_OPTIONS: { key: ActiveSection; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'all', label: 'All', icon: TrendingIcon },
  { key: 'movies', label: 'Movies', icon: MovieIcon },
  { key: 'tv', label: 'TV Shows', icon: TvIcon },
  { key: 'torrents', label: 'Torrents', icon: SearchIcon },
];

/**
 * Format rating for display
 */
function formatRating(rating?: number): string {
  if (rating === undefined) return 'N/A';
  return rating.toFixed(1);
}

/**
 * Build search query for finding torrents
 */
function buildSearchQuery(item: TheTVDBItem): string {
  const parts = [item.title];
  if (item.year) {
    parts.push(String(item.year));
  }
  return parts.join(' ');
}

/**
 * TheTVDB Item Card Component
 */
function TheTVDBItemCard({ item, onFindTorrent }: { item: TheTVDBItem; onFindTorrent: (query: string) => void }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg bg-bg-secondary border border-border-primary hover:border-accent-primary transition-all">
      <div className="flex flex-col sm:flex-row">
        {/* Poster */}
        <div className="relative w-full sm:w-40 flex-shrink-0">
          <MediaThumbnail
            src={item.posterUrl}
            alt={item.title}
            contentType={item.mediaType === 'movie' ? 'movie' : 'tvshow'}
            className="aspect-[2/3] w-full sm:h-60"
          />
          {/* Rating badge */}
          {item.rating !== undefined && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-yellow-400">
              <StarIcon size={12} />
              {formatRating(item.rating)}
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
              {item.year ? <span>{item.year}</span> : null}
              {item.runtime ? <span className="flex items-center gap-1">
                  <ClockIcon size={14} />
                  {item.runtime} min
                </span> : null}
              {item.status ? <span className="text-accent-secondary">{item.status}</span> : null}
              {item.network ? <span className="text-accent-secondary">{item.network}</span> : null}
            </div>
          </div>

          {/* Genres */}
          {item.genres && item.genres.length > 0 ? <div className="flex flex-wrap gap-1">
              {item.genres.slice(0, 4).map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                >
                  {genre}
                </span>
              ))}
            </div> : null}

          {/* Description/Overview */}
          {item.overview ? <p className={cn(
              'text-sm text-text-secondary',
              !isExpanded && 'line-clamp-2'
            )}>
              {item.overview}
            </p> : null}
          {item.overview && item.overview.length > 150 ? <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-accent-primary hover:underline"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button> : null}

          {/* Cast */}
          {item.cast && item.cast.length > 0 ? <div className="text-sm">
              <span className="text-text-muted">Cast: </span>
              <span className="text-text-secondary">
                {item.cast.slice(0, 3).join(', ')}
              </span>
            </div> : null}

          {/* Directors/Creators */}
          {item.directors && item.directors.length > 0 ? <div className="text-sm">
              <span className="text-text-muted">
                {item.mediaType === 'tv' ? 'Created by: ' : 'Director: '}
              </span>
              <span className="text-text-secondary">
                {item.directors.join(', ')}
              </span>
            </div> : null}

          {/* Find Torrent Button */}
          <button
            type="button"
            onClick={() => onFindTorrent(buildSearchQuery(item))}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
          >
            <SearchIcon size={16} />
            Find Torrent
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Torrent Item Card Component
 */
function TorrentItemCard({ item }: { item: TorrentItem }): React.ReactElement {
  return (
    <Link
      href={`/torrents/${item.id}`}
      className="group block overflow-hidden rounded-lg bg-bg-secondary border border-border-primary hover:border-accent-primary transition-all"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Poster */}
        <div className="relative w-full sm:w-32 flex-shrink-0">
          <MediaThumbnail
            src={item.posterUrl ?? undefined}
            alt={item.cleanTitle ?? item.title}
            contentType={item.mediaType === 'movie' ? 'movie' : item.mediaType === 'tv' ? 'tvshow' : item.mediaType === 'music' ? 'music' : 'other'}
            className="aspect-[2/3] w-full sm:h-48"
          />
          {/* Seeder badge */}
          {item.seeders !== null && item.seeders > 0 && (
            <div
              className={cn(
                'absolute top-2 right-2 rounded px-1.5 py-0.5 text-xs font-medium',
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
        </div>

        {/* Content */}
        <div className="flex-1 p-3 space-y-2">
          <h3 className="font-medium text-text-primary group-hover:text-accent-primary transition-colors line-clamp-2">
            {item.cleanTitle ?? item.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {item.year ? <span>{item.year}</span> : null}
            <span className="capitalize">{item.mediaType === 'tv' ? 'TV' : item.mediaType}</span>
            <span>{formatBytes(item.totalSize)}</span>
          </div>
          {item.description ? <p className="text-xs text-text-muted line-clamp-2">{item.description}</p> : null}
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {item.seeders !== null && <span className="text-green-500">{item.seeders} seeders</span>}
            {item.leechers !== null && <span className="text-yellow-500">{item.leechers} leechers</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Section Header Component
 */
function SectionHeader({ 
  title, 
  icon: Icon, 
  count,
  error 
}: { 
  title: string; 
  icon: React.ComponentType<{ size?: number; className?: string }>; 
  count?: number;
  error?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
        <Icon size={24} className="text-accent-primary" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-sm font-normal text-text-muted">({count})</span>
        )}
      </h2>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

/**
 * Loading Skeleton Component
 */
function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse flex gap-4 rounded-lg bg-bg-secondary p-4">
          <div className="w-32 h-48 rounded bg-bg-tertiary flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-3/4 rounded bg-bg-tertiary" />
            <div className="h-4 w-1/2 rounded bg-bg-tertiary" />
            <div className="h-16 w-full rounded bg-bg-tertiary" />
            <div className="h-4 w-2/3 rounded bg-bg-tertiary" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TrendingPage(): React.ReactElement {
  const router = useRouter();
  const [data, setData] = useState<TrendingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('all');

  const fetchTrending = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        details: 'true', // Get full details including cast/crew
      });

      // Only fetch specific section if not 'all'
      if (activeSection !== 'all') {
        params.set('section', activeSection);
      }

      const response = await fetch(`/api/trending?${params.toString()}`);

      if (!response.ok) {
        setData(null);
        return;
      }

      const result: TrendingResponse = await response.json();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  const handleFindTorrent = useCallback((query: string): void => {
    // Navigate to find-torrents page with the search query
    router.push(`/find-torrents?q=${encodeURIComponent(query)}`);
  }, [router]);

  const handleSectionChange = useCallback((section: ActiveSection): void => {
    setActiveSection(section);
  }, []);

  const showMovies = activeSection === 'all' || activeSection === 'movies';
  const showTV = activeSection === 'all' || activeSection === 'tv';
  const showTorrents = activeSection === 'all' || activeSection === 'torrents';

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <TrendingIcon size={28} className="text-accent-primary" />
            Trending
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Discover trending movies, TV shows, and popular torrents
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          {/* Section Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Section:</span>
            {SECTION_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleSectionChange(option.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                    activeSection === option.key
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
        </div>

        {/* Loading */}
        {isLoading ? <LoadingSkeleton /> : null}

        {/* Content */}
        {!isLoading && data ? <div className="space-y-10">
            {/* Movies Section */}
            {showMovies && data.movies ? <section className="space-y-4">
                <SectionHeader
                  title="Trending Movies"
                  icon={MovieIcon}
                  count={data.movies.totalResults}
                  error={data.movies.error}
                />
                {data.movies.items.length > 0 ? (
                  <div className="space-y-4">
                    {data.movies.items.map((item) => (
                      <TheTVDBItemCard
                        key={item.id}
                        item={item}
                        onFindTorrent={handleFindTorrent}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm py-4">
                    {data.movies.error || 'No trending movies found. Make sure THETVDB_API_KEY is configured.'}
                  </p>
                )}
              </section> : null}

            {/* TV Shows Section */}
            {showTV && data.tv ? <section className="space-y-4">
                <SectionHeader
                  title="Trending TV Shows"
                  icon={TvIcon}
                  count={data.tv.totalResults}
                  error={data.tv.error}
                />
                {data.tv.items.length > 0 ? (
                  <div className="space-y-4">
                    {data.tv.items.map((item) => (
                      <TheTVDBItemCard
                        key={item.id}
                        item={item}
                        onFindTorrent={handleFindTorrent}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm py-4">
                    {data.tv.error || 'No trending TV shows found. Make sure THETVDB_API_KEY is configured.'}
                  </p>
                )}
              </section> : null}

            {/* Torrents Section */}
            {showTorrents && data.torrents ? <section className="space-y-4">
                <SectionHeader
                  title="Popular Torrents"
                  icon={TrendingIcon}
                  count={data.torrents.totalResults}
                  error={data.torrents.error}
                />
                {data.torrents.items.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.torrents.items.map((item) => (
                      <TorrentItemCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm py-4">
                    {data.torrents.error || 'No popular torrents found in our database.'}
                  </p>
                )}
              </section> : null}
          </div> : null}

        {/* Empty state */}
        {!isLoading && !data && (
          <div className="py-12 text-center">
            <TrendingIcon size={48} className="mx-auto text-text-muted opacity-50" />
            <p className="mt-4 text-text-muted">
              Unable to load trending content.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Please check your API configuration and try again.
            </p>
            <button
              type="button"
              onClick={fetchTrending}
              className="mt-4 btn-primary px-4 py-2 text-sm"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
