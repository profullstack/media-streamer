'use client';

/**
 * Live Radio Page (SiriusXM)
 *
 * Browse SiriusXM Sports / News categories, search by name, mirror the same
 * features as bin/play-siriusxm.ts (category, search, quality), plus favorites
 * and custom direct stream URLs.
 */

import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  SearchIcon,
  LoadingSpinner,
  HeartFilledIcon,
  LinkIcon,
  PlusIcon,
  RadioIcon,
} from '@/components/ui/icons';
import { StationCard, RadioPlayerModal } from '@/components/radio';
import { useAuth } from '@/hooks/use-auth';
import {
  useRadioSearch,
  useRadioFavorites,
  type RadioStation,
  type RadioStationFavorite,
  type RadioCategory,
  type RadioQuality,
} from '@/hooks/use-radio';
import { createCustomRadioStation } from '@/lib/radio/station-utils';

type TabType = 'favorites' | 'browse';

const CATEGORIES: ReadonlyArray<{ value: RadioCategory; label: string }> = [
  { value: 'sports', label: 'Sports' },
  { value: 'news', label: 'News' },
];

const QUALITIES: ReadonlyArray<{ value: RadioQuality; label: string }> = [
  { value: '256', label: '256 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '64', label: '64 kbps' },
  { value: '32', label: '32 kbps' },
];

export function RadioContent(): React.ReactElement {
  const { isLoading: isAuthLoading, isLoggedIn } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [category, setCategory] = useState<RadioCategory>('sports');
  const [quality, setQuality] = useState<RadioQuality>('256');

  const [searchQuery, setSearchQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [customStreamUrl, setCustomStreamUrl] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [customStations, setCustomStations] = useState<RadioStation[]>([]);

  const {
    stations: searchResults,
    isSearching,
    error: searchError,
    search,
    browseCategory,
    clearResults,
  } = useRadioSearch(300);

  const {
    favorites,
    isLoading: isFavoritesLoading,
    refetch: refetchFavorites,
    isFavorited,
  } = useRadioFavorites();

  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Auto-load category browse when tab opens or category changes (and no search query)
  useEffect(() => {
    if (activeTab !== 'browse') return;
    if (searchQuery.trim()) return;
    void browseCategory(category);
  }, [activeTab, category, searchQuery, browseCategory]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const query = e.target.value;
      setSearchQuery(query);
      if (query.trim().length > 0) {
        if (activeTab !== 'browse') setActiveTab('browse');
        void search(query);
      } else if (activeTab === 'browse') {
        void browseCategory(category);
      }
    },
    [search, browseCategory, activeTab, category]
  );

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent): void => {
      e?.preventDefault();
      const trimmed = searchQuery.trim();
      setActiveTab('browse');
      if (trimmed) {
        void search(trimmed);
      } else {
        void browseCategory(category);
      }
    },
    [search, browseCategory, searchQuery, category]
  );

  const handleSearchClear = useCallback((): void => {
    setSearchQuery('');
    clearResults();
    if (activeTab === 'browse') {
      void browseCategory(category);
    }
  }, [clearResults, activeTab, browseCategory, category]);

  const handleCategoryChange = useCallback(
    (next: RadioCategory): void => {
      setCategory(next);
      if (!searchQuery.trim() && activeTab === 'browse') {
        void browseCategory(next);
      }
    },
    [activeTab, browseCategory, searchQuery]
  );

  const handleCustomSubmit = useCallback((e: React.FormEvent): void => {
    e.preventDefault();

    try {
      const station = createCustomRadioStation({
        name: customName,
        genre: customGenre,
        streamUrl: customStreamUrl,
      });

      setCustomStations((prev) => [
        station,
        ...prev.filter((entry) => entry.id !== station.id),
      ]);
      setCustomName('');
      setCustomGenre('');
      setCustomStreamUrl('');
      setCustomError(null);
      setActiveTab('browse');
      setSelectedStation(station);
      setIsPlayerOpen(true);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : 'Failed to add custom stream');
    }
  }, [customGenre, customName, customStreamUrl]);

  const handleTabChange = useCallback((tab: TabType): void => {
    setActiveTab(tab);
    if (tab === 'favorites') {
      handleSearchClear();
    }
  }, [handleSearchClear]);

  const handlePlayStation = useCallback((station: RadioStation): void => {
    setSelectedStation(station);
    setIsPlayerOpen(true);
  }, []);

  const handleClosePlayer = useCallback((): void => {
    setIsPlayerOpen(false);
    setSelectedStation(null);
  }, []);

  const handleFavoriteChange = useCallback((): void => {
    void refetchFavorites();
  }, [refetchFavorites]);

  const favoriteToStation = useCallback((fav: RadioStationFavorite): RadioStation => ({
    id: fav.station_id,
    name: fav.station_name,
    imageUrl: fav.station_image_url ?? undefined,
    genre: fav.station_genre ?? undefined,
  }), []);

  const filteredCustomStations = customStations.filter((station) => {
    if (!searchQuery.trim()) return true;
    const haystack = [station.name, station.description, station.genre]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((token) => haystack.includes(token));
  });

  if (isAuthLoading) {
    return (
      <MainLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <LoadingSpinner size={48} className="text-accent-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isLoggedIn) {
    return (
      <MainLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Redirecting to login...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <RadioIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">SiriusXM Live Radio</h1>
            <p className="text-sm text-text-secondary">
              Browse Sports and News channels, search by name, or play a custom stream URL.
            </p>
          </div>
        </div>

        {/* Search + filters */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <SearchIcon className="text-text-muted" size={20} />
            </div>
            <input
              type="text"
              placeholder='Search SiriusXM (e.g., "ESPN", "CNN")'
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full rounded-lg border border-border-default bg-bg-secondary py-3 pl-14 pr-10 text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={handleSearchClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="radio-category">Category</label>
            <select
              id="radio-category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as RadioCategory)}
              className="rounded-lg border border-border-default bg-bg-secondary px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              aria-label="SiriusXM category"
              title="Category (used when not searching)"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label className="sr-only" htmlFor="radio-quality">Quality</label>
            <select
              id="radio-quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as RadioQuality)}
              className="rounded-lg border border-border-default bg-bg-secondary px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              aria-label="Audio quality"
              title="Audio quality"
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-6 py-3 font-medium text-white transition-colors hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Search"
          >
            <SearchIcon size={20} />
            <span className="hidden sm:inline">{searchQuery.trim() ? 'Search' : 'Browse'}</span>
          </button>
        </form>

        {/* Custom stream form */}
        <form
          onSubmit={handleCustomSubmit}
          className="rounded-xl border border-border-default bg-bg-secondary p-4"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <LinkIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Add Custom Stream</h2>
              <p className="text-sm text-text-secondary">
                Paste a direct radio stream URL. Name is optional. Favorite it to keep it.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Station name (optional)"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            <input
              type="text"
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              placeholder="Genre (optional)"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            <input
              type="url"
              value={customStreamUrl}
              onChange={(e) => setCustomStreamUrl(e.target.value)}
              placeholder="https://example.com/live.mp3"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              required
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-secondary"
            >
              <PlusIcon size={16} />
              Add Stream
            </button>
          </div>

          {customError ? (
            <p className="mt-3 text-sm text-red-500">{customError}</p>
          ) : (
            <p className="mt-3 text-xs text-text-muted">
              Direct `http` streams may be blocked by the browser on secure pages. `https` is safest.
            </p>
          )}
        </form>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border-default">
          <button
            onClick={() => handleTabChange('favorites')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'favorites'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            <HeartFilledIcon size={16} />
            My Favorites
            {favorites.length > 0 ? (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs">
                {favorites.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => handleTabChange('browse')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'browse'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            <SearchIcon size={16} />
            {searchQuery.trim() ? 'Search Results' : `Browse ${category === 'sports' ? 'Sports' : 'News'}`}
            {searchResults.length + customStations.length > 0 ? (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs">
                {searchResults.length + customStations.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {activeTab === 'favorites' && (
            <>
              {isFavoritesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                </div>
              ) : favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <HeartFilledIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">
                    No Favorites Yet
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Browse channels or search SiriusXM and tap the heart to save.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {favorites.map((fav) => (
                    <StationCard
                      key={fav.id}
                      station={favoriteToStation(fav)}
                      isFavorited={true}
                      onPlay={handlePlayStation}
                      onFavoriteChange={handleFavoriteChange}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'browse' && (
            <>
              {isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                  <span className="ml-3 text-text-secondary">Loading...</span>
                </div>
              ) : searchError ? (
                <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
                  {searchError}
                </div>
              ) : searchResults.length === 0 && filteredCustomStations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <RadioIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">
                    No Stations Found
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Try a different search term or category.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredCustomStations.length > 0 ? (
                    <section className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">Custom Streams</h3>
                        <p className="text-sm text-text-secondary">
                          Direct stream URLs you added in this session.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {filteredCustomStations.map((station) => (
                          <StationCard
                            key={station.id}
                            station={station}
                            isFavorited={isFavorited(station.id)}
                            onPlay={handlePlayStation}
                            onFavoriteChange={handleFavoriteChange}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {searchResults.length > 0 ? (
                    <section className="space-y-3">
                      {filteredCustomStations.length > 0 ? (
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">
                            {searchQuery.trim() ? 'Search Results' : `SiriusXM ${category === 'sports' ? 'Sports' : 'News'}`}
                          </h3>
                          <p className="text-sm text-text-secondary">
                            {searchQuery.trim()
                              ? 'Matching SiriusXM channels and direct stations.'
                              : 'Channels in the selected SiriusXM category.'}
                          </p>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {searchResults.map((station) => (
                          <StationCard
                            key={station.id}
                            station={station}
                            isFavorited={isFavorited(station.id)}
                            onPlay={handlePlayStation}
                            onFavoriteChange={handleFavoriteChange}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedStation ? (
        <RadioPlayerModal
          station={selectedStation}
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
          quality={quality}
        />
      ) : null}
    </MainLayout>
  );
}
