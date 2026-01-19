'use client';

/**
 * Favorites Hooks
 *
 * React hooks for managing favorites state and API interactions.
 * These hooks call the server-side API routes which handle Supabase operations.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TorrentFavorite, IptvChannelFavorite } from '@/lib/supabase/types';
import type { TorrentFavoriteWithDetails, IptvChannelFavoriteWithDetails } from '@/lib/favorites';

/**
 * Channel data for adding to favorites
 */
export interface ChannelFavoriteData {
  playlistId: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  channelLogo?: string;
  channelGroup?: string;
  tvgId?: string;
  tvgName?: string;
}

/**
 * Return type for single item favorite hooks
 */
interface UseFavoriteReturn {
  isFavorited: boolean;
  isLoading: boolean;
  error: string | null;
  toggle: () => Promise<void>;
}

/**
 * Return type for torrent favorites list hook
 */
interface UseTorrentFavoritesReturn {
  favorites: TorrentFavoriteWithDetails[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isFavorited: (torrentId: string) => boolean;
}

/**
 * Return type for IPTV channel favorites list hook
 */
interface UseIptvChannelFavoritesReturn {
  favorites: IptvChannelFavoriteWithDetails[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isFavorited: (playlistId: string, channelId: string) => boolean;
}

/**
 * API response types
 */
interface TorrentFavoriteResponse {
  favorite?: TorrentFavorite;
  success?: boolean;
  error?: string;
}

interface IptvChannelFavoriteResponse {
  favorite?: IptvChannelFavorite;
  success?: boolean;
  error?: string;
}

interface TorrentFavoritesListResponse {
  favorites?: TorrentFavoriteWithDetails[];
  error?: string;
}

interface IptvChannelFavoritesListResponse {
  favorites?: IptvChannelFavoriteWithDetails[];
  error?: string;
}

/**
 * Hook for managing a single torrent's favorite state
 *
 * @param torrentId - The torrent ID
 * @param initialFavorited - Initial favorite state
 * @returns Favorite state and toggle function
 */
export function useTorrentFavorite(
  torrentId: string,
  initialFavorited = false
): UseFavoriteReturn {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const method = isFavorited ? 'DELETE' : 'POST';
      const response = await fetch('/api/favorites/torrents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ torrentId }),
      });

      const data = (await response.json()) as TorrentFavoriteResponse;

      if (!response.ok) {
        setError(data.error ?? 'Failed to update favorite');
        return;
      }

      setIsFavorited(!isFavorited);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [torrentId, isFavorited]);

  return { isFavorited, isLoading, error, toggle };
}

/**
 * Hook for managing a single IPTV channel's favorite state
 *
 * @param channelData - The channel data
 * @param initialFavorited - Initial favorite state
 * @returns Favorite state and toggle function
 */
export function useIptvChannelFavorite(
  channelData: ChannelFavoriteData,
  initialFavorited = false
): UseFavoriteReturn {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when initialFavorited prop changes (e.g., when favorites are refetched)
  useEffect(() => {
    setIsFavorited(initialFavorited);
  }, [initialFavorited]);

  const toggle = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isFavorited) {
        // Remove from favorites
        const response = await fetch('/api/favorites/iptv-channels', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlistId: channelData.playlistId,
            channelId: channelData.channelId,
          }),
        });

        const data = (await response.json()) as IptvChannelFavoriteResponse;

        if (!response.ok) {
          setError(data.error ?? 'Failed to remove favorite');
          return;
        }
      } else {
        // Add to favorites
        const response = await fetch('/api/favorites/iptv-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(channelData),
        });

        const data = (await response.json()) as IptvChannelFavoriteResponse;

        if (!response.ok) {
          setError(data.error ?? 'Failed to add favorite');
          return;
        }
      }

      setIsFavorited(!isFavorited);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [channelData, isFavorited]);

  return { isFavorited, isLoading, error, toggle };
}

/**
 * Hook for fetching and managing the list of torrent favorites
 *
 * @returns Favorites list, loading state, and helper functions
 */
export function useTorrentFavorites(): UseTorrentFavoritesReturn {
  const [favorites, setFavorites] = useState<TorrentFavoriteWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/favorites/torrents');
      const data = (await response.json()) as TorrentFavoritesListResponse;

      if (!response.ok) {
        setError(data.error ?? 'Failed to fetch favorites');
        setFavorites([]);
        return;
      }

      setFavorites(data.favorites ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback(
    (torrentId: string): boolean => {
      return favorites.some((fav) => fav.torrent_id === torrentId);
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

/**
 * Hook for fetching and managing the list of IPTV channel favorites
 *
 * @param playlistId - Optional playlist ID to filter by
 * @returns Favorites list, loading state, and helper functions
 */
/**
 * Hook for managing a single file's favorite state (library favorites)
 *
 * @param fileId - The file ID from torrent_files table
 * @param initialFavorited - Initial favorite state
 * @returns Favorite state and toggle function
 */
export function useFileFavorite(
  fileId: string,
  initialFavorited = false
): UseFavoriteReturn {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const method = isFavorited ? 'DELETE' : 'POST';
      const response = await fetch('/api/library/favorites', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Failed to update favorite');
        return;
      }

      setIsFavorited(!isFavorited);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, isFavorited]);

  return { isFavorited, isLoading, error, toggle };
}

export function useIptvChannelFavorites(
  playlistId?: string
): UseIptvChannelFavoritesReturn {
  const [favorites, setFavorites] = useState<IptvChannelFavoriteWithDetails[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const url = playlistId
        ? `/api/favorites/iptv-channels?playlistId=${playlistId}`
        : '/api/favorites/iptv-channels';

      const response = await fetch(url);
      const data = (await response.json()) as IptvChannelFavoritesListResponse;

      if (!response.ok) {
        setError(data.error ?? 'Failed to fetch favorites');
        setFavorites([]);
        return;
      }

      setFavorites(data.favorites ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback(
    (pId: string, channelId: string): boolean => {
      return favorites.some(
        (fav) => fav.playlist_id === pId && fav.channel_id === channelId
      );
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
