'use client';

/**
 * Live Radio Page (SiriusXM)
 *
 * Mirrors bin/play-siriusxm.ts: browse SiriusXM Sports / News, search by name,
 * pick audio quality. Favorites and direct custom stream URLs are also
 * supported.
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
import { StationCard, RadioPlayerModal, ConnectSiriusXm } from '@/components/radio';
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

type TabType = 'favorites' | 'sports' | 'news';

const STREAM_SUGGESTIONS: ReadonlyArray<{ name: string; genre: string; url: string }> = [
  // News
  { name: 'BBC World Service', genre: 'News', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
  { name: 'NPR News', genre: 'News', url: 'https://npr-ice.streamguys1.com/live.mp3' },
  { name: 'Al Jazeera English', genre: 'News', url: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8' },
  { name: 'France 24 English', genre: 'News', url: 'https://static.france24.com/live/F24_EN_HI_HLS/live_web.m3u8' },
  { name: 'DW News', genre: 'News', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
  // Sports
  { name: 'ESPN Radio', genre: 'Sports', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/ESPNRADIOFLAAC.aac' },
  { name: 'BBC Radio 5 Live', genre: 'Sports', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_five_live' },
  { name: 'talkSPORT', genre: 'Sports', url: 'https://radio.talksport.com/stream' },
  { name: 'Fox Sports Radio', genre: 'Sports', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/FOXSPORTSRADIO.mp3' },
  { name: 'SportsGrid', genre: 'Sports', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SPORTSGRIDAAC.aac' },
];

const QUALITIES: ReadonlyArray<{ value: RadioQuality; label: string }> = [
  { value: '256', label: '256 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '64', label: '64 kbps' },
  { value: '32', label: '32 kbps' },
];

function tabToCategory(tab: TabType): RadioCategory | null {
  if (tab === 'sports') return 'sports';
  if (tab === 'news') return 'news';
  return null;
}

export function RadioContent(): React.ReactElement {
  const { isLoading: isAuthLoading, isLoggedIn } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('sports');
  const [quality, setQuality] = useState<RadioQuality>('256');

  const [searchQuery, setSearchQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [customStreamUrl, setCustomStreamUrl] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [customStations, setCustomStations] = useState<RadioStation[]>([]);

  const {
    stations,
    isSearching,
    error: stationsError,
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

  // Auto-load category list when the active tab changes (and no search query)
  useEffect(() => {
    if (searchQuery.trim()) return;
    const cat = tabToCategory(activeTab);
    if (cat) {
      void browseCategory(cat);
    } else {
      clearResults();
    }
  }, [activeTab, searchQuery, browseCategory, clearResults]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const query = e.target.value;
      setSearchQuery(query);
      if (query.trim().length > 0) {
        void search(query);
      } else {
        // Reverting to the active category list will be handled by the useEffect
        clearResults();
      }
    },
    [search, clearResults]
  );

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent): void => {
      e?.preventDefault();
      const trimmed = searchQuery.trim();
      if (trimmed) {
        void search(trimmed);
      } else {
        const cat = tabToCategory(activeTab);
        if (cat) void browseCategory(cat);
      }
    },
    [search, browseCategory, searchQuery, activeTab]
  );

  const handleSearchClear = useCallback((): void => {
    setSearchQuery('');
    clearResults();
    const cat = tabToCategory(activeTab);
    if (cat) void browseCategory(cat);
  }, [clearResults, browseCategory, activeTab]);

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
      setSelectedStation(station);
      setIsPlayerOpen(true);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : 'Failed to add custom stream');
    }
  }, [customGenre, customName, customStreamUrl]);

  const handlePlayStation = useCallback((station: RadioStation): void => {
    setSelectedStation(station);
    setIsPlayerOpen(true);
  }, []);

  const handleSuggestionPlay = useCallback(
    (suggestion: { name: string; genre: string; url: string }): void => {
      const station = createCustomRadioStation({ name: suggestion.name, genre: suggestion.genre, streamUrl: suggestion.url });
      handlePlayStation(station);
    },
    [handlePlayStation]
  );

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

  const isSearchActive = searchQuery.trim().length > 0;

  const tabHeading = isSearchActive
    ? `Search Results for "${searchQuery.trim()}"`
    : activeTab === 'favorites'
    ? 'My Favorites'
    : activeTab === 'sports'
    ? 'SiriusXM Sports'
    : 'SiriusXM News';

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <ConnectSiriusXm />
        </div>

        {/* Search + quality */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <SearchIcon className="text-text-muted" size={20} />
            </div>
            <input
              type="text"
              placeholder='Search SiriusXM (e.g., "ESPN", "CNBC")'
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full rounded-lg border border-border-default bg-bg-secondary py-3 pl-14 pr-10 text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
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
            <label className="sr-only" htmlFor="radio-quality">Quality</label>
            <select
              id="radio-quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as RadioQuality)}
              className="rounded-lg border border-border-default bg-bg-secondary px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
              aria-label="Audio quality"
              title="Audio quality"
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
        </form>

        {/* Tabs: Favorites | Sports | News */}
        <div className="flex flex-wrap gap-2 border-b border-border-default">
          <button
            onClick={() => setActiveTab('favorites')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'favorites'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            <HeartFilledIcon size={16} />
            Favorites
            {favorites.length > 0 ? (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs">
                {favorites.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab('sports')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'sports'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            Sports
          </button>
          <button
            onClick={() => setActiveTab('news')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'news'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            News
          </button>
        </div>

        {/* Suggested live streams — always visible, plays directly */}
        <div className="rounded-xl border border-border-default bg-bg-secondary p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Suggested Live Streams</h2>
          {(['News', 'Sports'] as const).map((genre) => (
            <div key={genre}>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Live {genre}</p>
              <div className="flex flex-wrap gap-2">
                {STREAM_SUGGESTIONS.filter((s) => s.genre === genre).map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    onClick={() => handleSuggestionPlay(s)}
                    className="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Header for the current view */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{tabHeading}</h2>
          {!isSearchActive && (activeTab === 'sports' || activeTab === 'news') && stations.length > 0 ? (
            <span className="text-xs text-text-muted">{stations.length} channels</span>
          ) : null}
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {/* Favorites tab content */}
          {activeTab === 'favorites' && !isSearchActive && (
            <>
              {isFavoritesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                </div>
              ) : favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <HeartFilledIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">No Favorites Yet</h3>
                  <p className="text-sm text-text-secondary">
                    Open Sports or News and tap the heart on any station to save it.
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

          {/* Sports / News / Search content */}
          {(activeTab !== 'favorites' || isSearchActive) ? <>
              {isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                  <span className="ml-3 text-text-secondary">Loading...</span>
                </div>
              ) : stationsError ? (
                <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
                  {stationsError}
                </div>
              ) : stations.length === 0 && filteredCustomStations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <RadioIcon size={48} className="mb-4 text-text-muted" />
                  <h3 className="mb-2 text-lg font-medium text-text-primary">No stations found</h3>
                  <p className="text-sm text-text-secondary">
                    {isSearchActive
                      ? 'Try a different search term.'
                      : 'No SiriusXM channels in this category.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredCustomStations.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-text-primary">Custom Streams</h3>
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

                  {stations.length > 0 ? (
                    <section className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {stations.map((station) => (
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
            </> : null}
        </div>

        {/* Custom stream form (kept at bottom) */}
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
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
            />
            <input
              type="text"
              value={customGenre}
              onChange={(e) => setCustomGenre(e.target.value)}
              placeholder="Genre (optional)"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
            />
            <input
              type="url"
              value={customStreamUrl}
              onChange={(e) => setCustomStreamUrl(e.target.value)}
              placeholder="https://example.com/live.mp3"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
              required
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 focus:outline-hidden focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-secondary"
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
