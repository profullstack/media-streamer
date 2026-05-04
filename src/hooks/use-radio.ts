'use client';

/**
 * Radio Hooks
 *
 * Client-side hooks for radio station search, streaming, and favorites.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export type RadioCategory = 'sports' | 'news';
export type RadioQuality = '256' | '128' | '64' | '32';

export interface RadioStation {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  genre?: string;
  currentTrack?: string;
  reliability?: number;
  formats?: string[];
}

export interface RadioStream {
  url: string;
  mediaType: 'mp3' | 'aac' | 'hls' | 'flash' | 'ogg' | 'html';
  bitrate?: number;
  isDirect: boolean;
}

export interface RadioStationFavorite {
  id: string;
  user_id: string;
  station_id: string;
  station_name: string;
  station_image_url?: string | null;
  station_genre?: string | null;
  created_at: string;
}

// ============================================================================
// useRadioSearch Hook
// ============================================================================

interface UseRadioSearchReturn {
  stations: RadioStation[];
  isSearching: boolean;
  error: string | null;
  search: (query: string, options?: { category?: RadioCategory }) => Promise<void>;
  browseCategory: (category: RadioCategory) => Promise<void>;
  clearResults: () => void;
}

export function useRadioSearch(debounceMs: number = 300): UseRadioSearchReturn {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const runRequest = useCallback(async (url: string): Promise<void> => {
    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Search failed');
        setStations([]);
        return;
      }

      setStations(data.stations || []);
    } catch (err) {
      console.error('[useRadioSearch] Error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setStations([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const search = useCallback(async (
    query: string,
    options?: { category?: RadioCategory }
  ) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setStations([]);
      setError(null);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      const params = new URLSearchParams({ q: query.trim() });
      if (options?.category) params.set('cat', options.category);
      await runRequest(`/api/radio?${params.toString()}`);
    }, debounceMs);
  }, [debounceMs, runRequest]);

  const browseCategory = useCallback(async (category: RadioCategory): Promise<void> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const params = new URLSearchParams({ cat: category });
    await runRequest(`/api/radio?${params.toString()}`);
  }, [runRequest]);

  const clearResults = useCallback(() => {
    setStations([]);
    setError(null);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return { stations, isSearching, error, search, browseCategory, clearResults };
}

// ============================================================================
// useRadioStream Hook
// ============================================================================

interface UseRadioStreamReturn {
  streams: RadioStream[];
  preferredStream: RadioStream | null;
  isLoading: boolean;
  error: string | null;
  getStream: (stationId: string, quality?: RadioQuality) => Promise<void>;
}

export function useRadioStream(): UseRadioStreamReturn {
  const [streams, setStreams] = useState<RadioStream[]>([]);
  const [preferredStream, setPreferredStream] = useState<RadioStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStream = useCallback(async (stationId: string, quality?: RadioQuality) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ id: stationId });
      if (quality) params.set('quality', quality);

      const response = await fetch(`/api/radio/stream?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to get stream');
        setStreams([]);
        setPreferredStream(null);
        return;
      }

      setStreams(data.streams || []);
      setPreferredStream(data.preferredStream || null);
    } catch (err) {
      console.error('[useRadioStream] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get stream');
      setStreams([]);
      setPreferredStream(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { streams, preferredStream, isLoading, error, getStream };
}

// ============================================================================
// useRadioFavorites Hook
// ============================================================================

interface UseRadioFavoritesReturn {
  favorites: RadioStationFavorite[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isFavorited: (stationId: string) => boolean;
}

export function useRadioFavorites(): UseRadioFavoritesReturn {
  const [favorites, setFavorites] = useState<RadioStationFavorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/radio/favorites');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setFavorites([]);
          return;
        }
        setError(data.error || 'Failed to fetch favorites');
        setFavorites([]);
        return;
      }

      setFavorites(data.favorites || []);
    } catch (err) {
      console.error('[useRadioFavorites] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch favorites');
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback(
    (stationId: string): boolean => {
      return favorites.some((fav) => fav.station_id === stationId);
    },
    [favorites]
  );

  return {
    favorites,
    isLoading,
    error,
    refetch: fetchFavorites,
    isFavorited,
  };
}

// ============================================================================
// useRadioStationFavorite Hook
// ============================================================================

interface UseRadioStationFavoriteReturn {
  isFavorited: boolean;
  isLoading: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  clearError: () => void;
}

export function useRadioStationFavorite(
  station: RadioStation,
  initialFavorited: boolean = false
): UseRadioStationFavoriteReturn {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsFavorited(initialFavorited);
  }, [initialFavorited]);

  const toggle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isFavorited) {
        const response = await fetch('/api/radio/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId: station.id }),
        });

        if (!response.ok) {
          const data = await response.json();
          if (response.status === 401) {
            setError('Please log in to manage favorites');
          } else {
            setError(data.error || 'Failed to remove favorite');
          }
          return;
        }

        setIsFavorited(false);
      } else {
        const response = await fetch('/api/radio/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stationId: station.id,
            stationName: station.name,
            stationImageUrl: station.imageUrl,
            stationGenre: station.genre,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          if (response.status === 401) {
            setError('Please log in to manage favorites');
          } else {
            setError(data.error || 'Failed to add favorite');
          }
          return;
        }

        setIsFavorited(true);
      }
    } catch (err) {
      console.error('[useRadioStationFavorite] Error:', err);
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsLoading(false);
    }
  }, [isFavorited, station]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { isFavorited, isLoading, error, toggle, clearError };
}
