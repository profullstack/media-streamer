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

/**
 * Radio station from search/API
 */
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

/**
 * Radio stream
 */
export interface RadioStream {
  url: string;
  mediaType: 'mp3' | 'aac' | 'hls' | 'flash' | 'ogg' | 'html';
  bitrate?: number;
  isDirect: boolean;
}

/**
 * Favorite station from DB
 */
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
  search: (query: string) => Promise<void>;
  clearResults: () => void;
}

/**
 * Hook for searching radio stations
 */
export function useRadioSearch(debounceMs: number = 300): UseRadioSearchReturn {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (query: string) => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setStations([]);
      setError(null);
      return;
    }

    // Debounce the search
    debounceTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      try {
        const response = await fetch(`/api/radio?q=${encodeURIComponent(query.trim())}`);
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
    }, debounceMs);
  }, [debounceMs]);

  const clearResults = useCallback(() => {
    setStations([]);
    setError(null);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return { stations, isSearching, error, search, clearResults };
}

// ============================================================================
// useRadioStream Hook
// ============================================================================

interface UseRadioStreamReturn {
  streams: RadioStream[];
  preferredStream: RadioStream | null;
  isLoading: boolean;
  error: string | null;
  getStream: (stationId: string) => Promise<void>;
}

/**
 * Hook for getting radio station stream URLs
 */
export function useRadioStream(): UseRadioStreamReturn {
  const [streams, setStreams] = useState<RadioStream[]>([]);
  const [preferredStream, setPreferredStream] = useState<RadioStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStream = useCallback(async (stationId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/radio/stream?id=${encodeURIComponent(stationId)}`);
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

/**
 * Hook for managing user's favorite radio stations list
 */
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
          // Not authenticated - expected for logged out users
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

  // Fetch on mount
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

/**
 * Hook for managing a single radio station's favorite status
 */
export function useRadioStationFavorite(
  station: RadioStation,
  initialFavorited: boolean = false
): UseRadioStationFavoriteReturn {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with initialFavorited prop
  useEffect(() => {
    setIsFavorited(initialFavorited);
  }, [initialFavorited]);

  const toggle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isFavorited) {
        // Remove from favorites
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
        // Add to favorites
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
