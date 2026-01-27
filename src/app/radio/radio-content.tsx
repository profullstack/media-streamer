'use client';

/**
 * Live Radio Page
 *
 * Stream radio stations with search and favorites support.
 * Features:
 * - Search radio stations via TuneIn API
 * - Favorite stations (authenticated users)
 * - Audio player for streaming
 * - Tab switching between favorites and search
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { SearchIcon, LoadingSpinner, HeartFilledIcon } from '@/components/ui/icons';
import { RadioIcon } from '@/components/ui/icons';
import { StationCard, RadioPlayerModal } from '@/components/radio';
import { useAuth } from '@/hooks/use-auth';
import {
  useRadioSearch,
  useRadioFavorites,
  type RadioStation,
  type RadioStationFavorite,
} from '@/hooks/use-radio';

type TabType = 'favorites' | 'search';

export function RadioContent(): React.ReactElement {
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('favorites');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const {
    stations: searchResults,
    isSearching,
    error: searchError,
    search,
    clearResults,
  } = useRadioSearch(300);

  // Favorites state
  const {
    favorites,
    isLoading: isFavoritesLoading,
    refetch: refetchFavorites,
    isFavorited,
  } = useRadioFavorites();

  // Player state
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const query = e.target.value;
      setSearchQuery(query);
      void search(query);

      // Switch to search tab when typing
      if (query.trim().length > 0 && activeTab !== 'search') {
        setActiveTab('search');
      }
    },
    [search, activeTab]
  );

  // Handle explicit search submit (for TV remotes and Enter key)
  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent): void => {
      e?.preventDefault();
      if (searchQuery.trim()) {
        setActiveTab('search');
        void search(searchQuery);
      }
    },
    [search, searchQuery]
  );

  // Handle search clear
  const handleSearchClear = useCallback((): void => {
    setSearchQuery('');
    clearResults();
  }, [clearResults]);

  // Handle tab change
  const handleTabChange = useCallback((tab: TabType): void => {
    setActiveTab(tab);
    if (tab === 'favorites') {
      handleSearchClear();
    }
  }, [handleSearchClear]);

  // Handle play station
  const handlePlayStation = useCallback((station: RadioStation): void => {
    setSelectedStation(station);
    setIsPlayerOpen(true);
  }, []);

  // Handle close player
  const handleClosePlayer = useCallback((): void => {
    setIsPlayerOpen(false);
    setSelectedStation(null);
  }, []);

  // Handle favorite change - refetch favorites list
  const handleFavoriteChange = useCallback((): void => {
    void refetchFavorites();
  }, [refetchFavorites]);

  // Convert favorite to RadioStation format
  const favoriteToStation = useCallback((fav: RadioStationFavorite): RadioStation => ({
    id: fav.station_id,
    name: fav.station_name,
    imageUrl: fav.station_image_url ?? undefined,
    genre: fav.station_genre ?? undefined,
  }), []);

  // Show loading while checking auth
  if (isAuthLoading) {
    return (
      <MainLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <LoadingSpinner size={48} className="text-accent-primary" />
        </div>
      </MainLayout>
    );
  }

  // Don't render content if not logged in (redirect will happen)
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
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <RadioIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Live Radio</h1>
            <p className="text-sm text-text-secondary">
              Stream radio stations for sports, news, music, and more
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <SearchIcon className="text-text-muted" size={20} />
            </div>
            <input
              type="text"
              placeholder="Search radio stations..."
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
          <button
            type="submit"
            disabled={!searchQuery.trim() || isSearching}
            className="flex items-center gap-2 rounded-lg bg-accent-primary px-6 py-3 font-medium text-white transition-colors hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Search"
          >
            <SearchIcon size={20} />
            <span className="hidden sm:inline">Search</span>
          </button>
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
            onClick={() => handleTabChange('search')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'search'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            <SearchIcon size={16} />
            Search Results
            {searchResults.length > 0 ? (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs">
                {searchResults.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {/* Favorites Tab */}
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
                    Search for radio stations and click the heart icon to add them to your favorites.
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

          {/* Search Tab */}
          {activeTab === 'search' && (
            <>
              {isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                  <span className="ml-3 text-text-secondary">Searching...</span>
                </div>
              ) : searchError ? (
                <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
                  {searchError}
                </div>
              ) : searchQuery.trim().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <SearchIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">
                    Search for Radio Stations
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Enter a station name, genre, or location to find radio stations.
                  </p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <RadioIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">
                    No Stations Found
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Try a different search term.
                  </p>
                </div>
              ) : (
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
              )}
            </>
          )}
        </div>
      </div>

      {/* Player Modal */}
      {selectedStation ? (
        <RadioPlayerModal
          station={selectedStation}
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
        />
      ) : null}
    </MainLayout>
  );
}
